import sharp from 'sharp';
import archiver from 'archiver';
import { PDFDocument } from 'pdf-lib';
import { PassThrough } from 'stream';

export interface ConversionOptions {
  dpi?: number | null;
  format?: 'jpeg' | 'png';
  quality?: number;
  targetSizeMB?: number | null; // Target file size
}

export interface AnalysisResult {
  pageCount: number;
  pages: {
    pageNumber: number;
    widthPt: number;
    heightPt: number;
    widthPx: number;
    heightPx: number;
  }[];
  recommendedDpi: number;
  pdfSizeMB: number;
  nativeDpi: number; // DPI that would match PDF quality
}

export interface ConversionProgress {
  currentPage: number;
  totalPages: number;
  percentage: number;
  status: 'processing' | 'completed' | 'error';
  message?: string;
}

const TARGET_PIXEL_WIDTH = 2000;
const MIN_DPI = 72;
const MAX_DPI = 600;

/**
 * Calculate optimal DPI based on page dimensions for target width
 */
export function calculateOptimalDpi(widthPt: number): number {
  const widthInches = widthPt / 72;
  const calculatedDpi = Math.round(TARGET_PIXEL_WIDTH / widthInches);
  return Math.max(Math.min(calculatedDpi, MAX_DPI), MIN_DPI);
}

/**
 * Calculate DPI that would produce similar file size to source PDF
 * Based on the assumption that PDF already has optimal compression
 */
function calculateNativeDpi(pdfSizeBytes: number, pageCount: number, avgWidthPt: number, avgHeightPt: number): number {
  // Average bytes per page in the PDF
  const bytesPerPage = pdfSizeBytes / pageCount;

  // For JPEG at 85% quality with comic book artwork (detailed color images),
  // we estimate ~0.30-0.35 bytes per pixel. This is higher than simple images
  // because comics have lots of detail, gradients, and color variation.
  const bytesPerPixel = 0.32;

  // Calculate total pixels per page that would give us similar size
  const targetPixelsPerPage = bytesPerPage / bytesPerPixel;

  // Current aspect ratio
  const aspectRatio = avgHeightPt / avgWidthPt;

  // Solve for width: width * height = targetPixels, height = width * aspectRatio
  // width * width * aspectRatio = targetPixels
  // width = sqrt(targetPixels / aspectRatio)
  const targetWidthPx = Math.sqrt(targetPixelsPerPage / aspectRatio);

  // Calculate DPI: width_px = width_pt * (dpi / 72)
  // dpi = width_px * 72 / width_pt
  const nativeDpi = Math.round((targetWidthPx * 72) / avgWidthPt);

  return Math.max(Math.min(nativeDpi, MAX_DPI), MIN_DPI);
}

/**
 * Estimate output size based on parameters
 */
export function estimateOutputSize(
  pages: AnalysisResult['pages'],
  dpi: number,
  format: 'jpeg' | 'png',
  quality: number,
  recommendedDpi: number
): number {
  const scale = dpi / recommendedDpi;

  let totalPixels = 0;
  for (const page of pages) {
    const widthPx = page.widthPx * scale;
    const heightPx = page.heightPx * scale;
    totalPixels += widthPx * heightPx;
  }

  let bytesPerPixel: number;
  if (format === 'png') {
    bytesPerPixel = 1.5; // PNG with comic art
  } else {
    // JPEG: quality affects size significantly for detailed comic artwork
    // At 85% quality: ~0.32 bytes/pixel, at 100%: ~0.55, at 50%: ~0.12
    bytesPerPixel = 0.05 + (quality / 100) * 0.50;
  }

  return (totalPixels * bytesPerPixel) / (1024 * 1024);
}

/**
 * Analyze PDF and return page dimensions and recommendations
 */
export async function analyzePdf(pdfBuffer: Buffer): Promise<AnalysisResult> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  const pages: AnalysisResult['pages'] = [];
  const pdfSizeMB = pdfBuffer.length / (1024 * 1024);

  let maxWidthPt = 0;
  let totalWidthPt = 0;
  let totalHeightPt = 0;

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();

    if (width > maxWidthPt) {
      maxWidthPt = width;
    }

    totalWidthPt += width;
    totalHeightPt += height;

    const recommendedDpi = calculateOptimalDpi(width);
    const scale = recommendedDpi / 72;

    pages.push({
      pageNumber: i + 1,
      widthPt: Math.round(width),
      heightPt: Math.round(height),
      widthPx: Math.round(width * scale),
      heightPx: Math.round(height * scale),
    });
  }

  const recommendedDpi = calculateOptimalDpi(maxWidthPt);
  const avgWidthPt = totalWidthPt / pageCount;
  const avgHeightPt = totalHeightPt / pageCount;

  // Calculate native DPI that would match PDF file size
  const nativeDpi = calculateNativeDpi(pdfBuffer.length, pageCount, avgWidthPt, avgHeightPt);

  return {
    pageCount,
    pages,
    recommendedDpi,
    pdfSizeMB,
    nativeDpi,
  };
}

