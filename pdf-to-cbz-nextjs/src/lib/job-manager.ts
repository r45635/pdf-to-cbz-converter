import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Configuration (can be overridden via environment variables)
// These are SERVER HARD LIMITS - clients can set lower values but not exceed these
export const BATCH_CONFIG = {
  MAX_FILES: parseInt(process.env.BATCH_MAX_FILES || '50'),
  MAX_FILE_SIZE_MB: parseInt(process.env.BATCH_MAX_FILE_SIZE_MB || '500'),
  DEFAULT_EXPIRE_MINUTES: parseInt(process.env.BATCH_DEFAULT_EXPIRE_MINUTES || '60'),
  MAX_EXPIRE_MINUTES: parseInt(process.env.BATCH_MAX_EXPIRE_MINUTES || '1440'), // 24h
  CLEANUP_INTERVAL_MS: parseInt(process.env.BATCH_CLEANUP_INTERVAL_MS || '60000'), // 1 min
  SSE_HEARTBEAT_MS: parseInt(process.env.BATCH_SSE_HEARTBEAT_MS || '15000'), // 15s
  JOBS_DIR: process.env.BATCH_JOBS_DIR || '/tmp/pdf-to-cbz-jobs',
};

// Types
export interface ConversionSettings {
  dpi: number | 'auto';
  format: 'jpeg' | 'png';
  quality: number;
  expireMinutes: number;
}

export interface BatchFileResult {
  outputName: string;
  sizeMB: number;
  pageCount: number;
}

export interface BatchFile {
  id: string;
  originalName: string;
  originalSizeMB: number;
  status: 'pending' | 'analyzing' | 'converting' | 'done' | 'error';
  progress: number;
  error?: string;
  result?: BatchFileResult;
}

export interface BatchJob {
  id: string;
  createdAt: number;
  expiresAt: number;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  settings: ConversionSettings;
  files: BatchFile[];
}

export interface BatchJobManifest {
  job: BatchJob;
  version: number;
}

// Job completion status (excludes 'processing' as job_complete is sent when done)
export type JobCompletionStatus = 'completed' | 'partial' | 'failed';

// SSE Event types
export type BatchEvent =
  | { type: 'job_created'; jobId: string; totalFiles: number; expiresAt: number }
  | { type: 'file_start'; fileId: string; fileName: string; fileIndex: number; totalFiles: number }
  | { type: 'file_analyzing'; fileId: string; fileName: string }
  | { type: 'file_progress'; fileId: string; progress: number; currentPage: number; totalPages: number }
  | { type: 'file_complete'; fileId: string; fileName: string; outputName: string; sizeMB: number; pageCount: number }
  | { type: 'file_error'; fileId: string; fileName: string; error: string }
  | { type: 'job_complete'; jobId: string; status: 'completed' | 'partial' | 'failed'; successCount: number; errorCount: number }
  | { type: 'heartbeat'; timestamp: number };

/**
 * JobManager - Handles batch job creation, storage, and lifecycle
 */
