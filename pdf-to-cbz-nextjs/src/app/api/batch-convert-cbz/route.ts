import { NextRequest } from 'next/server';
import {
  jobManager,
  formatSSE,
  validateBatchRequest,
  BATCH_CONFIG,
  BatchEvent,
  ConversionSettings,
  JobCompletionStatus,
} from '@/lib/job-manager';
import { convertCbzToPdf, analyzeCbz, CbzToPdfOptions } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: BatchEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch {
          // Stream closed
        }
      };

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        sendEvent({ type: 'heartbeat', timestamp: Date.now() });
      }, BATCH_CONFIG.SSE_HEARTBEAT_MS);

      try {
        // Parse form data
        const formData = await request.formData();

        // Extract settings
        const qualityStr = formData.get('quality') as string | null;
        const expireMinutesStr = formData.get('expireMinutes') as string | null;

        const settings: Partial<ConversionSettings> = {
          quality: qualityStr ? parseInt(qualityStr, 10) : 85,
          expireMinutes: expireMinutesStr ? parseInt(expireMinutesStr, 10) : BATCH_CONFIG.DEFAULT_EXPIRE_MINUTES,
        };

        // Get all files from form data
        const files: File[] = [];
        for (const [key, value] of formData.entries()) {
          if (key.startsWith('file') && value instanceof File) {
            files.push(value);
          }
        }

        // Validate request (check file count, size, and extension)
        const validation = validateBatchRequest(
          files.map((f) => ({ name: f.name, size: f.size })),
          undefined,
          '.cbz'
        );

        if (!validation.valid) {
          sendEvent({
            type: 'job_complete',
            jobId: '',
            status: 'failed',
            successCount: 0,
            errorCount: files.length,
          });
          clearInterval(heartbeatInterval);
          controller.close();
          return;
        }

        // Create job
        const job = await jobManager.createJob(
          files.map((f) => ({
            name: f.name,
            sizeMB: f.size / (1024 * 1024),
          })),
          settings
        );

        sendEvent({
          type: 'job_created',
          jobId: job.id,
          totalFiles: job.files.length,
          expiresAt: job.expiresAt,
        });

        // Process each file sequentially
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const batchFile = job.files[i];

          sendEvent({
            type: 'file_start',
            fileId: batchFile.id,
            fileName: batchFile.originalName,
            fileIndex: i,
            totalFiles: files.length,
          });

          try {
            // Update status to analyzing
            await jobManager.updateFileStatus(job.id, batchFile.id, {
              status: 'analyzing',
              progress: 0,
            });

            sendEvent({
              type: 'file_analyzing',
              fileId: batchFile.id,
              fileName: batchFile.originalName,
            });

            // Read file buffer
            const arrayBuffer = await file.arrayBuffer();
            const cbzBuffer = Buffer.from(arrayBuffer);

            // Analyze CBZ
            const analysis = await analyzeCbz(cbzBuffer);

            // Update status to converting
            await jobManager.updateFileStatus(job.id, batchFile.id, {
              status: 'converting',
              progress: 5,
            });

            // Convert CBZ to PDF
            const conversionOptions: CbzToPdfOptions = {
              quality: settings.quality || 85,
            };

            const pdfBuffer = await convertCbzToPdf(
              cbzBuffer,
              conversionOptions,
              (progress) => {
                // Send progress updates
                sendEvent({
                  type: 'file_progress',
                  fileId: batchFile.id,
                  progress: Math.round(5 + (progress.percentage * 0.9)), // 5-95%
                  currentPage: progress.currentPage,
                  totalPages: progress.totalPages,
                });
              }
            );

            // Generate output filename
            const outputName = file.name.replace(/\.cbz$/i, '.pdf');

            // Save to disk
            await jobManager.saveConvertedFile(
              job.id,
              batchFile.id,
              outputName,
              pdfBuffer
            );

            // Update file status
            const sizeMB = pdfBuffer.length / (1024 * 1024);
            await jobManager.updateFileStatus(job.id, batchFile.id, {
              status: 'done',
              progress: 100,
              result: {
                outputName,
                sizeMB: Math.round(sizeMB * 10) / 10,
                pageCount: analysis.pageCount,
              },
            });

            sendEvent({
              type: 'file_complete',
              fileId: batchFile.id,
              fileName: batchFile.originalName,
              outputName,
              sizeMB: Math.round(sizeMB * 10) / 10,
              pageCount: analysis.pageCount,
            });

            successCount++;

            // Force garbage collection if available
            if (global.gc) {
              global.gc();
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await jobManager.updateFileStatus(job.id, batchFile.id, {
              status: 'error',
              progress: 0,
              error: errorMessage,
            });

            sendEvent({
              type: 'file_error',
              fileId: batchFile.id,
              fileName: batchFile.originalName,
              error: errorMessage,
            });

            errorCount++;
            console.error(`[BatchConvertCBZ] Error processing ${batchFile.originalName}:`, error);
          }
        }

        // Complete the job
        const completedJob = await jobManager.completeJob(job.id);

        // Determine final status
        let finalStatus: JobCompletionStatus = 'failed';
        if (completedJob) {
          if (completedJob.status === 'completed' || completedJob.status === 'partial' || completedJob.status === 'failed') {
            finalStatus = completedJob.status;
          }
        }

        sendEvent({
          type: 'job_complete',
          jobId: job.id,
          status: finalStatus,
          successCount,
          errorCount,
        });
      } catch (error) {
        console.error('[BatchConvertCBZ] Fatal error:', error);
        sendEvent({
          type: 'job_complete',
          jobId: '',
          status: 'failed',
          successCount: 0,
          errorCount: 0,
        });
      } finally {
        clearInterval(heartbeatInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// GET endpoint to check batch configuration limits
export async function GET() {
  return Response.json({
    serverMaxFiles: BATCH_CONFIG.MAX_FILES,
    serverMaxFileSizeMB: BATCH_CONFIG.MAX_FILE_SIZE_MB,
    maxFiles: BATCH_CONFIG.MAX_FILES,
    maxFileSizeMB: BATCH_CONFIG.MAX_FILE_SIZE_MB,
    defaultExpireMinutes: BATCH_CONFIG.DEFAULT_EXPIRE_MINUTES,
    maxExpireMinutes: BATCH_CONFIG.MAX_EXPIRE_MINUTES,
  });
}
