import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const pageStr = formData.get('page') as string | null;

    if (!file || !file.name.toLowerCase().endsWith('.cbz')) {
      return NextResponse.json({ error: 'Invalid CBZ file' }, { status: 400 });
    }

    const pageNumber = pageStr ? parseInt(pageStr, 10) : 1;

    const arrayBuffer = await file.arrayBuffer();
    const cbzBuffer = Buffer.from(arrayBuffer);

    const zip = await JSZip.loadAsync(cbzBuffer);

    // Get all image files sorted by name
    const imageFiles: { name: string; file: JSZip.JSZipObject }[] = [];

    zip.forEach((relativePath, zipFile) => {
      if (!zipFile.dir && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(relativePath)) {
        imageFiles.push({ name: relativePath, file: zipFile });
      }
    });

    // Sort by name (natural sort for proper page ordering)
    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    if (pageNumber < 1 || pageNumber > imageFiles.length) {
      return NextResponse.json(
        { error: `Page must be between 1 and ${imageFiles.length}` },
        { status: 400 }
      );
    }

    const targetImage = imageFiles[pageNumber - 1];
    const imageData = await targetImage.file.async('nodebuffer');

    // Determine content type
    const ext = targetImage.name.toLowerCase().split('.').pop();
    let contentType = 'image/jpeg';
    if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'webp') contentType = 'image/webp';
    else if (ext === 'bmp') contentType = 'image/bmp';

    return new NextResponse(new Uint8Array(imageData), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': imageData.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('CBZ preview error:', error);
    return NextResponse.json(
      { error: 'Failed to extract preview', details: String(error) },
      { status: 500 }
    );
  }
}
