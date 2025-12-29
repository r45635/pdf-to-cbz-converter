import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { jobManager } from '@/lib/job-manager';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    jobId: string;
    fileId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const { jobId, fileId } = await params;

  if (!jobId || !fileId) {
    return NextResponse.json(
      { error: 'Job ID and File ID are required' },
      { status: 400 }
    );
  }

  // Get job to verify it exists and get file info
  const job = await jobManager.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found or expired' },
      { status: 404 }
    );
  }

  // Find the file in the job
  const batchFile = job.files.find((f) => f.id === fileId);

  if (!batchFile) {
    return NextResponse.json(
      { error: 'File not found in job' },
      { status: 404 }
    );
  }

  if (batchFile.status !== 'done' || !batchFile.result) {
    return NextResponse.json(
      { error: 'File conversion not completed' },
      { status: 400 }
    );
  }

  // Get file path
  const filePath = await jobManager.getConvertedFilePath(jobId, fileId);

  if (!filePath) {
    return NextResponse.json(
      { error: 'Converted file not found on disk' },
      { status: 404 }
    );
  }

  try {
    // Read file from disk
    const fileBuffer = await fs.readFile(filePath);

    // Return file with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-cbz',
        'Content-Disposition': `attachment; filename="${batchFile.result.outputName}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error(`[Download] Error reading file ${filePath}:`, error);
    return NextResponse.json(
      { error: 'Failed to read converted file' },
      { status: 500 }
    );
  }
}
