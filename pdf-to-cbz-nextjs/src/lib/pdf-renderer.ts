// PDF renderer using pdfjs-dist with node-canvas
// CRITICAL: Import canvas setup FIRST to install global polyfills
import './canvas-setup';
import { createCanvas, Image } from 'canvas';

// Configure pdfjs for serverless - use legacy build for better node-canvas compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Disable worker - runs in main thread (required for serverless)
pdfjs.GlobalWorkerOptions.workerSrc = '';

// Create a NodeCanvasFactory for pdfjs-dist compatibility with node-canvas
class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: { canvas: ReturnType<typeof createCanvas>; context: ReturnType<ReturnType<typeof createCanvas>['getContext']> }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: ReturnType<typeof createCanvas> }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

// Export for external use
export const canvasFactory = new NodeCanvasFactory();

// Polyfill Image for pdfjs
if (typeof globalThis.Image === 'undefined') {
  // @ts-expect-error - polyfill for node environment
  globalThis.Image = Image;
}

export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number = 1
): Promise<Buffer> {
  console.log('[renderPdfPage] Starting, pageNumber:', pageNumber, 'scale:', scale);

  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true,
    canvasFactory: canvasFactory,
  });
  const pdf = await loadingTask.promise;
  console.log('[renderPdfPage] PDF loaded, pages:', pdf.numPages);

  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`Invalid page number: ${pageNumber}`);
  }

  const page = await pdf.getPage(pageNumber);
  console.log('[renderPdfPage] Page loaded');

  const viewport = page.getViewport({ scale });
  console.log('[renderPdfPage] Viewport:', viewport.width, 'x', viewport.height);

  // Use canvasFactory to create canvas for pdfjs compatibility
  const { canvas, context } = canvasFactory.create(
    Math.floor(viewport.width),
    Math.floor(viewport.height)
  );
  console.log('[renderPdfPage] Canvas created via factory');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({
    canvasContext: context as any,
    viewport,
    canvasFactory: canvasFactory,
  } as any).promise;

  page.cleanup();
  await pdf.cleanup();

  return canvas.toBuffer('image/png');
}

export async function* renderAllPages(
  pdfBuffer: Buffer,
  scale: number = 1
): AsyncGenerator<Buffer> {
  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true,
    canvasFactory: canvasFactory,
  });
  const pdf = await loadingTask.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    // Use canvasFactory for pdfjs compatibility
    const { canvas, context } = canvasFactory.create(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({
      canvasContext: context as any,
      viewport,
      canvasFactory: canvasFactory,
    } as any).promise;

    page.cleanup();
    yield canvas.toBuffer('image/png');
  }

  await pdf.cleanup();
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true,
    canvasFactory: canvasFactory,
  });
  const pdf = await loadingTask.promise;
  const count = pdf.numPages;
  await pdf.cleanup();
  return count;
}
