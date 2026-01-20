import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from '@/lib/useTranslation';
import LanguageSelector from '@/components/LanguageSelector';
import * as TauriClient from '@/lib/tauri-client';

type ConversionMode = 'pdf-to-cbz' | 'cbz-to-pdf';

interface OptimalParams {
  dpi: number;
  format: 'jpeg' | 'png';
  quality: number;
  estimatedSizeMB: number;
  sizeRatio: number;
  qualityScore: number;
  reason: string;
}

interface TestResult {
  dpi: number;
  format: 'jpeg' | 'png';
  quality: number;
  avgPageSizeKB: number;
  estimatedSizeMB: number;
  sizeRatio: number;
  qualityScore: number;
}

function isPdfAnalysis(analysis: TauriClient.PdfAnalysisResult | TauriClient.CbzAnalysisResult): analysis is TauriClient.PdfAnalysisResult {
  return 'pdfSizeMb' in analysis;
}

interface HomeProps {
  onNavigateToBatch?: () => void;
}

export default function Home({ onNavigateToBatch }: HomeProps) {
  const { lang, setLang, t } = useTranslation();
  const [mode, setMode] = useState<ConversionMode>('pdf-to-cbz');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [analysis, setAnalysis] = useState<TauriClient.PdfAnalysisResult | TauriClient.CbzAnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);

  // Options
  const [dpi, setDpi] = useState<string>('');
  const [format, setFormat] = useState<TauriClient.ImageFormat>('jpeg');
  const [quality, setQuality] = useState(85);
  const [matchPdfSize, setMatchPdfSize] = useState(true);
  const [cbzScale, setCbzScale] = useState(100);

  // Status
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStatus, setConversionStatus] = useState<string>('');

  // Optimization results
  const [optimalParams, setOptimalParams] = useState<OptimalParams | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [samplePages, setSamplePages] = useState<number[]>([]);
  const [showAllResults, setShowAllResults] = useState(false);

  // Optimization progress
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const [optimizeStatus, setOptimizeStatus] = useState('');
  const [currentTest, setCurrentTest] = useState<{current: number; total: number} | null>(null);

  // Comparison mode
  const [compareMode, setCompareMode] = useState(false);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [convertedPreviewUrl, setConvertedPreviewUrl] = useState<string | null>(null);
  const [compareZoom, setCompareZoom] = useState(1);
  const [comparePan, setComparePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Drag & drop state
  const [isDragActive, setIsDragActive] = useState(false);

  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());

  // Get effective DPI based on settings (PDF mode only)
  const effectiveDpi = useMemo(() => {
    if (dpi) return parseInt(dpi, 10);
    if (!analysis || !isPdfAnalysis(analysis)) return 150;
    return matchPdfSize ? analysis.nativeDpi : analysis.recommendedDpi;
  }, [dpi, analysis, matchPdfSize]);

  // Calculate estimated PDF size for CBZ→PDF mode
  const estimatedCbzToPdfSize = useMemo(() => {
    if (!analysis || isPdfAnalysis(analysis)) return null;

    const cbzAnalysis = analysis;
    let totalEstimatedBytes = 0;

    for (const page of cbzAnalysis.pages) {
      const scaledWidth = Math.round(page.width * (cbzScale / 100));
      const scaledHeight = Math.round(page.height * (cbzScale / 100));
      const totalPixels = scaledWidth * scaledHeight;

      let bytesPerPixel: number;
      if (format === 'png') {
        bytesPerPixel = 0.8;
      } else {
        bytesPerPixel = 0.05 + (quality / 100) * 0.30;
      }

      totalEstimatedBytes += totalPixels * bytesPerPixel;
    }

    return (totalEstimatedBytes * 1.05) / (1024 * 1024);
  }, [analysis, cbzScale, format, quality]);

  // Calculate estimated size based on current settings (PDF mode only)
  const estimatedSize = useMemo(() => {
    if (!analysis || !isPdfAnalysis(analysis)) return null;

    const currentDpi = effectiveDpi;

    if (testResults.length > 0) {
      const exactMatch = testResults.find(
        r => r.dpi === currentDpi && r.format === format && r.quality === quality
      );
      if (exactMatch) {
        return exactMatch.estimatedSizeMB;
      }

      const sameFormat = testResults.filter(r => r.format === format);
      if (sameFormat.length > 0) {
        const sorted = [...sameFormat].sort(
          (a, b) => Math.abs(a.dpi - currentDpi) - Math.abs(b.dpi - currentDpi)
        );
        const closest = sorted[0];

        const dpiRatio = currentDpi / closest.dpi;
        const qualityFactor = format === 'jpeg'
          ? (0.5 + quality / 200) / (0.5 + closest.quality / 200)
          : 1;

        return closest.estimatedSizeMB * dpiRatio * dpiRatio * qualityFactor;
      }
    }

    let totalPixels = 0;
    for (const page of analysis.pages) {
      const scale = currentDpi / 72;
      const widthPx = page.widthPt * scale;
      const heightPx = page.heightPt * scale;
      totalPixels += widthPx * heightPx;
    }

    let bytesPerPixel: number;
    if (format === 'png') {
      bytesPerPixel = 0.8;
    } else {
      bytesPerPixel = 0.05 + (quality / 100) * 0.30;
    }

    const totalBytes = totalPixels * bytesPerPixel;
    return totalBytes / (1024 * 1024);
  }, [analysis, effectiveDpi, format, quality, testResults]);

  // Load preview with debouncing
  const loadPreview = useCallback(async (path: string, page: number, currentDpi: number, currentFormat: TauriClient.ImageFormat, currentQuality: number) => {
    const startTime = performance.now();
    const previewDpi = Math.min(currentDpi, 100);
    const cacheKey = `${path}:${page}:${previewDpi}:${currentFormat}:${currentQuality}`;

    console.log('[PROFILE] loadPreview started:', { path, page, currentDpi, currentFormat, currentQuality });

    // Check cache first
    const cachedUrl = previewCacheRef.current.get(cacheKey);
    if (cachedUrl) {
      console.log('[PROFILE] Cache HIT - using cached preview');
      setPreviewUrl(cachedUrl);
      return;
    }

    setIsPreviewLoading(true);
    setError(null);

    try {
      const generateStart = performance.now();
      console.log(`[PROFILE] Cache MISS - generating preview with DPI ${previewDpi}...`);
      const imageData = await TauriClient.generatePreview(
        path,
        page,
        previewDpi,
        currentFormat,
        currentQuality
      );
      const generateEnd = performance.now();
      console.log(`[PROFILE] generatePreview took ${(generateEnd - generateStart).toFixed(0)}ms, data length: ${imageData.byteLength} bytes`);

      const base64Start = performance.now();
      const url = TauriClient.arrayBufferToDataUrl(imageData, `image/${currentFormat}`);
      const base64End = performance.now();
      console.log(`[PROFILE] Base64 encoding took ${(base64End - base64Start).toFixed(0)}ms`);

      // Store in cache
      previewCacheRef.current.set(cacheKey, url);

      setPreviewUrl(url);
      const endTime = performance.now();
      console.log(`[PROFILE] Total preview load time: ${(endTime - startTime).toFixed(0)}ms`);
    } catch (err) {
      console.error('[ERROR] Preview generation failed:', err);
      setError(err instanceof Error ? err.message : 'Preview generation failed');
      setPreviewUrl(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  // Load CBZ preview
  const loadCbzPreview = useCallback(async (path: string, page: number) => {
    setIsPreviewLoading(true);
    setError(null);

    try {
      const imageData = await TauriClient.generateCbzPreview(
        path,
        page,
        format,
        quality
      );

      const url = TauriClient.arrayBufferToDataUrl(imageData, `image/${format}`);
      setPreviewUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview generation failed');
      setPreviewUrl(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [format, quality]);

  // File selection handler
  const handleFileSelect = useCallback(async () => {
    console.log('[DEBUG] handleFileSelect called, mode:', mode);
    setError(null);
    
    try {
      const path = mode === 'pdf-to-cbz' 
        ? await TauriClient.selectPdfFile()
        : await TauriClient.selectCbzFile();
      
      console.log('[DEBUG] Selected file path:', path);
      if (!path) {
        console.log('[DEBUG] No file selected');
        return;
      }
      
      const name = path.split('/').pop() || path.split('\\').pop() || 'file';
      console.log('[DEBUG] File name:', name);
      setFilePath(path);
      setFileName(name);
      setPreviewUrl(null);
      setAnalysis(null);
      setOptimalParams(null);
      setTestResults([]);
      setSamplePages([]);
      
      // Analyze the file
      setIsAnalyzing(true);
      console.log('[DEBUG] Starting analysis...');
      
      if (mode === 'pdf-to-cbz') {
        console.log('[DEBUG] Analyzing PDF...');
        const result = await TauriClient.analyzePdf(path);
        console.log('[DEBUG] PDF analysis result:', result);
        setAnalysis(result);
        setDpi(result.nativeDpi.toString());
        setPreviewPage(1);
        
        // Load initial preview
        console.log('[DEBUG] Loading preview...');
        await loadPreview(path, 1, result.nativeDpi, format, quality);
      } else {
        console.log('[DEBUG] Analyzing CBZ...');
        const result = await TauriClient.analyzeCbz(path);
        console.log('[DEBUG] CBZ analysis result:', result);
        setAnalysis(result);
        setPreviewPage(1);
        
        // Load initial preview
        await loadCbzPreview(path, 1);
      }
      console.log('[DEBUG] Analysis complete');
    } catch (err) {
      console.error('[ERROR] File selection/analysis failed:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [mode, format, quality, loadPreview, loadCbzPreview]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isCbz = fileName.endsWith('.cbz') || fileName.endsWith('.cbr');

    if (!isPdf && !isCbz) {
      setError(mode === 'pdf-to-cbz' ? 'Please drop a PDF file' : 'Please drop a CBZ/CBR file');
      return;
    }

    // Get the file path from Tauri
    // Note: In Tauri, dropped files don't have the path directly.
    // We'll use the file dialog instead for now
    // In a real app, you'd need to use https://tauri.app/en/docs/api/filesystem/

    // For now, trigger file selection dialog instead
    await handleFileSelect();
  }, [mode, handleFileSelect]);

  // Convert handler
  const handleConvert = useCallback(async () => {
    if (!filePath || !analysis) return;

    setIsConverting(true);
    setError(null);
    setConversionProgress(0);

    try {
      if (mode === 'pdf-to-cbz') {
        const imageData = await TauriClient.convertPdfToCbz(
          filePath,
          effectiveDpi,
          format,
          quality,
          (progress) => {
            setConversionProgress(progress.percentage);
            setConversionStatus(progress.message || '');
          }
        );

        // Save file
        const defaultName = fileName.replace(/\.pdf$/i, '.cbz');
        const savePath = await TauriClient.saveCbzFile(defaultName);
        
        if (savePath) {
          await TauriClient.saveDataToFile(imageData, savePath);
          setConversionStatus(t('conversionCompleted') || 'Conversion completed!');
        }
      } else {
        // TODO: Implement CBZ to PDF conversion
        setError('CBZ to PDF conversion not yet implemented');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setIsConverting(false);
      setTimeout(() => {
        setConversionProgress(0);
        setConversionStatus('');
      }, 3000);
    }
  }, [filePath, fileName, analysis, mode, effectiveDpi, format, quality, t]);

  // Optimize handler
  const handleOptimize = useCallback(async () => {
    if (!filePath || !analysis || !isPdfAnalysis(analysis)) return;

    setIsOptimizing(true);
    setError(null);
    setOptimizeProgress(0);
    setOptimizeStatus('Finding optimal settings...');

    try {
      const imageData = await TauriClient.optimizePdf(
        filePath,
        (progress) => {
          setOptimizeProgress(progress.percentage);
          setOptimizeStatus(progress.message || '');
        }
      );

      // The optimize command returns the converted file
      // Save it
      const defaultName = fileName.replace(/\.pdf$/i, '_optimized.cbz');
      const savePath = await TauriClient.saveCbzFile(defaultName);
      
      if (savePath) {
        await TauriClient.saveDataToFile(imageData, savePath);
        setOptimizeStatus('Optimization completed!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
      setTimeout(() => {
        setOptimizeProgress(0);
        setOptimizeStatus('');
      }, 3000);
    }
  }, [filePath, fileName, analysis]);

  // Direct extract handler
  const handleDirectExtract = useCallback(async () => {
    if (!filePath || !analysis || !isPdfAnalysis(analysis)) return;

    setIsConverting(true);
    setError(null);
    setConversionProgress(0);

    try {
      // For direct extraction, we still use conversion but notify user it's extraction
      setConversionStatus('Extracting images...');
      
      const imageData = await TauriClient.convertPdfToCbz(
        filePath,
        72, // Use 72 DPI for direct extraction (native resolution)
        'png', // Use PNG to preserve quality
        100, // Maximum quality
        (progress) => {
          setConversionProgress(progress.percentage);
          setConversionStatus(`Extracting: ${progress.message || ''}`);
        }
      );

      const defaultName = fileName.replace(/\.pdf$/i, '_extracted.cbz');
      const savePath = await TauriClient.saveCbzFile(defaultName);
      
      if (savePath) {
        await TauriClient.saveDataToFile(imageData, savePath);
        setConversionStatus('Extraction completed!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setIsConverting(false);
      setTimeout(() => {
        setConversionProgress(0);
        setConversionStatus('');
      }, 3000);
    }
  }, [filePath, fileName, analysis]);

  // Update preview when settings change
  useEffect(() => {
    if (!filePath || !analysis) return;

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    previewTimeoutRef.current = setTimeout(() => {
      if (mode === 'pdf-to-cbz' && isPdfAnalysis(analysis)) {
        loadPreview(filePath, previewPage, effectiveDpi, format, quality);
      } else if (mode === 'cbz-to-pdf') {
        loadCbzPreview(filePath, previewPage);
      }
    }, 300);

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [filePath, analysis, previewPage, effectiveDpi, format, quality, mode, loadPreview, loadCbzPreview]);

  // Mode change handler
  const handleModeChange = useCallback((newMode: ConversionMode) => {
    setMode(newMode);
    setFilePath(null);
    setFileName('');
    setAnalysis(null);
    setPreviewUrl(null);
    setError(null);
    setOptimalParams(null);
    setTestResults([]);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('title')}
            </h1>
            <div className="flex items-center gap-4">
              <LanguageSelector lang={lang} setLang={setLang} />
              <button
                onClick={onNavigateToBatch}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                {t('batchMode')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Mode Selector */}
        <div className="mb-6 flex gap-4 bg-white dark:bg-gray-800 p-2 rounded-lg shadow">
          <button
            onClick={() => handleModeChange('pdf-to-cbz')}
            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
              mode === 'pdf-to-cbz'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            {t('pdfToCbz')}
          </button>
          <button
            onClick={() => handleModeChange('cbz-to-pdf')}
            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
              mode === 'cbz-to-pdf'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            {t('cbzToPdf')}
          </button>
        </div>

        {/* File Upload Area */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6">
          <div
            onClick={handleFileSelect}
            className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors border-gray-300 dark:border-gray-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700"
          >
            <div className="flex flex-col items-center">
              <svg
                className="w-16 h-16 text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                {mode === 'pdf-to-cbz' ? 'Click to select PDF' : 'Click to select CBZ/CBR'}
              </p>
              {fileName && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Selected: {fileName}
                </p>
              )}
            </div>
          </div>

          {isAnalyzing && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">{t('analyzing')}</p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Analysis Results & Options */}
        {analysis && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Settings */}
            <div className="space-y-6">
              {/* Analysis Info */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  {mode === 'pdf-to-cbz' ? 'PDF' : 'CBZ'} {t('analysis')}
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      {mode === 'pdf-to-cbz' ? t('pages') : t('images')}:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {analysis.pageCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{t('size')}:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {isPdfAnalysis(analysis) 
                        ? `${analysis.pdfSizeMb.toFixed(2)} MB`
                        : `${analysis.cbzSizeMb.toFixed(2)} MB`
                      }
                    </span>
                  </div>
                  {isPdfAnalysis(analysis) && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">{t('native')} DPI:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {analysis.nativeDpi}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">{t('hd')} DPI:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {analysis.recommendedDpi}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Conversion Options */}
              {mode === 'pdf-to-cbz' && isPdfAnalysis(analysis) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                    {t('conversionSettings')}
                  </h2>

                  {/* DPI Setting */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('resolution')} (DPI)
                    </label>
                    <div className="flex items-center gap-4 mb-2">
                      <input
                        type="range"
                        min="72"
                        max="600"
                        value={effectiveDpi}
                        onChange={(e) => setDpi(e.target.value)}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={dpi || effectiveDpi}
                        onChange={(e) => setDpi(e.target.value)}
                        className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
                        min="72"
                        max="600"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setDpi('');
                          setMatchPdfSize(true);
                        }}
                        className={`px-3 py-1 text-sm rounded ${
                          matchPdfSize && !dpi
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {t('matchPdf')} ({analysis.nativeDpi})
                      </button>
                      <button
                        onClick={() => {
                          setDpi('');
                          setMatchPdfSize(false);
                        }}
                        className={`px-3 py-1 text-sm rounded ${
                          !matchPdfSize && !dpi
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        HD ({analysis.recommendedDpi})
                      </button>
                    </div>
                  </div>

                  {/* Format Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('format')}
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFormat('jpeg')}
                        className={`flex-1 px-4 py-2 rounded-lg ${
                          format === 'jpeg'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        JPEG
                      </button>
                      <button
                        onClick={() => setFormat('png')}
                        className={`flex-1 px-4 py-2 rounded-lg ${
                          format === 'png'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        PNG
                      </button>
                    </div>
                  </div>

                  {/* Quality Slider (JPEG only) */}
                  {format === 'jpeg' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('quality')}: {quality}%
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="100"
                        value={quality}
                        onChange={(e) => setQuality(parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Estimated Size */}
                  {estimatedSize !== null && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          Estimated output:
                        </span>
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          ~{estimatedSize.toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleConvert}
                  disabled={isConverting || isOptimizing}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {isConverting ? t('converting') : t('convert')}
                </button>

                {mode === 'pdf-to-cbz' && isPdfAnalysis(analysis) && (
                  <>
                    <button
                      onClick={handleOptimize}
                      disabled={isConverting || isOptimizing}
                      className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      {isOptimizing ? t('optimizing') : t('autoOptimize')}
                    </button>

                    <button
                      onClick={handleDirectExtract}
                      disabled={isConverting || isOptimizing}
                      className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      {t('direct')} Extract
                    </button>
                  </>
                )}
              </div>

              {/* Progress */}
              {(conversionProgress > 0 || optimizeProgress > 0) && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">
                        {conversionStatus || optimizeStatus}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {Math.round(conversionProgress || optimizeProgress)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${conversionProgress || optimizeProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('livePreview')}
                </h2>
                {analysis && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewPage(Math.max(1, previewPage - 1))}
                      disabled={previewPage === 1}
                      className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                    >
                      ←
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t('page')} {previewPage} {t('of')} {analysis.pageCount}
                    </span>
                    <button
                      onClick={() => setPreviewPage(Math.min(analysis.pageCount, previewPage + 1))}
                      disabled={previewPage === analysis.pageCount}
                      className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

              <div className="relative bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden" style={{ minHeight: '400px' }}>
                {isPreviewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  </div>
                )}
                {previewUrl && !isPreviewLoading && (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-auto"
                  />
                )}
                {!previewUrl && !isPreviewLoading && !filePath && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-gray-500 dark:text-gray-400">
                      {mode === 'pdf-to-cbz' ? t('uploadPdf') : t('uploadCbz')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-gray-600 dark:text-gray-400 text-sm">
        <p>
          {t('footer')} • {t('madeWith')} ❤️
        </p>
      </footer>
    </div>
  );
}
