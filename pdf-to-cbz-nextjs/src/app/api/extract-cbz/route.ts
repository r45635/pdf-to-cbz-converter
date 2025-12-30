import { NextRequest } from 'next/server';
import { convertCbzToPdfDirect, analyzeCbz } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file || !file.name.toLowerCase().endsWith('.cbz')) {
          send({ type: 'error', message: 'Invalid CBZ file' });
          controller.close();
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const cbzBuffer = Buffer.from(arrayBuffer);
        const originalSizeMB = cbzBuffer.length / (1024 * 1024);

        send({ type: 'status', message: 'Analyzing CBZ...', progress: 5 });

        const analysis = await analyzeCbz(cbzBuffer);
        send({
          type: 'analysis',
          data: { ...analysis, originalSizeMB },
          progress: 10,
        });

        send({ type: 'status', message: 'Embedding images directly into PDF...', progress: 15 });

        const pdfBuffer = await convertCbzToPdfDirect(cbzBuffer, (progress) => {
          const pct = 15 + Math.round(progress.percentage * 0.8);
          send({
            type: 'progress',
            currentPage: progress.currentPage,
            totalPages: progress.totalPages,
            message: progress.message,
            progress: pct,
          });
        });

        const outputSizeMB = pdfBuffer.length / (1024 * 1024);
        const sizeRatio = outputSizeMB / originalSizeMB;

        // Convert to base64 for download
        const base64 = pdfBuffer.toString('base64');

        send({
          type: 'complete',
          originalSizeMB: Math.round(originalSizeMB * 10) / 10,
          outputSizeMB: Math.round(outputSizeMB * 10) / 10,
          sizeRatio: Math.round(sizeRatio * 100) / 100,
          pageCount: analysis.pageCount,
          method: 'direct',
          data: base64,
          progress: 100,
        });
      } catch (error) {
        send({
          type: 'error',
          message: `Extraction failed: ${error}`,
          progress: 0,
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
