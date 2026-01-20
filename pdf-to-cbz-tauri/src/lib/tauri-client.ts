import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PageInfo {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  widthPx: number;
  heightPx: number;
}

export interface PdfAnalysisResult {
  pageCount: number;
  pages: PageInfo[];
  recommendedDpi: number;
  pdfSizeMb: number;
  nativeDpi: number;
}

export interface CbzPageInfo {
  pageNumber: number;
  fileName: string;
  width: number;
  height: number;
  format: string;
  sizeKb: number;
}

export interface CbzAnalysisResult {
  pageCount: number;
  pages: CbzPageInfo[];
  cbzSizeMb: number;
}

export interface ConversionProgress {
  currentPage: number;
  totalPages: number;
  percentage: number;
  status: 'processing' | 'finalizing' | 'completed' | 'error';
  message?: string;
}

export type ImageFormat = 'jpeg' | 'png';

// ============================================================================
// File Operations
// ============================================================================

/**
 * Open file dialog to select a PDF file
 */
export async function selectPdfFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'PDF',
        extensions: ['pdf'],
      },
    ],
  });

  if (selected && typeof selected === 'string') {
    return selected;
  }
  return null;
}

/**
 * Open file dialog to select a CBZ file
 */
export async function selectCbzFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Comic Book Archive',
        extensions: ['cbz', 'cbr'],
      },
    ],
  });

  if (selected && typeof selected === 'string') {
    return selected;
  }
  return null;
}

/**
 * Open file dialog to select multiple PDF files for batch processing
 */
export async function selectMultiplePdfFiles(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [
      {
        name: 'PDF',
        extensions: ['pdf'],
      },
    ],
  });

  if (Array.isArray(selected)) {
    return selected;
  }
  return [];
}

/**
 * Save file dialog to choose where to save the output CBZ
 */
export async function saveCbzFile(defaultName: string): Promise<string | null> {
  const selected = await save({
    defaultPath: defaultName,
    filters: [
      {
        name: 'Comic Book Archive',
        extensions: ['cbz'],
      },
    ],
  });

  return selected;
}

// ============================================================================
// PDF Operations
// ============================================================================

/**
 * Analyze a PDF file
 */
export async function analyzePdf(path: string): Promise<PdfAnalysisResult> {
  return invoke<PdfAnalysisResult>('analyze_pdf', { path });
}

/**
 * Generate a preview image for a specific PDF page
 */
export async function generatePreview(
  path: string,
  page: number,
  dpi: number,
  format: ImageFormat,
  quality: number
): Promise<Uint8Array> {
  const result = await invoke<number[]>('generate_preview', {
    path,
    page,
    dpi,
    format,
    quality,
  });
  return new Uint8Array(result);
}

/**
 * Convert PDF to CBZ with progress tracking
 */
export async function convertPdfToCbz(
  path: string,
  dpi: number,
  format: ImageFormat,
  quality: number,
  onProgress?: (progress: ConversionProgress) => void
): Promise<Uint8Array> {
  // Setup progress listener
  let unlisten: (() => void) | undefined;
  
  if (onProgress) {
    unlisten = await listen<ConversionProgress>('conversion-progress', (event) => {
      onProgress(event.payload);
    });
  }

  try {
    const result = await invoke<number[]>('convert_pdf_to_cbz', {
      path,
      dpi,
      format,
      quality,
    });
    
    return new Uint8Array(result);
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}

/**
 * Optimize PDF with automatic settings
 */
export async function optimizePdf(
  path: string,
  onProgress?: (progress: ConversionProgress) => void
): Promise<Uint8Array> {
  // Setup progress listener
  let unlisten: (() => void) | undefined;
  
  if (onProgress) {
    unlisten = await listen<ConversionProgress>('conversion-progress', (event) => {
      onProgress(event.payload);
    });
  }

  try {
    const result = await invoke<number[]>('optimize_pdf', { path });
    return new Uint8Array(result);
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}

// ============================================================================
// CBZ Operations
// ============================================================================

/**
 * Analyze a CBZ file
 */
export async function analyzeCbz(path: string): Promise<CbzAnalysisResult> {
  return invoke<CbzAnalysisResult>('analyze_cbz', { path });
}

/**
 * Generate a preview from a CBZ file
 */
export async function generateCbzPreview(
  path: string,
  page: number,
  format: ImageFormat,
  quality: number
): Promise<Uint8Array> {
  const result = await invoke<number[]>('generate_cbz_preview', {
    path,
    page,
    format,
    quality,
  });
  return new Uint8Array(result);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert Uint8Array to base64 data URL for displaying images
 */
export function arrayBufferToDataUrl(buffer: Uint8Array, mimeType: string = 'image/jpeg'): string {
  // Process in chunks to avoid "Maximum call stack size exceeded" error
  const chunkSize = 65536;
  let binary = '';

  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Save data to file
 */
export async function saveDataToFile(data: Uint8Array, path: string): Promise<void> {
  // Use Tauri's fs plugin to write the file
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  await writeFile(path, data);
}
