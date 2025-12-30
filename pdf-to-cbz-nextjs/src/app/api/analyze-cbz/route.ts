import { NextRequest, NextResponse } from 'next/server';
import { analyzeCbz } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

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

    const arrayBuffer = await file.arrayBuffer();
    const cbzBuffer = Buffer.from(arrayBuffer);

    const analysis = await analyzeCbz(cbzBuffer);

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('CBZ analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze CBZ', details: String(error) },
      { status: 500 }
    );
  }
}
