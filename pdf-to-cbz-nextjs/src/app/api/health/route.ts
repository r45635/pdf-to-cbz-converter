import { NextResponse } from 'next/server';
import '@/lib/polyfills';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, string> = {};

  // Test sharp
  try {
    const sharp = await import('sharp');
    const info = await sharp.default.versions;
    checks.sharp = `OK (vips: ${info.vips})`;
  } catch (e) {
    checks.sharp = `ERROR: ${e}`;
  }

  // Test pdfjs
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    checks.pdfjs = `OK (version: ${pdfjs.version})`;
  } catch (e) {
    checks.pdfjs = `ERROR: ${e}`;
  }

  // Test unpdf/pdfjs + node-canvas (serverless-compatible PDF rendering)
  try {
    await import('unpdf/pdfjs');
    await import('canvas');
    checks['pdf-render'] = `OK (unpdf/pdfjs + node-canvas)`;
  } catch (e) {
    checks['pdf-render'] = `ERROR: ${e}`;
  }

  return NextResponse.json({
    status: 'running',
    node: process.version,
    checks,
  });
}
