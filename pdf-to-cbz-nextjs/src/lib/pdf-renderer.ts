// PDF renderer using unpdf's bundled pdfjs with node-canvas for Vercel
import './polyfills';
import { createCanvas } from 'canvas';

// Import pdfjs from unpdf's bundled version (includes polyfills for serverless)
const getPdfjs = async () => {
  const pdfjs = await import('unpdf/pdfjs');
  return pdfjs;
};

export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number = 1
): Promise<Buffer> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({ data });
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
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({ data });
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
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const count = pdf.numPages;
  await pdf.cleanup();
  return count;
}
