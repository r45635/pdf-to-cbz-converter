// PDF renderer using pdfjs-dist with node-canvas for Vercel
import './polyfills';
import { createCanvas } from 'canvas';

// Configure pdfjs for serverless (with worker path)
const getPdfjs = async () => {
  // Use the legacy build which has fewer requirements
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Set up worker path using require.resolve to get the actual file location
  if (typeof pdfjs.GlobalWorkerOptions !== 'undefined') {
    try {
      const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
    } catch {
      // Fallback if require.resolve fails
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url
      ).href;
    }
  }

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
