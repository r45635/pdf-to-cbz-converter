import { NextRequest, NextResponse } from 'next/server';
import { convertPdfToCbz, ConversionOptions } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large PDFs

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
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

    // Parse options
    const options: ConversionOptions = {
      dpi: dpiStr ? parseInt(dpiStr, 10) : null,
      format: format || 'jpeg',
      quality: qualityStr ? parseInt(qualityStr, 10) : 85,
    };

    // Validate options
    if (options.dpi != null && (options.dpi < 72 || options.dpi > 600)) {
      return NextResponse.json(
        { error: 'DPI must be between 72 and 600' },
        { status: 400 }
      );
    }

    if (options.quality != null && (options.quality < 1 || options.quality > 100)) {
      return NextResponse.json(
        { error: 'Quality must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    console.log(`Starting conversion: ${file.name}`);

    // Convert PDF to CBZ with progress logging
    const cbzBuffer = await convertPdfToCbz(pdfBuffer, options, (progress) => {
      console.log(`[Convert] Page ${progress.currentPage}/${progress.totalPages} (${progress.percentage}%)`);
    });

    // Generate output filename
    const outputFilename = file.name.replace(/\.pdf$/i, '.cbz');

    // Return CBZ file
    return new NextResponse(new Uint8Array(cbzBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/x-cbz',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
        'Content-Length': cbzBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Conversion error:', error);
    return NextResponse.json(
      { error: 'Failed to convert PDF', details: String(error) },
      { status: 500 }
    );
  }
}
