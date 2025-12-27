import { NextRequest, NextResponse } from 'next/server';
import '@/lib/polyfills';
import sharp from 'sharp';

// Helper to get pdfjs from unpdf (serverless-compatible)
const getPdfjs = async () => {
  const pdfjs = await import('unpdf/pdfjs');
  return pdfjs;
};

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Extract the original embedded image from a specific PDF page
 * Falls back to high-quality render if direct extraction fails
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const pageNum = parseInt(formData.get('page') as string) || 1;

    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Invalid PDF file' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Try direct extraction first
    try {
      // Get pdfjs from unpdf (serverless-compatible)
      const pdfjs = await getPdfjs();
      const pdfData = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;

      if (pageNum < 1 || pageNum > pdf.numPages) {
        return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
      }

      const page = await pdf.getPage(pageNum);
      const ops = await page.getOperatorList();

      // Find image objects in this page
      for (let i = 0; i < ops.fnArray.length; i++) {
        // OPS.paintImageXObject = 85
        if (ops.fnArray[i] === 85) {
          const imageName = ops.argsArray[i][0];

          try {
            const imgObj = await new Promise<{
              width: number;
              height: number;
              data: Uint8Array;
              kind: number;
            }>((resolve, reject) => {
              page.objs.get(imageName, (obj: unknown) => {
                if (obj) resolve(obj as { width: number; height: number; data: Uint8Array; kind: number });
                else reject(new Error('Image not found'));
              });
            });

            if (imgObj && imgObj.data && imgObj.width && imgObj.height) {
              const channels = imgObj.data.length / (imgObj.width * imgObj.height);
              let imgBuffer: Buffer;

              if (channels === 4) {
                imgBuffer = await sharp(Buffer.from(imgObj.data), {
                  raw: { width: imgObj.width, height: imgObj.height, channels: 4 }
                }).png().toBuffer();
              } else if (channels === 3) {
                imgBuffer = await sharp(Buffer.from(imgObj.data), {
                  raw: { width: imgObj.width, height: imgObj.height, channels: 3 }
                }).png().toBuffer();
              } else if (channels === 1) {
                imgBuffer = await sharp(Buffer.from(imgObj.data), {
                  raw: { width: imgObj.width, height: imgObj.height, channels: 1 }
                }).png().toBuffer();
              } else {
                continue;
              }

              page.cleanup();
              await pdf.cleanup();

              return new NextResponse(new Uint8Array(imgBuffer), {
                headers: {
                  'Content-Type': 'image/png',
                  'X-Extraction-Method': 'direct',
                  'X-Image-Width': imgObj.width.toString(),
                  'X-Image-Height': imgObj.height.toString(),
                },
              });
            }
          } catch {
            // Continue to next image or fallback
          }
        }
      }

      page.cleanup();
      await pdf.cleanup();
    } catch (err) {
      console.error('Direct extraction failed:', err);
    }

    // Fallback: render at high DPI
    const { renderPdfPage } = await import('@/lib/pdf-renderer');
    const scale = 3; // High quality render (~216 DPI)
    const pageImage = await renderPdfPage(pdfBuffer, pageNum, scale);

    const imgBuffer = await sharp(pageImage).png().toBuffer();
    const metadata = await sharp(pageImage).metadata();

    return new NextResponse(new Uint8Array(imgBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'X-Extraction-Method': 'render',
        'X-Image-Width': (metadata.width || 0).toString(),
        'X-Image-Height': (metadata.height || 0).toString(),
      },
    });
  } catch (error) {
    console.error('Extract preview error:', error);
    return NextResponse.json(
      { error: 'Failed to extract image' },
      { status: 500 }
    );
  }
}
