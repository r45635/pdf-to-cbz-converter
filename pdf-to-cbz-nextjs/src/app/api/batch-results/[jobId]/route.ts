import { NextRequest, NextResponse } from 'next/server';
import { jobManager } from '@/lib/job-manager';

export const runtime = 'nodejs';

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

  const job = await jobManager.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found or expired' },
      { status: 404 }
    );
  }

  // Build response with download URLs
  const baseUrl = request.nextUrl.origin;
  const remainingMinutes = jobManager.getRemainingMinutes(job);

  const files = job.files.map((file) => ({
    id: file.id,
    originalName: file.originalName,
    originalSizeMB: file.originalSizeMB,
    status: file.status,
    progress: file.progress,
    error: file.error,
    result: file.result
      ? {
          ...file.result,
          downloadUrl: `${baseUrl}/api/download/${jobId}/${file.id}`,
        }
      : undefined,
  }));

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    remainingMinutes,
    settings: job.settings,
    files,
    summary: {
      total: job.files.length,
      completed: job.files.filter((f) => f.status === 'done').length,
      failed: job.files.filter((f) => f.status === 'error').length,
      pending: job.files.filter((f) => f.status === 'pending' || f.status === 'analyzing' || f.status === 'converting').length,
    },
    downloadAllUrl: job.status !== 'processing' && job.files.some((f) => f.status === 'done')
      ? `${baseUrl}/api/download-all/${jobId}`
      : undefined,
  });
}

// DELETE endpoint to manually delete a job
export async function DELETE(
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

  const job = await jobManager.getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: 'Job not found or expired' },
      { status: 404 }
    );
  }

  await jobManager.deleteJob(jobId);

  return NextResponse.json({
    success: true,
    message: `Job ${jobId} deleted`,
  });
}