class JobManager {
  private initialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the jobs directory and start cleanup
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(BATCH_CONFIG.JOBS_DIR, { recursive: true });
      this.startCleanup();
      this.initialized = true;
      console.log(`[JobManager] Initialized. Jobs dir: ${BATCH_CONFIG.JOBS_DIR}`);
    } catch (error) {
      console.error('[JobManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Create a new batch job
   */
  async createJob(
    files: Array<{ name: string; sizeMB: number }>,
    settings: Partial<ConversionSettings>
  ): Promise<BatchJob> {
    await this.init();

    const jobId = uuidv4();
    const now = Date.now();
    const expireMinutes = Math.min(
      settings.expireMinutes || BATCH_CONFIG.DEFAULT_EXPIRE_MINUTES,
      BATCH_CONFIG.MAX_EXPIRE_MINUTES
    );

    const job: BatchJob = {
      id: jobId,
      createdAt: now,
      expiresAt: now + expireMinutes * 60 * 1000,
      status: 'processing',
      settings: {
        dpi: settings.dpi || 'auto',
        format: settings.format || 'jpeg',
        quality: settings.quality || 85,
        expireMinutes,
      },
      files: files.map((f) => ({
        id: uuidv4().slice(0, 8), // Short ID for files
        originalName: f.name,
        originalSizeMB: f.sizeMB,
        status: 'pending',
        progress: 0,
      })),
    };

    // Create job directory
    const jobDir = this.getJobDir(jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Save manifest
    await this.saveManifest(job);

    console.log(`[JobManager] Created job ${jobId} with ${files.length} files`);
    return job;
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<BatchJob | null> {
    await this.init();

    try {
      const manifestPath = path.join(this.getJobDir(jobId), 'manifest.json');
      const data = await fs.readFile(manifestPath, 'utf-8');
      const manifest: BatchJobManifest = JSON.parse(data);

      // Check if expired
      if (manifest.job.expiresAt < Date.now()) {
        await this.deleteJob(jobId);
        return null;
      }

      return manifest.job;
    } catch {
      return null;
    }
  }

  /**
   * Update file status in a job
   */
  async updateFileStatus(
    jobId: string,
    fileId: string,
    update: Partial<BatchFile>
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;

    const fileIndex = job.files.findIndex((f) => f.id === fileId);
    if (fileIndex === -1) return;

    job.files[fileIndex] = { ...job.files[fileIndex], ...update };
    await this.saveManifest(job);
  }

  /**
   * Mark job as complete and update final status
   */
  async completeJob(jobId: string): Promise<BatchJob | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const successCount = job.files.filter((f) => f.status === 'done').length;
    const errorCount = job.files.filter((f) => f.status === 'error').length;

    if (errorCount === job.files.length) {
      job.status = 'failed';
    } else if (errorCount > 0) {
      job.status = 'partial';
    } else {
      job.status = 'completed';
    }

    await this.saveManifest(job);
    console.log(`[JobManager] Job ${jobId} completed: ${successCount} success, ${errorCount} errors`);
    return job;
  }

  /**
   * Save converted file to job directory
   */
  async saveConvertedFile(
    jobId: string,
    fileId: string,
    outputName: string,
    buffer: Buffer
  ): Promise<string> {
    const filePath = path.join(this.getJobDir(jobId), `${fileId}_${outputName}`);
    await fs.writeFile(filePath, buffer);
    return filePath;
  }

  /**
   * Get converted file path
   */
  async getConvertedFilePath(jobId: string, fileId: string): Promise<string | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const file = job.files.find((f) => f.id === fileId);
    if (!file || !file.result) return null;

    const filePath = path.join(this.getJobDir(jobId), `${fileId}_${file.result.outputName}`);

    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      return null;
    }
  }

  /**
   * Get all converted file paths for a job
   */
  async getAllConvertedFiles(jobId: string): Promise<Array<{ name: string; path: string }>> {
    const job = await this.getJob(jobId);
    if (!job) return [];

    const files: Array<{ name: string; path: string }> = [];

    for (const file of job.files) {
      if (file.status === 'done' && file.result) {
        const filePath = path.join(this.getJobDir(jobId), `${file.id}_${file.result.outputName}`);
        try {
          await fs.access(filePath);
          files.push({ name: file.result.outputName, path: filePath });
        } catch {
          // File doesn't exist, skip
        }
      }
    }

    return files;
  }

  /**
   * Delete a job and all its files
   */
  async deleteJob(jobId: string): Promise<void> {
    const jobDir = this.getJobDir(jobId);
    try {
      await fs.rm(jobDir, { recursive: true, force: true });
      console.log(`[JobManager] Deleted job ${jobId}`);
    } catch (error) {
      console.error(`[JobManager] Failed to delete job ${jobId}:`, error);
    }
  }

  /**
   * List all jobs (for admin/debug)
   */
  async listJobs(): Promise<BatchJob[]> {
    await this.init();

    try {
      const entries = await fs.readdir(BATCH_CONFIG.JOBS_DIR, { withFileTypes: true });
      const jobs: BatchJob[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const job = await this.getJob(entry.name);
          if (job) jobs.push(job);
        }
      }

      return jobs;
    } catch {
      return [];
    }
  }

  /**
   * Clean up expired jobs
   */
  async cleanupExpiredJobs(): Promise<number> {
    await this.init();

    let deletedCount = 0;
    try {
      const entries = await fs.readdir(BATCH_CONFIG.JOBS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const manifestPath = path.join(this.getJobDir(entry.name), 'manifest.json');
            const data = await fs.readFile(manifestPath, 'utf-8');
            const manifest: BatchJobManifest = JSON.parse(data);

            if (manifest.job.expiresAt < Date.now()) {
              await this.deleteJob(entry.name);
              deletedCount++;
            }
          } catch {
            // If we can't read manifest, check directory age
            const jobDir = this.getJobDir(entry.name);
            const stat = await fs.stat(jobDir);
            const ageMs = Date.now() - stat.mtimeMs;

            // Delete if older than max expire time
            if (ageMs > BATCH_CONFIG.MAX_EXPIRE_MINUTES * 60 * 1000) {
              await this.deleteJob(entry.name);
              deletedCount++;
            }
          }
        }
      }

      if (deletedCount > 0) {
        console.log(`[JobManager] Cleanup: deleted ${deletedCount} expired jobs`);
      }
    } catch (error) {
      console.error('[JobManager] Cleanup error:', error);
    }

    return deletedCount;
  }

  /**
   * Get remaining time for a job in minutes
   */
  getRemainingMinutes(job: BatchJob): number {
    const remaining = job.expiresAt - Date.now();
    return Math.max(0, Math.ceil(remaining / 60000));
  }

  // Private helpers

  private getJobDir(jobId: string): string {
    return path.join(BATCH_CONFIG.JOBS_DIR, jobId);
  }

  private async saveManifest(job: BatchJob): Promise<void> {
    const manifest: BatchJobManifest = { job, version: 1 };
    const manifestPath = path.join(this.getJobDir(job.id), 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private startCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredJobs().catch(console.error);
    }, BATCH_CONFIG.CLEANUP_INTERVAL_MS);

    // Run initial cleanup
    this.cleanupExpiredJobs().catch(console.error);
  }
}

