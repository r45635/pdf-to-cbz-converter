import { NextRequest, NextResponse } from 'next/server';
import { convertCbzToPdf, CbzToPdfOptions } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large CBZ files

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const qualityStr = formData.get('quality') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No CBZ file provided' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.cbz')) {
      return NextResponse.json(
        { error: 'File must be a CBZ' },
        { status: 400 }
      );
    }

    // Parse options
    const options: CbzToPdfOptions = {
      quality: qualityStr ? parseInt(qualityStr, 10) : 85,
    };

    // Validate options
    if (options.quality != null && (options.quality < 1 || options.quality > 100)) {
      return NextResponse.json(
        { error: 'Quality must be between 1 and 100' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const cbzBuffer = Buffer.from(arrayBuffer);

    console.log(`Starting CBZ to PDF conversion: ${file.name}`);

    // Convert CBZ to PDF with progress logging
    const pdfBuffer = await convertCbzToPdf(cbzBuffer, options, (progress) => {
      console.log(`[Convert CBZ] Page ${progress.currentPage}/${progress.totalPages} (${progress.percentage}%)`);
    });

    // Generate output filename
    const outputFilename = file.name.replace(/\.cbz$/i, '.pdf');

    // Return PDF file
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('CBZ to PDF conversion error:', error);
    return NextResponse.json(
      { error: 'Failed to convert CBZ', details: String(error) },
      { status: 500 }
    );
  }
}
