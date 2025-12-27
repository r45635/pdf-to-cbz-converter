import { NextRequest, NextResponse } from 'next/server';
import { generatePreview, analyzePdf } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const pageStr = formData.get('page') as string | null;
    const dpiStr = formData.get('dpi') as string | null;
    const format = formData.get('format') as 'jpeg' | 'png' | null;
    const qualityStr = formData.get('quality') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No PDF file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Get page count for validation
    const analysis = await analyzePdf(pdfBuffer);
    const pageNumber = pageStr ? parseInt(pageStr, 10) : 1;

    if (pageNumber < 1 || pageNumber > analysis.pageCount) {
      return NextResponse.json(
        { error: `Page must be between 1 and ${analysis.pageCount}` },
        { status: 400 }
      );
    }

    // Parse options
    const dpi = dpiStr ? parseInt(dpiStr, 10) : analysis.recommendedDpi;
    const imageFormat = format || 'jpeg';
    const quality = qualityStr ? parseInt(qualityStr, 10) : 85;

    // Generate preview
    const previewBuffer = await generatePreview(
      pdfBuffer,
      pageNumber,
      dpi,
      imageFormat,
      quality
    );

    // Return image
    const contentType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

    return new NextResponse(new Uint8Array(previewBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': previewBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview', details: String(error) },
      { status: 500 }
    );
  }
}
