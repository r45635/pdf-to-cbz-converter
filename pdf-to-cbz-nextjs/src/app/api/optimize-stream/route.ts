import { NextRequest } from 'next/server';
import { analyzePdf } from '@/lib/pdf-converter';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const mode = formData.get('mode') as string || 'balanced';

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return new Response(JSON.stringify({ error: 'Invalid PDF file' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfBuffer = Buffer.from(arrayBuffer);

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 1: Analyze PDF
        send({ type: 'status', message: 'Analyzing PDF...', progress: 5 });
        const analysis = await analyzePdf(pdfBuffer);
        const originalSizeMB = pdfBuffer.length / (1024 * 1024);
        const nativeDpi = analysis.nativeDpi;

        send({
          type: 'analysis',
          data: { ...analysis, originalSizeMB },
          progress: 10,
        });

        // Step 2: Generate test configurations
        let dpiValues: number[];
        let qualityValues: number[];

        switch (mode) {
          case 'quick':
            dpiValues = [
              Math.max(72, nativeDpi - 30),
              nativeDpi,
              Math.min(400, nativeDpi + 30),
            ];
            qualityValues = [80, 85, 90];
            break;
          case 'thorough':
            dpiValues = [
              Math.max(72, nativeDpi - 50),
              Math.max(72, nativeDpi - 25),
              nativeDpi,
              nativeDpi + 25,
              Math.min(400, nativeDpi + 50),
            ];
            qualityValues = [75, 80, 85, 90, 95];
            break;
          default: // balanced
            dpiValues = [
              Math.max(72, nativeDpi - 25),
              nativeDpi,
              Math.min(400, nativeDpi + 25),
            ];
            qualityValues = [80, 85, 90];
        }

        // Remove duplicates and sort
        dpiValues = [...new Set(dpiValues)].sort((a, b) => a - b);

        const testConfigs: Array<{dpi: number; format: 'jpeg' | 'png'; quality: number}> = [];
        for (const dpi of dpiValues) {
          for (const quality of qualityValues) {
            testConfigs.push({ dpi, format: 'jpeg', quality });
          }
        }
        // Add PNG for native DPI only
        testConfigs.push({ dpi: nativeDpi, format: 'png', quality: 100 });

        send({
          type: 'status',
          message: `Testing ${testConfigs.length} configurations...`,
          totalConfigs: testConfigs.length,
          progress: 15,
        });

        // Step 3: Determine sample pages (20%, 40%, 60%)
        const pageCount = analysis.pageCount;
        const sampleIndices: number[] = [];

        if (pageCount <= 5) {
          for (let i = 0; i < pageCount; i++) sampleIndices.push(i);
        } else {
          sampleIndices.push(Math.floor(pageCount * 0.2));
          sampleIndices.push(Math.floor(pageCount * 0.4));
          sampleIndices.push(Math.floor(pageCount * 0.6));
        }

        const samplePages = sampleIndices.map(i => i + 1);
        send({
          type: 'status',
          message: `Sampling pages: ${samplePages.join(', ')}`,
          samplePages,
          progress: 18,
        });

        // Step 4: Extract sample pages ONCE at max DPI
        const { pdf } = await import('pdf-to-img');
        const maxDpi = Math.max(...dpiValues);

        send({
          type: 'status',
          message: `Extracting ${sampleIndices.length} sample pages at ${maxDpi} DPI...`,
          progress: 20,
        });

        const maxScale = maxDpi / 72;
        const pdfPages = await pdf(pdfBuffer, { scale: maxScale });

        // Extract only the sample pages
        const sampleImages: Array<{ pageNum: number; image: Buffer; width: number; height: number }> = [];
        let pageIndex = 0;

        for await (const pageImage of pdfPages) {
          if (sampleIndices.includes(pageIndex)) {
            // Get image dimensions
            const metadata = await sharp(pageImage).metadata();
            sampleImages.push({
              pageNum: pageIndex + 1,
              image: pageImage,
              width: metadata.width || 0,
              height: metadata.height || 0,
            });

            send({
              type: 'status',
              message: `Extracted page ${pageIndex + 1}...`,
              progress: 20 + Math.floor((sampleImages.length / sampleIndices.length) * 15),
            });
          }
          pageIndex++;
          if (sampleImages.length >= sampleIndices.length) break;
        }

        send({
          type: 'status',
          message: `Testing ${testConfigs.length} configurations...`,
          progress: 35,
        });

        // Step 5: Test each configuration by resizing/recompressing the extracted images
        const results: Array<{
          dpi: number;
          format: 'jpeg' | 'png';
          quality: number;
          samplePages: number[];
          samplePageSizes: number[];
          avgPageSizeKB: number;
          estimatedSizeMB: number;
          sizeRatio: number;
          qualityScore: number;
        }> = [];

        for (let i = 0; i < testConfigs.length; i++) {
          const config = testConfigs[i];
          const progressPercent = 35 + Math.floor((i / testConfigs.length) * 55);

          send({
            type: 'testing',
            current: i + 1,
            total: testConfigs.length,
            config: config,
            message: `Testing DPI ${config.dpi}, ${config.format.toUpperCase()} Q${config.quality}%`,
            progress: progressPercent,
          });

          try {
            const sampleSizes: number[] = [];
            const scaleFactor = config.dpi / maxDpi;

            for (const sample of sampleImages) {
              const newWidth = Math.round(sample.width * scaleFactor);
              const newHeight = Math.round(sample.height * scaleFactor);

              let imageBuffer: Buffer;
              const resized = sharp(sample.image).resize(newWidth, newHeight);

              if (config.format === 'jpeg') {
                imageBuffer = await resized.jpeg({ quality: config.quality }).toBuffer();
              } else {
                imageBuffer = await resized.png({ compressionLevel: 6 }).toBuffer();
              }
              sampleSizes.push(imageBuffer.length);
            }

            const avgPageSizeBytes = sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length;
            const avgPageSizeKB = avgPageSizeBytes / 1024;
            const estimatedSizeMB = (avgPageSizeBytes * pageCount) / (1024 * 1024);
            const sizeRatio = estimatedSizeMB / originalSizeMB;

            // Calculate quality score
            const dpiRatio = config.dpi / nativeDpi;
            let qualityScore = dpiRatio >= 1.0 ? 100 : dpiRatio * 100;
            if (config.format === 'png') {
              qualityScore = Math.min(100, qualityScore + 5);
            } else if (config.quality < 90) {
              qualityScore = Math.max(0, qualityScore - (90 - config.quality) * 0.3);
            }
            qualityScore = Math.round(qualityScore * 10) / 10;

            const result = {
              dpi: config.dpi,
              format: config.format,
              quality: config.quality,
              samplePages,
              samplePageSizes: sampleSizes.map(s => Math.round(s / 1024)),
              avgPageSizeKB: Math.round(avgPageSizeKB),
              estimatedSizeMB: Math.round(estimatedSizeMB * 10) / 10,
              sizeRatio,
              qualityScore,
            };

            results.push(result);

            // Send intermediate result
            send({
              type: 'result',
              current: i + 1,
              total: testConfigs.length,
              result,
              progress: progressPercent,
            });
          } catch (error) {
            send({
              type: 'error',
              message: `Failed: DPI ${config.dpi}, ${config.format}`,
              progress: progressPercent,
            });
          }
        }

        // Step 6: Find optimal
        send({ type: 'status', message: 'Finding optimal parameters...', progress: 92 });

        results.sort((a, b) => b.qualityScore - a.qualityScore);

        let best = results.find(r =>
          r.qualityScore >= 90 && r.sizeRatio >= 0.7 && r.sizeRatio <= 1.3
        );
        if (!best) {
          best = results.find(r => r.qualityScore >= 85 && r.sizeRatio <= 1.5);
        }
        if (!best) {
          best = results[0];
        }

        let reason: string;
        if (best.sizeRatio >= 0.9 && best.sizeRatio <= 1.1) {
          reason = `Taille identique au PDF (${Math.round(best.sizeRatio * 100)}%), qualite ${best.qualityScore}%`;
        } else if (best.sizeRatio < 0.9) {
          reason = `Reduction de ${Math.round((1 - best.sizeRatio) * 100)}%, qualite ${best.qualityScore}%`;
        } else {
          reason = `Meilleur compromis trouve, qualite ${best.qualityScore}%`;
        }

        const optimal = {
          dpi: best.dpi,
          format: best.format,
          quality: best.quality,
          estimatedSizeMB: best.estimatedSizeMB,
          sizeRatio: best.sizeRatio,
          qualityScore: best.qualityScore,
          reason,
        };

        // Final result
        send({
          type: 'complete',
          analysis: { ...analysis, originalSizeMB },
          samplePages,
          testResults: results,
          optimal,
          testedConfigs: testConfigs.length,
          progress: 100,
        });
      } catch (error) {
        send({
          type: 'error',
          message: `Optimization failed: ${error}`,
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
