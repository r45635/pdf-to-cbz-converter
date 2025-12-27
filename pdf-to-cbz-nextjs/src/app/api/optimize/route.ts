import { NextRequest, NextResponse } from 'next/server';
import { analyzePdf, testConversionParams, findOptimalParams } from '@/lib/pdf-converter';

export const runtime = 'nodejs';
export const maxDuration = 120; // Allow more time for optimization tests

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = formData.get('mode') as string || 'balanced'; // 'quick' | 'balanced' | 'thorough'

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

    // Analyze PDF first
    const analysis = await analyzePdf(pdfBuffer);
    const originalSizeMB = pdfBuffer.length / (1024 * 1024);

    // Define test configurations based on mode
    const nativeDpi = analysis.nativeDpi;

    // DPI values to test (around native DPI)
    let dpiValues: number[];
    let qualityValues: number[];

    switch (mode) {
      case 'quick':
        // Quick: test only key values
        dpiValues = [
          Math.max(72, nativeDpi - 30),
          nativeDpi,
          Math.min(400, nativeDpi + 30),
        ];
        qualityValues = [80, 85, 90];
        break;
      case 'thorough':
        // Thorough: comprehensive test
        dpiValues = [
          Math.max(72, nativeDpi - 50),
          Math.max(72, nativeDpi - 25),
          nativeDpi,
          nativeDpi + 25,
          Math.min(400, nativeDpi + 50),
          100, 150, 200, 250, 300
        ].filter((d, i, arr) => arr.indexOf(d) === i).sort((a, b) => a - b);
        qualityValues = [75, 80, 85, 90, 95];
        break;
      default:
        // Balanced: reasonable coverage
        dpiValues = [
          Math.max(72, nativeDpi - 25),
          nativeDpi,
          Math.min(400, nativeDpi + 25),
          150, 200
        ].filter((d, i, arr) => arr.indexOf(d) === i).sort((a, b) => a - b);
        qualityValues = [80, 85, 90];
    }

    // Generate test configurations
    const testConfigs: Array<{dpi: number; format: 'jpeg' | 'png'; quality: number}> = [];

    // JPEG tests
    for (const dpi of dpiValues) {
      for (const quality of qualityValues) {
        testConfigs.push({ dpi, format: 'jpeg', quality });
      }
    }

    // PNG tests (only for key DPI values)
    for (const dpi of [nativeDpi, dpiValues[0], dpiValues[dpiValues.length - 1]]) {
      testConfigs.push({ dpi, format: 'png', quality: 100 });
    }

    // Run tests on sample pages
    const results = await testConversionParams(
      pdfBuffer,
      testConfigs,
      analysis
    );

    // Calculate metrics for each result
    const enrichedResults = results.map(r => ({
      ...r,
      sizeRatio: r.estimatedSizeMB / originalSizeMB,
      qualityScore: calculateQualityScore(r.dpi, nativeDpi, r.format, r.quality),
    }));

    // Find optimal parameters
    const optimal = findOptimalParams(enrichedResults, originalSizeMB, nativeDpi);

    // Get sample pages info from first result
    const samplePages = results.length > 0 ? results[0].samplePages : [];

    return NextResponse.json({
      success: true,
      analysis: {
        ...analysis,
        originalSizeMB,
      },
      samplePages, // Pages used for estimation (20%, 40%, 60%)
      testResults: enrichedResults.sort((a, b) => b.qualityScore - a.qualityScore),
      optimal,
      testedConfigs: testConfigs.length,
    });
  } catch (error) {
    console.error('Optimization error:', error);
    return NextResponse.json(
      { error: 'Failed to optimize parameters', details: String(error) },
      { status: 500 }
    );
  }
}

function calculateQualityScore(
  dpi: number,
  nativeDpi: number,
  format: 'jpeg' | 'png',
  quality: number
): number {
  // Base score from DPI ratio
  const dpiRatio = dpi / nativeDpi;
  let score = dpiRatio >= 1.0 ? 100 : dpiRatio * 100;

  // Format bonus/penalty
  if (format === 'png') {
    score = Math.min(100, score + 5); // PNG slightly better for lossless
  } else if (quality < 90) {
    // JPEG quality penalty
    score = Math.max(0, score - (90 - quality) * 0.3);
  }

  return Math.round(score * 10) / 10;
}