/**
 * Render PDF pages to images using pdf-to-img
 */
async function renderPages(
  pdfBuffer: Buffer,
  dpi: number
): Promise<AsyncGenerator<Buffer, void, unknown>> {
  const { pdf } = await import('pdf-to-img');
  const scale = dpi / 72;
  return pdf(pdfBuffer, { scale });
}

/**
 * Generate preview of a single page
 */
export async function generatePreview(
  pdfBuffer: Buffer,
  pageNumber: number,
  dpi: number,
  format: 'jpeg' | 'png',
  quality: number
): Promise<Buffer> {
  const pages = await renderPages(pdfBuffer, dpi);

  let currentPage = 0;
  for await (const pageImage of pages) {
    currentPage++;
    if (currentPage === pageNumber) {
      if (format === 'jpeg') {
        return await sharp(pageImage)
          .jpeg({ quality })
          .toBuffer();
      } else {
        return await sharp(pageImage)
          .png({ compressionLevel: 6 })
          .toBuffer();
      }
    }
  }

  throw new Error(`Page ${pageNumber} not found`);
}

/**
 * Convert PDF to CBZ with progress callback
 */
export async function convertPdfToCbz(
  pdfBuffer: Buffer,
  options: ConversionOptions = {},
  onProgress?: (progress: ConversionProgress) => void
): Promise<Buffer> {
  const {
    format = 'jpeg',
    quality = 85,
  } = options;

  // Analyze PDF to get page count and optimal DPI
  const analysis = await analyzePdf(pdfBuffer);

  // Use provided DPI, or native DPI if targeting similar size, or recommended DPI
  let dpi: number;
  if (options.dpi != null) {
    dpi = options.dpi;
  } else if (options.targetSizeMB != null) {
    // Calculate DPI to match target size
    dpi = analysis.nativeDpi;
  } else {
    dpi = analysis.recommendedDpi;
  }

  const totalPages = analysis.pageCount;

  // Create archive in memory
  const chunks: Buffer[] = [];
  const passThrough = new PassThrough();

  passThrough.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const archive = archiver('zip', {
    zlib: { level: 6 },
  });

  archive.pipe(passThrough);

  // Render all pages
  const pages = await renderPages(pdfBuffer, dpi);
  let pageNum = 0;

  for await (const pageImage of pages) {
    pageNum++;

    if (onProgress) {
      onProgress({
        currentPage: pageNum,
        totalPages,
        percentage: Math.round((pageNum / totalPages) * 100),
        status: 'processing',
        message: `Processing page ${pageNum} of ${totalPages}`,
      });
    }

    try {
      const pageNumStr = pageNum.toString().padStart(3, '0');
      let imageBuffer: Buffer;
      let filename: string;

      if (format === 'jpeg') {
        imageBuffer = await sharp(pageImage)
          .jpeg({ quality })
          .toBuffer();
        filename = `page_${pageNumStr}.jpg`;
      } else {
        imageBuffer = await sharp(pageImage)
          .png({ compressionLevel: 6 })
          .toBuffer();
        filename = `page_${pageNumStr}.png`;
      }

      archive.append(imageBuffer, { name: filename });
    } catch (error) {
      console.error(`Error processing page ${pageNum}:`, error);
      throw new Error(`Failed to process page ${pageNum}`);
    }
  }

  // Finalize archive and wait for completion
  await new Promise<void>((resolve, reject) => {
    archive.on('error', reject);
    passThrough.on('end', resolve);
    archive.finalize();
  });

  if (onProgress) {
    onProgress({
      currentPage: totalPages,
      totalPages,
      percentage: 100,
      status: 'completed',
      message: 'Conversion completed successfully',
    });
  }

  return Buffer.concat(chunks);
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): ConversionOptions {
  return {
    dpi: null,
    format: 'jpeg',
    quality: 85,
    targetSizeMB: null,
  };
}
