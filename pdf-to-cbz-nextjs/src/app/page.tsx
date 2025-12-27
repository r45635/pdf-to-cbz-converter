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
  const [error, setError] = useState<string | null>(null);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionStatus, setConversionStatus] = useState<string>('');

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
  const estimatedSize = useMemo(() => {
    if (!analysis) return null;

    const currentDpi = effectiveDpi;
    const baseScale = analysis.recommendedDpi / 72;

    // Recalculate pixel dimensions based on DPI
    let totalPixels = 0;
    for (const page of analysis.pages) {
      const scale = currentDpi / 72;
      const widthPx = page.widthPt * scale;
      const heightPx = page.heightPt * scale;
      totalPixels += widthPx * heightPx;
    }

    // Bytes per pixel estimates for comic book content
    let bytesPerPixel: number;
    if (format === 'png') {
      bytesPerPixel = 1.5; // PNG with comic art
    } else {
      // JPEG: quality affects size significantly for detailed comic artwork
      // At 85% quality: ~0.32 bytes/pixel, at 100%: ~0.55, at 50%: ~0.12
      bytesPerPixel = 0.05 + (quality / 100) * 0.50;
    }

    return (totalPixels * bytesPerPixel) / (1024 * 1024);
  }, [analysis, effectiveDpi, format, quality]);

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
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-400 mb-2">
            PDF to CBZ Converter
          </h1>
          <p className="text-gray-400">
            Convert PDF files to CBZ format for comic book readers
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Settings */}
          <div className="space-y-6">
            {/* File Upload */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
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
                <div>
                  <svg className="w-12 h-12 mx-auto text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg font-medium">{file.name}</p>
                  <p className="text-gray-400 text-sm">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <svg className="w-12 h-12 mx-auto text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-lg">Drop PDF here or click to browse</p>
                  <p className="text-gray-500 text-sm mt-1">Supports PDF files</p>
                </div>
              )}
            </div>

            {/* Analysis Results */}
            {isAnalyzing && (
              <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
                <p className="text-center text-gray-400">Analyzing PDF...</p>
              </div>
            )}

            {analysis && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-blue-400">PDF Analysis</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400">Pages:</span>
                    <span className="ml-2 font-medium">{analysis.pageCount}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">PDF Size:</span>
                    <span className="ml-2 font-medium text-green-400">{analysis.pdfSizeMB.toFixed(1)} MB</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Native DPI:</span>
                    <span className="ml-2 font-medium">{analysis.nativeDpi}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">HD DPI:</span>
                    <span className="ml-2 font-medium">{analysis.recommendedDpi}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Estimated CBZ:</span>
                    <span className={`font-bold text-lg ${
                      estimatedSize && analysis.pdfSizeMB && Math.abs(estimatedSize - analysis.pdfSizeMB) < analysis.pdfSizeMB * 0.2
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }`}>
                      ~{estimatedSize?.toFixed(0) || '?'} MB
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Conversion Options */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-blue-400">Conversion Options</h3>

              <div className="space-y-4">
                {/* Quality Mode */}
                {analysis && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Quality Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setMatchPdfSize(true); setDpi(''); }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          matchPdfSize && !dpi
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Match PDF (~{analysis.nativeDpi} DPI)
                      </button>
                      <button
                        onClick={() => { setMatchPdfSize(false); setDpi(''); }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          !matchPdfSize && !dpi
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        HD Quality ({analysis.recommendedDpi} DPI)
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom DPI */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Custom DPI (overrides mode)
                  </label>
                  <input
                    type="number"
                    min="72"
                    max="600"
                    value={dpi}
                    onChange={(e) => setDpi(e.target.value)}
                    placeholder={`Auto: ${effectiveDpi}`}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Image Format
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="format"
                        value="jpeg"
                        checked={format === 'jpeg'}
                        onChange={() => setFormat('jpeg')}
                        className="mr-2"
                      />
                      JPEG (smaller)
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="format"
                        value="png"
                        checked={format === 'png'}
                        onChange={() => setFormat('png')}
                        className="mr-2"
                      />
                      PNG (lossless)
                    </label>
                  </div>
                </div>

                {/* Quality (JPEG only) */}
                {format === 'jpeg' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      JPEG Quality: {quality}%
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={quality}
                      onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Smaller file</span>
                      <span>Higher quality</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Convert Button */}
            <button
              onClick={handleConvert}
              disabled={!file || isConverting}
              className="w-full px-4 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-medium text-lg transition-colors"
            >
              {isConverting ? 'Converting...' : `Convert to CBZ (~${estimatedSize?.toFixed(0) || '?'} MB)`}
            </button>

            {/* Progress Bar */}
            {(isConverting || conversionProgress > 0) && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300">{conversionStatus}</span>
                  <span className="text-blue-400 font-medium">{conversionProgress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      conversionProgress === 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${conversionProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-blue-400">
                Live Preview
                {isPreviewLoading && (
                  <span className="ml-2 text-sm text-gray-400 animate-pulse">updating...</span>
                )}
              </h3>
              {analysis && analysis.pageCount > 1 && (
                <div className="flex items-center gap-2">
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
                </div>
              )}
            </div>

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
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>PDF to CBZ Converter - Next.js Version</p>
        </footer>
      </div>
    </div>
  );
}
