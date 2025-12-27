import { NextRequest } from 'next/server';
import { convertPdfToCbzDirect, analyzePdf } from '@/lib/pdf-converter';

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

        if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
          send({ type: 'error', message: 'Invalid PDF file' });
          controller.close();
          return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        const originalSizeMB = pdfBuffer.length / (1024 * 1024);

        send({ type: 'status', message: 'Analyzing PDF...', progress: 5 });

        const analysis = await analyzePdf(pdfBuffer);
        send({
          type: 'analysis',
          data: { ...analysis, originalSizeMB },
          progress: 10,
        });

        send({ type: 'status', message: 'Extracting images directly from PDF...', progress: 15 });

        const cbzBuffer = await convertPdfToCbzDirect(pdfBuffer, (progress) => {
          const pct = 15 + Math.round(progress.percentage * 0.8);
          send({
            type: 'progress',
            currentPage: progress.currentPage,
            totalPages: progress.totalPages,
            message: progress.message,
            progress: pct,
          });
        });

        const outputSizeMB = cbzBuffer.length / (1024 * 1024);
        const sizeRatio = outputSizeMB / originalSizeMB;

        // Convert to base64 for download
        const base64 = cbzBuffer.toString('base64');

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
