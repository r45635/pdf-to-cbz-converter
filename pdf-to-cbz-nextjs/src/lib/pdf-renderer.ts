// PDF renderer using unpdf (serverless-compatible pdfjs wrapper)
import './polyfills';
import { renderPageAsImage, getDocumentProxy } from 'unpdf';

export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number = 1
): Promise<Buffer> {
  // Convert Buffer to Uint8Array for compatibility
  const data = new Uint8Array(pdfBuffer);

  // Render at the specified scale
  const result = await renderPageAsImage(data, pageNumber, {
    scale,
    canvasImport: () => import('@napi-rs/canvas'),
  });

  return Buffer.from(result);
}

export async function* renderAllPages(
  pdfBuffer: Buffer,
  scale: number = 1
): AsyncGenerator<Buffer> {
  // Convert Buffer to Uint8Array for compatibility
  const data = new Uint8Array(pdfBuffer);
  const pdf = await getDocumentProxy(data);
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const result = await renderPageAsImage(pdf, i, {
      scale,
      canvasImport: () => import('@napi-rs/canvas'),
    });

    yield Buffer.from(result);
  }

  await pdf.cleanup();
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const data = new Uint8Array(pdfBuffer);
  const pdf = await getDocumentProxy(data);
  const count = pdf.numPages;
  await pdf.cleanup();
  return count;
}
