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
): Promise<AsyncIterable<Buffer>> {
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

export interface TestResult {
  dpi: number;
  format: 'jpeg' | 'png';
  quality: number;
  samplePages: number[];  // Page numbers sampled (1-indexed)
  samplePageSizes: number[];  // Size in KB for each sampled page
  avgPageSizeKB: number;
  estimatedSizeMB: number;
  renderTimeMs: number;
}

export interface OptimalParams {
  dpi: number;
  format: 'jpeg' | 'png';
  quality: number;
  estimatedSizeMB: number;
  sizeRatio: number;
  qualityScore: number;
  reason: string;
}

/**
 * Test conversion with specific parameters on sample pages
 * Returns estimated full conversion size based on samples
 *
 * Uses pages at 20%, 40%, 60% of the document for better representation
 * (avoids covers and back pages which are often different)
 */
export async function testConversionParams(
  pdfBuffer: Buffer,
  configs: Array<{dpi: number; format: 'jpeg' | 'png'; quality: number}>,
  analysis: AnalysisResult
): Promise<TestResult[]> {
  const { pdf } = await import('pdf-to-img');
  const results: TestResult[] = [];

  // Select sample pages at 20%, 40%, 60% for better representation
  // Avoids first/last pages which are often covers with different content
  const pageCount = analysis.pageCount;
  const sampleIndices: number[] = [];

  if (pageCount <= 5) {
    // Test all pages if 5 or fewer
    for (let i = 0; i < pageCount; i++) sampleIndices.push(i);
  } else {
    // Sample at 20%, 40%, 60% of the document
    sampleIndices.push(Math.floor(pageCount * 0.2));
    sampleIndices.push(Math.floor(pageCount * 0.4));
    sampleIndices.push(Math.floor(pageCount * 0.6));
  }

  for (const config of configs) {
    const startTime = Date.now();
    const sampleSizes: number[] = [];

    try {
      const scale = config.dpi / 72;
      const pages = await pdf(pdfBuffer, { scale });

      let pageIndex = 0;
      for await (const pageImage of pages) {
        if (sampleIndices.includes(pageIndex)) {
          let imageBuffer: Buffer;

          if (config.format === 'jpeg') {
            imageBuffer = await sharp(pageImage)
              .jpeg({ quality: config.quality })
              .toBuffer();
          } else {
            imageBuffer = await sharp(pageImage)
              .png({ compressionLevel: 6 })
              .toBuffer();
          }

          sampleSizes.push(imageBuffer.length);
        }
        pageIndex++;

        // Stop early once we have all samples
        if (sampleSizes.length >= sampleIndices.length) break;
      }

      const renderTimeMs = Date.now() - startTime;
      const avgPageSizeBytes = sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length;
      const avgPageSizeKB = avgPageSizeBytes / 1024;
      const estimatedSizeMB = (avgPageSizeBytes * pageCount) / (1024 * 1024);

      results.push({
        dpi: config.dpi,
        format: config.format,
        quality: config.quality,
        samplePages: sampleIndices.map(i => i + 1), // Convert to 1-indexed
        samplePageSizes: sampleSizes.map(s => Math.round(s / 1024)), // KB
        avgPageSizeKB: Math.round(avgPageSizeKB),
        estimatedSizeMB: Math.round(estimatedSizeMB * 10) / 10,
        renderTimeMs,
      });
    } catch (error) {
      console.error(`Test failed for config DPI=${config.dpi}, format=${config.format}:`, error);
      // Skip failed configs
    }
  }

  return results;
}

/**
 * Find optimal parameters based on test results
 * Criteria: Best quality score while keeping size close to original
 */
export function findOptimalParams(
  results: Array<TestResult & { sizeRatio: number; qualityScore: number }>,
  originalSizeMB: number,
  nativeDpi: number
): OptimalParams {
  if (results.length === 0) {
    // Fallback defaults
    return {
      dpi: nativeDpi,
      format: 'jpeg',
      quality: 85,
      estimatedSizeMB: originalSizeMB,
      sizeRatio: 1.0,
      qualityScore: 100,
      reason: 'Default parameters (no test results)',
    };
  }

  // Sort by quality score, then by size proximity to original
  const sorted = [...results].sort((a, b) => {
    // Prefer higher quality score
    if (Math.abs(a.qualityScore - b.qualityScore) > 5) {
      return b.qualityScore - a.qualityScore;
    }
    // Among similar quality, prefer size closest to original
    return Math.abs(a.sizeRatio - 1) - Math.abs(b.sizeRatio - 1);
  });

  // Find best match: high quality (>= 90) AND size close to original (0.8x - 1.2x)
  let best = sorted.find(r =>
    r.qualityScore >= 90 &&
    r.sizeRatio >= 0.7 &&
    r.sizeRatio <= 1.3
  );

  // If no ideal match, find best quality with acceptable size
  if (!best) {
    best = sorted.find(r => r.qualityScore >= 85 && r.sizeRatio <= 1.5);
  }

  // Fallback to highest quality
  if (!best) {
    best = sorted[0];
  }

  // Determine reason
  let reason: string;
  if (best.sizeRatio >= 0.9 && best.sizeRatio <= 1.1) {
    reason = `Taille identique au PDF (${Math.round(best.sizeRatio * 100)}%), qualite ${best.qualityScore}%`;
  } else if (best.sizeRatio < 0.9) {
    reason = `Reduction de ${Math.round((1 - best.sizeRatio) * 100)}%, qualite ${best.qualityScore}%`;
  } else {
    reason = `Meilleur compromis trouve, qualite ${best.qualityScore}%`;
  }

  return {
    dpi: best.dpi,
    format: best.format,
    quality: best.quality,
    estimatedSizeMB: best.estimatedSizeMB,
    sizeRatio: best.sizeRatio,
    qualityScore: best.qualityScore,
    reason,
  };
}
