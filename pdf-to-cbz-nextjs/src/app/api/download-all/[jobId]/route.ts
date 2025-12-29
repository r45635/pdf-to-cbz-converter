import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { jobManager } from '@/lib/job-manager';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large archives

interface RouteParams {
  params: Promise<{
    jobId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { jobId } = await params;

  if (!jobId) {
    return NextResponse.json(
      { error: 'Job ID is required' },
      { status: 400 }
    );
  }

  // Get job
  const job = await jobManager.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found or expired' },
      { status: 404 }
    );
  }

  // Check if job is still processing
  if (job.status === 'processing') {
    return NextResponse.json(
      { error: 'Job is still processing' },
      { status: 400 }
    );
  }

  // Get all converted files
  const files = await jobManager.getAllConvertedFiles(jobId);

  if (files.length === 0) {
    return NextResponse.json(
      { error: 'No converted files available' },
      { status: 404 }
    );
  }

  try {
    // Create ZIP archive in memory
    const chunks: Buffer[] = [];
    const passThrough = new PassThrough();

    passThrough.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    const archive = archiver('zip', {
      zlib: { level: 1 }, // Low compression since CBZ files are already compressed
    });

    archive.pipe(passThrough);

    // Add each file to the archive
    for (const file of files) {
      const fileBuffer = await fs.readFile(file.path);
      archive.append(fileBuffer, { name: file.name });
    }

    // Finalize and wait for completion
    await new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      passThrough.on('end', resolve);
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);

    // Generate filename
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `batch_${timestamp}_${files.length}files.zip`;

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error(`[DownloadAll] Error creating archive for job ${jobId}:`, error);
    return NextResponse.json(
      { error: 'Failed to create archive' },
      { status: 500 }
    );
  }
}