// Singleton instance
export const jobManager = new JobManager();

// Helper to format SSE event
export function formatSSE(event: BatchEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// Validation helpers
export function validateBatchRequest(
  files: Array<{ name: string; size: number }>,
  clientLimits?: { maxFiles?: number; maxFileSizeMB?: number },
  expectedExtension: '.pdf' | '.cbz' = '.pdf'
): { valid: boolean; error?: string } {
  if (files.length === 0) {
    return { valid: false, error: 'No files provided' };
  }

  // Use client limits if provided, but cap at server limits
  const maxFiles = Math.min(
    clientLimits?.maxFiles || BATCH_CONFIG.MAX_FILES,
    BATCH_CONFIG.MAX_FILES
  );
  const maxFileSizeMB = Math.min(
    clientLimits?.maxFileSizeMB || BATCH_CONFIG.MAX_FILE_SIZE_MB,
    BATCH_CONFIG.MAX_FILE_SIZE_MB
  );

  if (files.length > maxFiles) {
    return { valid: false, error: `Maximum ${maxFiles} files allowed` };
  }

  const extLabel = expectedExtension === '.pdf' ? 'PDF' : 'CBZ';
  for (const file of files) {
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxFileSizeMB) {
      return { valid: false, error: `File "${file.name}" exceeds ${maxFileSizeMB}MB limit` };
    }

    if (!file.name.toLowerCase().endsWith(expectedExtension)) {
      return { valid: false, error: `File "${file.name}" is not a ${extLabel}` };
    }
  }

  // Check for duplicate names
  const names = files.map((f) => f.name.toLowerCase());
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) {
    // We allow duplicates but will add prefixes, so just warn
    console.log('[JobManager] Warning: Duplicate file names detected, will add prefixes');
  }

  return { valid: true };
}
