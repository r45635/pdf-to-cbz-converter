// PDF renderer using pdfjs-dist with node-canvas for Vercel
import './polyfills';
import { createCanvas } from 'canvas';

// Configure pdfjs for serverless
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/build/pdf.js');

// Disable worker - runs in main thread (required for serverless)
pdfjs.GlobalWorkerOptions.workerSrc = '';

export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number = 1
): Promise<Buffer> {
  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    disableStream: true,
  });
  const pdf = await loadingTask.promise;

  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    throw new Error(`Invalid page number: ${pageNumber}`);
  }

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({
    canvasContext: context as any,
    viewport,
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
  });
  const pdf = await loadingTask.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({
      canvasContext: context as any,
      viewport,
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
  });
  const pdf = await loadingTask.promise;
  const count = pdf.numPages;
  await pdf.cleanup();
  return count;
}
