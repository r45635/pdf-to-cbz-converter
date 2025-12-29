import { NextRequest, NextResponse } from 'next/server';
import { jobManager, BATCH_CONFIG } from '@/lib/job-manager';

export const runtime = 'nodejs';

// GET - List all jobs (for admin/debugging)
export async function GET(request: NextRequest) {
  // Optional: Add authentication check here for production
  // const authHeader = request.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  try {
    const jobs = await jobManager.listJobs();

    const summary = {
      totalJobs: jobs.length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      partial: jobs.filter((j) => j.status === 'partial').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    };

    const jobsList = jobs.map((job) => ({
      id: job.id,
      status: job.status,
      createdAt: new Date(job.createdAt).toISOString(),
      expiresAt: new Date(job.expiresAt).toISOString(),
      remainingMinutes: jobManager.getRemainingMinutes(job),
      filesCount: job.files.length,
      completedFiles: job.files.filter((f) => f.status === 'done').length,
      failedFiles: job.files.filter((f) => f.status === 'error').length,
      settings: job.settings,
    }));

    return NextResponse.json({
      config: BATCH_CONFIG,
      summary,
      jobs: jobsList,
    });
  } catch (error) {
    console.error('[BatchAdmin] Error listing jobs:', error);
    return NextResponse.json(
      { error: 'Failed to list jobs' },
      { status: 500 }
    );
  }
}

// POST - Trigger manual cleanup
export async function POST(request: NextRequest) {
  // Optional: Add authentication check here for production

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'cleanup';

    if (action === 'cleanup') {
      const deletedCount = await jobManager.cleanupExpiredJobs();
      return NextResponse.json({
        success: true,
        action: 'cleanup',
        deletedJobs: deletedCount,
      });
    }

    if (action === 'delete-all') {
      // Dangerous: delete all jobs
      const jobs = await jobManager.listJobs();
      let deletedCount = 0;

      for (const job of jobs) {
        await jobManager.deleteJob(job.id);
        deletedCount++;
      }

      return NextResponse.json({
        success: true,
        action: 'delete-all',
        deletedJobs: deletedCount,
      });
    }

    return NextResponse.json(
      { error: 'Unknown action. Use "cleanup" or "delete-all"' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[BatchAdmin] Error:', error);
    return NextResponse.json(
      { error: 'Admin action failed' },
      { status: 500 }
    );
  }
}
