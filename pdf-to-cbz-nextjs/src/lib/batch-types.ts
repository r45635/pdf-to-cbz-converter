// Shared types for batch conversion frontend

export interface BatchFileState {
  id: string;
  file: File;
  originalName: string;
  originalSizeMB: number;
  status: 'pending' | 'analyzing' | 'converting' | 'done' | 'error';
  progress: number;
  currentPage?: number;
  totalPages?: number;
  error?: string;
  result?: {
    outputName: string;
    sizeMB: number;
    pageCount: number;
    downloadUrl?: string;
  };
}

export interface BatchJobState {
  jobId: string | null;
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'partial' | 'failed';
  files: BatchFileState[];
  expiresAt: number | null;
  downloadAllUrl?: string;
}

export interface BatchSettings {
  dpi: number | 'auto';
  format: 'jpeg' | 'png';
  quality: number;
  expireMinutes: number;
}

export interface BatchConfig {
  maxFiles: number;
  maxFileSizeMB: number;
  defaultExpireMinutes: number;
  maxExpireMinutes: number;
  // Server hard limits (cannot be exceeded)
  serverMaxFiles: number;
  serverMaxFileSizeMB: number;
}

// SSE Event types (matching backend)
export type BatchSSEEvent =
  | { type: 'job_created'; jobId: string; totalFiles: number; expiresAt: number }
  | { type: 'file_start'; fileId: string; fileName: string; fileIndex: number; totalFiles: number }
  | { type: 'file_analyzing'; fileId: string; fileName: string }
  | { type: 'file_progress'; fileId: string; progress: number; currentPage: number; totalPages: number }
  | { type: 'file_complete'; fileId: string; fileName: string; outputName: string; sizeMB: number; pageCount: number }
  | { type: 'file_error'; fileId: string; fileName: string; error: string }
  | { type: 'job_complete'; jobId: string; status: 'completed' | 'partial' | 'failed'; successCount: number; errorCount: number }
  | { type: 'heartbeat'; timestamp: number };

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  dpi: 'auto',
  format: 'jpeg',
  quality: 85,
  expireMinutes: 60,
};

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxFiles: 10,
  maxFileSizeMB: 100,
  defaultExpireMinutes: 60,
  maxExpireMinutes: 1440,
  serverMaxFiles: 10,
  serverMaxFileSizeMB: 100,
};
