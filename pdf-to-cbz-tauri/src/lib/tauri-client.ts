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
 * Open file dialog to select a PDF file (single or multiple)
 */
export async function selectPdfFile(multiple = false): Promise<string | string[] | null> {
  const selected = await open({
    multiple,
    filters: [
      {
        name: 'PDF',
        extensions: ['pdf'],
      },
    ],
  });

  if (multiple && Array.isArray(selected)) {
    return selected;
  }
  if (!multiple && typeof selected === 'string') {
    return selected;
  }
  return null;
}

/**
 * Open file dialog to select a CBZ file (single or multiple)
 */
export async function selectCbzFile(multiple = false): Promise<string | string[] | null> {
  const selected = await open({
    multiple,
    filters: [
      {
        name: 'Comic Book Archive',
        extensions: ['cbz', 'cbr'],
      },
    ],
  });

  if (multiple && Array.isArray(selected)) {
    return selected;
  }
  if (!multiple && typeof selected === 'string') {
    return selected;
  }
  return null;
}

/**
 * Select a directory/folder
 */
export async function selectDirectory(defaultPath?: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
  });

  return typeof selected === 'string' ? selected : null;
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

/**
 * Save file dialog to choose where to save the output PDF
 */
export async function savePdfFile(defaultName: string): Promise<string | null> {
  const selected = await save({
    defaultPath: defaultName,
    filters: [
      {
        name: 'PDF',
        extensions: ['pdf'],
      },
    ],
  });

  return selected;
}

/**
 * Save the last converted PDF to a user-selected location
 */
export async function saveLastPdf(path: string): Promise<void> {
  return invoke<void>('save_last_pdf', { path });
}

/**
 * Open a file with the default system application
 */
export async function openFile(path: string): Promise<void> {
  return invoke<void>('open_file_with_default_app', { path });
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
  onProgress?: (progress: ConversionProgress) => void,
  directExtract?: boolean  // New optional parameter
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
      directExtract: directExtract ?? false,  // Default to false
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

/**
 * Convert CBZ/CBR to PDF with progress tracking
 * Returns a magic marker [0xFF, 0xFE, 0xFD, 0xFC] if the PDF is too large for IPC
 * In that case, use saveLastPdf() to save it to disk
 */
export async function convertCbzToPdf(
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
    console.log('[convertCbzToPdf] Calling invoke...');
    const result = await invoke<number[]>('convert_cbz_to_pdf', {
      path,
    });
    console.log('[convertCbzToPdf] Invoke returned, length:', result.length);

    // Wait a bit for the final progress event to be received
    await new Promise(resolve => setTimeout(resolve, 100));

    const data = new Uint8Array(result);
    console.log('[convertCbzToPdf] Converted to Uint8Array, size:', data.length);
    
    return data;
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
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

/**
 * Get file size in bytes
 */
export async function getFileSize(path: string): Promise<number> {
  try {
    const size = await invoke<number>('get_file_size', { path });
    return size;
  } catch (err) {
    console.error('[getFileSize] Error:', err);
    return 0;
  }
}

/**
 * Cancel ongoing conversion
 */
export async function cancelConversion(): Promise<void> {
  try {
    await invoke('cancel_conversion');
    console.log('[cancelConversion] Cancellation requested');
  } catch (err) {
    console.error('[cancelConversion] Error:', err);
  }
}
