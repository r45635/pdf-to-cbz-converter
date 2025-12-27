'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

interface AnalysisResult {
  pageCount: number;
  pages: {
    pageNumber: number;
    widthPt: number;
    heightPt: number;
    widthPx: number;
    heightPx: number;
  }[];
  recommendedDpi: number;
  pdfSizeMB: number;
  nativeDpi: number;
}

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

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);

  // Options
  const [dpi, setDpi] = useState<string>('');
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [quality, setQuality] = useState(85);
  const [matchPdfSize, setMatchPdfSize] = useState(true); // Default: match PDF size

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get effective DPI based on settings
  const effectiveDpi = useMemo(() => {
    if (dpi) return parseInt(dpi, 10);
    if (!analysis) return 150;
    return matchPdfSize ? analysis.nativeDpi : analysis.recommendedDpi;
  }, [dpi, analysis, matchPdfSize]);

  // Calculate estimated size based on current settings
  // Uses real test results when available, otherwise falls back to formula
  const estimatedSize = useMemo(() => {
    if (!analysis) return null;

    const currentDpi = effectiveDpi;

    // First, check if we have real test results for this config or similar
    if (testResults.length > 0) {
      // Find exact match
      const exactMatch = testResults.find(
        r => r.dpi === currentDpi && r.format === format && r.quality === quality
      );
      if (exactMatch) {
        return exactMatch.estimatedSizeMB;
      }

      // Find closest DPI match with same format
      const sameFormat = testResults.filter(r => r.format === format);
      if (sameFormat.length > 0) {
        // Sort by DPI distance
        const sorted = [...sameFormat].sort(
          (a, b) => Math.abs(a.dpi - currentDpi) - Math.abs(b.dpi - currentDpi)
        );
        const closest = sorted[0];

        // Scale by DPI ratio squared (size scales with area)
        const dpiRatio = currentDpi / closest.dpi;
        // Adjust for quality difference (roughly linear for JPEG)
        const qualityFactor = format === 'jpeg'
          ? (0.5 + quality / 200) / (0.5 + closest.quality / 200)
          : 1;

        return closest.estimatedSizeMB * dpiRatio * dpiRatio * qualityFactor;
      }
    }

    // Fallback to formula (calibrated for comic book content)
    let totalPixels = 0;
    for (const page of analysis.pages) {
      const scale = currentDpi / 72;
      const widthPx = page.widthPt * scale;
      const heightPx = page.heightPt * scale;
      totalPixels += widthPx * heightPx;
    }

    // Bytes per pixel - calibrated for comic book content (lower than photos)
    let bytesPerPixel: number;
    if (format === 'png') {
      bytesPerPixel = 0.8; // PNG with comic art (flat colors compress well)
    } else {
      // JPEG: comics compress very well due to flat colors
      // Calibrated: Q85 ~0.15, Q95 ~0.22, Q100 ~0.35
      bytesPerPixel = 0.05 + (quality / 100) * 0.30;
    }

    return (totalPixels * bytesPerPixel) / (1024 * 1024);
  }, [analysis, effectiveDpi, format, quality, testResults]);

  // Load preview function
  const loadPreview = useCallback(async (pdfFile: File, page: number, currentDpi: number, currentFormat: 'jpeg' | 'png', currentQuality: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('page', page.toString());
      formData.append('dpi', currentDpi.toString());
      formData.append('format', currentFormat);
      formData.append('quality', currentQuality.toString());

      const response = await fetch('/api/preview', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Preview failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      setPreviewUrl((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return url;
      });
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  // Auto-update preview when parameters change (with debounce)
  useEffect(() => {
    if (!file || !analysis) return;

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    previewTimeoutRef.current = setTimeout(() => {
      loadPreview(file, previewPage, effectiveDpi, format, quality);
    }, 300);

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [file, analysis, effectiveDpi, format, quality, previewPage, loadPreview]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setAnalysis(null);
    setPreviewUrl(null);
    setError(null);
    setPreviewPage(1);
    setConversionProgress(0);
    setConversionStatus('');
    setDpi(''); // Reset to auto

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file || !analysis) return;

    setIsConverting(true);
    setError(null);
    setConversionProgress(0);
    setConversionStatus('Preparing conversion...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dpi', effectiveDpi.toString());
      formData.append('format', format);
      formData.append('quality', quality.toString());

      const totalPages = analysis.pageCount;
      const progressInterval = setInterval(() => {
        setConversionProgress((prev) => {
          if (prev >= 90) return prev;
          const increment = Math.max(1, Math.floor(80 / totalPages));
          const newProgress = Math.min(prev + increment, 90);
          setConversionStatus(`Converting page ${Math.ceil((newProgress / 100) * totalPages)} of ${totalPages}...`);
          return newProgress;
        });
      }, 500);

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Conversion failed');
      }

      setConversionProgress(95);
      setConversionStatus('Downloading CBZ file...');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, '.cbz');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setConversionProgress(100);
      setConversionStatus(`Done! Output: ~${(blob.size / (1024 * 1024)).toFixed(1)} MB`);

      setTimeout(() => {
        setConversionProgress(0);
        setConversionStatus('');
      }, 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
      setConversionProgress(0);
      setConversionStatus('');
    } finally {
      setIsConverting(false);
    }
  }, [file, analysis, effectiveDpi, format, quality]);

  const handleOptimize = useCallback(async () => {
    if (!file) return;

    setIsOptimizing(true);
    setError(null);
    setOptimalParams(null);
    setTestResults([]);
    setSamplePages([]);
    setOptimizeProgress(0);
    setOptimizeStatus('Starting...');
    setCurrentTest(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', 'balanced');

      const response = await fetch('/api/optimize-stream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Optimization failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      const intermediateResults: TestResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'status':
                  setOptimizeStatus(data.message);
                  setOptimizeProgress(data.progress || 0);
                  if (data.samplePages) setSamplePages(data.samplePages);
                  if (data.totalConfigs) setCurrentTest({ current: 0, total: data.totalConfigs });
                  break;

                case 'testing':
                  setOptimizeStatus(data.message);
                  setOptimizeProgress(data.progress || 0);
                  setCurrentTest({ current: data.current, total: data.total });
                  break;

                case 'result':
                  intermediateResults.push(data.result);
                  setTestResults([...intermediateResults]);
                  setOptimizeProgress(data.progress || 0);
                  break;

                case 'complete':
                  setOptimalParams(data.optimal);
                  setTestResults(data.testResults || []);
                  setSamplePages(data.samplePages || []);
                  setOptimizeProgress(100);
                  setOptimizeStatus('Complete!');
                  setCurrentTest(null);
                  // Apply optimal parameters
                  if (data.optimal) {
                    setDpi(data.optimal.dpi.toString());
                    setFormat(data.optimal.format);
                    setQuality(data.optimal.quality);
                  }
                  break;

                case 'error':
                  setOptimizeStatus(data.message);
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  }, [file]);

  // Original image info from direct extraction
  const [originalImageInfo, setOriginalImageInfo] = useState<{ width: number; height: number; method: string } | null>(null);

  // Load comparison images
  const loadComparisonImages = useCallback(async () => {
    if (!file || !analysis) return;

    setCompareMode(true);
    setCompareZoom(1);
    setComparePan({ x: 0, y: 0 });
    setOriginalImageInfo(null);

    // Load original via direct extraction
    const originalFormData = new FormData();
    originalFormData.append('file', file);
    originalFormData.append('page', previewPage.toString());

    // Load converted (current settings)
    const convertedFormData = new FormData();
    convertedFormData.append('file', file);
    convertedFormData.append('page', previewPage.toString());
    convertedFormData.append('dpi', effectiveDpi.toString());
    convertedFormData.append('format', format);
    convertedFormData.append('quality', quality.toString());

    try {
      const [originalRes, convertedRes] = await Promise.all([
        fetch('/api/extract-preview', { method: 'POST', body: originalFormData }),
        fetch('/api/preview', { method: 'POST', body: convertedFormData }),
      ]);

      if (originalRes.ok && convertedRes.ok) {
        // Get extraction info from headers
        const extractMethod = originalRes.headers.get('X-Extraction-Method') || 'unknown';
        const imgWidth = parseInt(originalRes.headers.get('X-Image-Width') || '0');
        const imgHeight = parseInt(originalRes.headers.get('X-Image-Height') || '0');
        setOriginalImageInfo({ width: imgWidth, height: imgHeight, method: extractMethod });

        const [originalBlob, convertedBlob] = await Promise.all([
          originalRes.blob(),
          convertedRes.blob(),
        ]);

        setOriginalPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(originalBlob);
        });
        setConvertedPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(convertedBlob);
        });
      }
    } catch (err) {
      console.error('Failed to load comparison images:', err);
    }
  }, [file, analysis, previewPage, effectiveDpi, format, quality]);

  // Direct extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractStatus, setExtractStatus] = useState('');

  // Handle direct extraction
  const handleDirectExtract = useCallback(async () => {
    if (!file) return;

    setIsExtracting(true);
    setError(null);
    setExtractProgress(0);
    setExtractStatus('Starting direct extraction...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Direct extraction failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'status':
                  setExtractStatus(data.message);
                  setExtractProgress(data.progress || 0);
                  break;

                case 'progress':
                  setExtractStatus(data.message);
                  setExtractProgress(data.progress || 0);
                  break;

                case 'complete':
                  setExtractProgress(100);
                  setExtractStatus(`Done! ${data.outputSizeMB.toFixed(1)} MB (${Math.round(data.sizeRatio * 100)}% of original)`);

                  // Download the CBZ file
                  const binaryString = atob(data.data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const blob = new Blob([bytes], { type: 'application/zip' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = file.name.replace(/\.pdf$/i, '_direct.cbz');
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);

                  setTimeout(() => {
                    setExtractProgress(0);
                    setExtractStatus('');
                  }, 5000);
                  break;

                case 'error':
                  setExtractStatus(data.message);
                  setError(data.message);
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Direct extraction failed');
      setExtractProgress(0);
      setExtractStatus('');
    } finally {
      setIsExtracting(false);
    }
  }, [file]);

  // Comparison mouse handlers
  const handleCompareMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - comparePan.x, y: e.clientY - comparePan.y });
  }, [comparePan]);

  const handleCompareMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setComparePan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleCompareMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleCompareWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCompareZoom((z) => Math.max(0.5, Math.min(5, z * delta)));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.pdf')) {
      handleFileSelect(droppedFile);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-4">
          <h1 className="text-2xl font-bold text-blue-400">PDF to CBZ Converter</h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel - Settings */}
          <div className="space-y-3">
            {/* File Upload */}
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                file ? 'border-blue-500 bg-blue-500/10' : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) handleFileSelect(selectedFile);
                }}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-gray-400 text-sm">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p>Drop PDF here or click to browse</p>
                </div>
              )}
            </div>

            {/* Analysis Results */}
            {isAnalyzing && (
              <div className="bg-gray-800 rounded-lg p-3 animate-pulse">
                <p className="text-center text-gray-400 text-sm">Analyzing PDF...</p>
              </div>
            )}

            {analysis && (
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex gap-4">
                    <span><span className="text-gray-400">Pages:</span> {analysis.pageCount}</span>
                    <span><span className="text-gray-400">Size:</span> <span className="text-green-400">{analysis.pdfSizeMB.toFixed(1)}MB</span></span>
                    <span><span className="text-gray-400">Native:</span> {analysis.nativeDpi}DPI</span>
                    <span><span className="text-gray-400">HD:</span> {analysis.recommendedDpi}DPI</span>
                  </div>
                  <span className={`font-bold ${
                    estimatedSize && analysis.pdfSizeMB && Math.abs(estimatedSize - analysis.pdfSizeMB) < analysis.pdfSizeMB * 0.2
                      ? 'text-green-400' : 'text-yellow-400'
                  }`}>
                    ~{estimatedSize?.toFixed(0) || '?'}MB
                  </span>
                </div>
              </div>
            )}

            {/* Auto-Optimize Button */}
            {analysis && (
              <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Auto-find optimal DPI/quality</span>
                  <button
                    onClick={handleOptimize}
                    disabled={isOptimizing || !file}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-medium text-sm transition-colors flex items-center gap-2"
                  >
                    {isOptimizing ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {currentTest ? `${currentTest.current}/${currentTest.total}` : `${optimizeProgress}%`}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Find Optimal
                      </>
                    )}
                  </button>
                </div>

                {/* Progress Bar */}
                {isOptimizing && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300" style={{ width: `${optimizeProgress}%` }} />
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{optimizeStatus}</div>
                  </div>
                )}

                {/* Optimal Results */}
                {optimalParams && (
                  <div className="mt-2 p-2 bg-green-900/30 border border-green-500/30 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <span><span className="text-gray-400">DPI:</span> {optimalParams.dpi}</span>
                        <span><span className="text-gray-400">Format:</span> {optimalParams.format.toUpperCase()}</span>
                        <span><span className="text-gray-400">Q:</span> {optimalParams.quality}%</span>
                      </div>
                      <span className={`font-medium ${optimalParams.sizeRatio <= 1.1 ? 'text-green-400' : 'text-yellow-400'}`}>
                        ~{optimalParams.estimatedSizeMB.toFixed(1)}MB
                      </span>
                    </div>
                  </div>
                )}

                {/* Show all test results toggle */}
                {testResults.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowAllResults(!showAllResults)}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      <svg className={`w-3 h-3 transition-transform ${showAllResults ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {showAllResults ? 'Hide' : 'Show'} {testResults.length} results
                    </button>

                    {showAllResults && (
                      <div className="mt-1 max-h-32 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="text-gray-400 sticky top-0 bg-gray-800">
                            <tr>
                              <th className="text-left py-0.5">DPI</th>
                              <th className="text-left py-0.5">Fmt</th>
                              <th className="text-left py-0.5">Q</th>
                              <th className="text-right py-0.5">Size</th>
                              <th className="text-right py-0.5">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {testResults.slice(0, 15).map((r, i) => (
                              <tr
                                key={i}
                                className={`border-t border-gray-700 cursor-pointer hover:bg-gray-700/50 ${
                                  optimalParams && r.dpi === optimalParams.dpi && r.format === optimalParams.format && r.quality === optimalParams.quality ? 'bg-green-900/30' : ''
                                }`}
                                onClick={() => { setDpi(r.dpi.toString()); setFormat(r.format); setQuality(r.quality); }}
                              >
                                <td className="py-0.5">{r.dpi}</td>
                                <td className="py-0.5">{r.format}</td>
                                <td className="py-0.5">{r.quality}%</td>
                                <td className="py-0.5 text-right">{r.estimatedSizeMB.toFixed(1)}MB</td>
                                <td className={`py-0.5 text-right ${r.qualityScore >= 90 ? 'text-green-400' : r.qualityScore >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>{r.qualityScore}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Conversion Options */}
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="space-y-3">
                {/* Quality Mode + Custom DPI */}
                {analysis && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setMatchPdfSize(true); setDpi(''); }}
                      className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                        matchPdfSize && !dpi ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Match PDF ({analysis.nativeDpi})
                    </button>
                    <button
                      onClick={() => { setMatchPdfSize(false); setDpi(''); }}
                      className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                        !matchPdfSize && !dpi ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      HD ({analysis.recommendedDpi})
                    </button>
                    <input
                      type="number"
                      min="72"
                      max="600"
                      value={dpi}
                      onChange={(e) => setDpi(e.target.value)}
                      placeholder={`${effectiveDpi}`}
                      className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-center focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Format + Quality */}
                <div className="flex items-center gap-4">
                  <div className="flex gap-3 text-sm">
                    <label className="flex items-center cursor-pointer">
                      <input type="radio" name="format" value="jpeg" checked={format === 'jpeg'} onChange={() => setFormat('jpeg')} className="mr-1.5" />
                      JPEG
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input type="radio" name="format" value="png" checked={format === 'png'} onChange={() => setFormat('png')} className="mr-1.5" />
                      PNG
                    </label>
                  </div>
                  {format === 'jpeg' && (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="range"
                        min="50"
                        max="100"
                        value={quality}
                        onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                        className="flex-1 accent-blue-500"
                      />
                      <span className="text-sm text-gray-400 w-10">{quality}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Convert Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleConvert}
                disabled={!file || isConverting || isExtracting}
                className="px-3 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-medium transition-colors"
              >
                {isConverting ? 'Converting...' : `Convert (~${estimatedSize?.toFixed(0) || '?'}MB)`}
              </button>
              <button
                onClick={handleDirectExtract}
                disabled={!file || isExtracting || isConverting}
                className="px-3 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-medium transition-colors"
              >
                {isExtracting ? 'Extracting...' : 'Direct Extract'}
              </button>
            </div>

            {/* Progress Bars */}
            {(isConverting || conversionProgress > 0) && (
              <div className="bg-gray-800 rounded p-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{conversionStatus}</span>
                  <span className="text-blue-400">{conversionProgress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${conversionProgress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${conversionProgress}%` }} />
                </div>
              </div>
            )}

            {(isExtracting || extractProgress > 0) && (
              <div className="bg-gray-800 rounded p-2 border border-green-500/30">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">{extractStatus}</span>
                  <span className="text-green-400">{extractProgress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${extractProgress === 100 ? 'bg-green-500' : 'bg-green-600'}`} style={{ width: `${extractProgress}%` }} />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded p-2 text-red-300 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-400">
                {compareMode ? 'Comparison' : 'Live Preview'}
                {isPreviewLoading && (
                  <span className="ml-2 text-sm text-gray-400 animate-pulse">updating...</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {analysis && previewUrl && !compareMode && (
                  <button
                    onClick={loadComparisonImages}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium"
                  >
                    Compare
                  </button>
                )}
                {compareMode && (
                  <button
                    onClick={() => setCompareMode(false)}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm font-medium"
                  >
                    Back
                  </button>
                )}
                {analysis && analysis.pageCount > 1 && (
                  <>
                    <button
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      disabled={previewPage <= 1 || isPreviewLoading}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded"
                    >
                      &lt;
                    </button>
                    <span className="text-sm">
                      Page {previewPage} of {analysis.pageCount}
                    </span>
                    <button
                      onClick={() => setPreviewPage((p) => Math.min(analysis.pageCount, p + 1))}
                      disabled={previewPage >= analysis.pageCount || isPreviewLoading}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded"
                    >
                      &gt;
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Normal Preview Mode */}
            {!compareMode && (
              <>
                <div className="aspect-[3/4] bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden relative">
                  {isPreviewLoading && previewUrl && (
                    <div className="absolute inset-0 bg-gray-900/50 flex items-center justify-center z-10">
                      <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Page preview"
                      className={`max-w-full max-h-full object-contain transition-opacity ${
                        isPreviewLoading ? 'opacity-50' : 'opacity-100'
                      }`}
                    />
                  ) : isPreviewLoading ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-gray-400">Loading preview...</span>
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center p-4">
                      <svg className="w-16 h-16 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p>Upload a PDF to see preview</p>
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="mt-3 p-2 bg-gray-900 rounded text-xs text-gray-400 text-center">
                    <span className="text-blue-400">DPI:</span> {effectiveDpi} |
                    <span className="text-blue-400 ml-2">Format:</span> {format.toUpperCase()}
                    {format === 'jpeg' && (
                      <> | <span className="text-blue-400">Quality:</span> {quality}%</>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Comparison Mode */}
            {compareMode && (
              <div className="space-y-3">
                {/* Zoom controls */}
                <div className="flex items-center justify-center gap-4 text-sm">
                  <button
                    onClick={() => setCompareZoom((z) => Math.max(0.5, z - 0.25))}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    -
                  </button>
                  <span className="text-gray-300 w-20 text-center">{Math.round(compareZoom * 100)}%</span>
                  <button
                    onClick={() => setCompareZoom((z) => Math.min(5, z + 0.25))}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    +
                  </button>
                  <button
                    onClick={() => { setCompareZoom(1); setComparePan({ x: 0, y: 0 }); }}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                  >
                    Reset
                  </button>
                </div>

                {/* Side by side comparison */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Original */}
                  <div className="space-y-1">
                    <div className="text-center text-xs font-medium text-green-400">
                      Original {originalImageInfo ? `(${originalImageInfo.width}x${originalImageInfo.height}, ${originalImageInfo.method})` : ''}
                    </div>
                    <div
                      className="aspect-[3/4] bg-gray-900 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative"
                      onMouseDown={handleCompareMouseDown}
                      onMouseMove={handleCompareMouseMove}
                      onMouseUp={handleCompareMouseUp}
                      onMouseLeave={handleCompareMouseUp}
                      onWheel={handleCompareWheel}
                    >
                      {originalPreviewUrl ? (
                        <img
                          src={originalPreviewUrl}
                          alt="Original"
                          className="absolute select-none"
                          style={{
                            transform: `translate(${comparePan.x}px, ${comparePan.y}px) scale(${compareZoom})`,
                            transformOrigin: 'center center',
                            maxWidth: 'none',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Converted */}
                  <div className="space-y-1">
                    <div className="text-center text-xs font-medium text-blue-400">
                      Converted (DPI {effectiveDpi}, {format.toUpperCase()} Q{quality}%)
                    </div>
                    <div
                      className="aspect-[3/4] bg-gray-900 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative"
                      onMouseDown={handleCompareMouseDown}
                      onMouseMove={handleCompareMouseMove}
                      onMouseUp={handleCompareMouseUp}
                      onMouseLeave={handleCompareMouseUp}
                      onWheel={handleCompareWheel}
                    >
                      {convertedPreviewUrl ? (
                        <img
                          src={convertedPreviewUrl}
                          alt="Converted"
                          className="absolute select-none"
                          style={{
                            transform: `translate(${comparePan.x}px, ${comparePan.y}px) scale(${compareZoom})`,
                            transformOrigin: 'center center',
                            maxWidth: 'none',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-center text-xs text-gray-500">
                  Scroll to zoom, drag to pan (synchronized)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 text-center text-gray-600 text-xs">
          PDF to CBZ Converter
        </footer>
      </div>
    </div>
  );
}
