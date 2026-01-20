'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/useTranslation';
import LanguageSelector from '@/components/LanguageSelector';

type ConversionMode = 'pdf-to-cbz' | 'cbz-to-pdf';

interface PdfAnalysisResult {
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

interface CbzAnalysisResult {
  pageCount: number;
  pages: {
    pageNumber: number;
    fileName: string;
    width: number;
    height: number;
    format: string;
    sizeKB: number;
  }[];
  cbzSizeMB: number;
}

type AnalysisResult = PdfAnalysisResult | CbzAnalysisResult;

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

function isPdfAnalysis(analysis: AnalysisResult): analysis is PdfAnalysisResult {
  return 'pdfSizeMB' in analysis;
}

export default function Home() {
  const { lang, setLang, t } = useTranslation();
  const [mode, setMode] = useState<ConversionMode>('pdf-to-cbz');
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);

  // Options
  const [dpi, setDpi] = useState<string>('');
  const [format, setFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [quality, setQuality] = useState(85);
  const [matchPdfSize, setMatchPdfSize] = useState(true); // Default: match PDF size
  const [cbzScale, setCbzScale] = useState(100); // Scale percentage for CBZ→PDF (100 = original size)

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

  // Get effective DPI based on settings (PDF mode only)
  const effectiveDpi = useMemo(() => {
    if (dpi) return parseInt(dpi, 10);
    if (!analysis || !isPdfAnalysis(analysis)) return 150;
    return matchPdfSize ? analysis.nativeDpi : analysis.recommendedDpi;
  }, [dpi, analysis, matchPdfSize]);

  // Calculate estimated PDF size for CBZ→PDF mode
  const estimatedCbzToPdfSize = useMemo(() => {
    if (!analysis || isPdfAnalysis(analysis)) return null;

    // Calculate based on current settings
    const cbzAnalysis = analysis as CbzAnalysisResult;
    let totalEstimatedBytes = 0;

    for (const page of cbzAnalysis.pages) {
      // Scale the dimensions
      const scaledWidth = Math.round(page.width * (cbzScale / 100));
      const scaledHeight = Math.round(page.height * (cbzScale / 100));
      const totalPixels = scaledWidth * scaledHeight;

      // Estimate compressed size based on format and quality
      let bytesPerPixel: number;
      if (format === 'png') {
        bytesPerPixel = 0.8; // PNG compresses well for comic art
      } else {
        // JPEG: quality-based estimation
        bytesPerPixel = 0.05 + (quality / 100) * 0.30;
      }

      totalEstimatedBytes += totalPixels * bytesPerPixel;
    }

    // Add PDF overhead (~5%)
    return (totalEstimatedBytes * 1.05) / (1024 * 1024);
  }, [analysis, cbzScale, format, quality]);

  // Calculate estimated size based on current settings (PDF mode only)
  // Uses real test results when available, otherwise falls back to formula
  const estimatedSize = useMemo(() => {
    if (!analysis || !isPdfAnalysis(analysis)) return null;

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

  // Load CBZ preview
  const loadCbzPreview = useCallback(async (cbzFile: File, page: number) => {
    setIsPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', cbzFile);
      formData.append('page', page.toString());

      const response = await fetch('/api/preview-cbz', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      }
    } catch (err) {
      console.error('CBZ preview error:', err);
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
      if (mode === 'pdf-to-cbz') {
        loadPreview(file, previewPage, effectiveDpi, format, quality);
      } else {
        loadCbzPreview(file, previewPage);
      }
    }, 300);

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [file, analysis, mode, effectiveDpi, format, quality, previewPage, loadPreview, loadCbzPreview]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    // Detect mode from file extension
    const fileName = selectedFile.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isCbz = fileName.endsWith('.cbz');

    if (!isPdf && !isCbz) {
      setError('Please select a PDF or CBZ file');
      return;
    }

    const newMode = isPdf ? 'pdf-to-cbz' : 'cbz-to-pdf';
    setMode(newMode);
    setFile(selectedFile);
    setAnalysis(null);
    setPreviewUrl(null);
    setError(null);
    setPreviewPage(1);
    setConversionProgress(0);
    setConversionStatus('');
    setDpi(''); // Reset to auto
    setOptimalParams(null);
    setTestResults([]);
    // Clean up comparison/preview state
    setCompareMode(false);
    setOriginalPreviewUrl(null);
    setConvertedPreviewUrl(null);
    setSourceImageData(null);
    setOriginalImageInfo(null);
    setConvertedImageInfo(null);
    setCachedOriginalPage(null);
    setCompareZoom(1);
    setComparePan({ x: 0, y: 0 });

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const endpoint = isPdf ? '/api/analyze' : '/api/analyze-cbz';
      const response = await fetch(endpoint, {
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

      let endpoint: string;
      let outputExtension: string;
      let outputMimeLabel: string;

      if (mode === 'pdf-to-cbz') {
        endpoint = '/api/convert';
        outputExtension = '.cbz';
        outputMimeLabel = 'CBZ';
        formData.append('dpi', effectiveDpi.toString());
        formData.append('format', format);
        formData.append('quality', quality.toString());
      } else {
        endpoint = '/api/convert-cbz';
        outputExtension = '.pdf';
        outputMimeLabel = 'PDF';
        formData.append('quality', quality.toString());
      }

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

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Conversion failed');
      }

      setConversionProgress(95);
      setConversionStatus(`Downloading ${outputMimeLabel} file...`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseFileName = file.name.replace(/\.(pdf|cbz)$/i, '');
      a.download = baseFileName + outputExtension;
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
  }, [file, analysis, effectiveDpi, format, quality, mode]);

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
  const [originalImageInfo, setOriginalImageInfo] = useState<{ width: number; height: number; method: string; sizeKB: number } | null>(null);
  const [convertedImageInfo, setConvertedImageInfo] = useState<{ sizeKB: number; width: number; height: number } | null>(null);
  const [isCompareLoading, setIsCompareLoading] = useState(false);
  const [cachedOriginalPage, setCachedOriginalPage] = useState<number | null>(null);

  // Source image for client-side processing (same as original)
  // nativeDpi = the DPI at which the source image was extracted (its "natural" resolution)
  // For CBZ, nativeDpi is not used (scale % is used instead)
  const [sourceImageData, setSourceImageData] = useState<{ img: HTMLImageElement; nativeDpi: number } | null>(null);

  // Load source image (extract from PDF or CBZ - only when page changes)
  const loadSourceImage = useCallback(async () => {
    if (!file || !analysis) return;

    setIsCompareLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('page', previewPage.toString());

    try {
      // Use appropriate endpoint based on mode
      const endpoint = mode === 'pdf-to-cbz' ? '/api/extract-preview' : '/api/preview-cbz';
      const res = await fetch(endpoint, { method: 'POST', body: formData });

      if (res.ok) {
        let imgWidth = 0;
        let imgHeight = 0;
        let extractMethod = 'direct';

        if (mode === 'pdf-to-cbz') {
          extractMethod = res.headers.get('X-Extraction-Method') || 'unknown';
          imgWidth = parseInt(res.headers.get('X-Image-Width') || '0');
          imgHeight = parseInt(res.headers.get('X-Image-Height') || '0');
        }

        const blob = await res.blob();

        // Create object URL for the image
        const url = URL.createObjectURL(blob);

        // Load into Image element to get dimensions (for CBZ we need this)
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = url;
        });

        // For CBZ mode, get dimensions from loaded image
        if (mode === 'cbz-to-pdf') {
          imgWidth = img.width;
          imgHeight = img.height;
        }

        setOriginalImageInfo({
          width: imgWidth,
          height: imgHeight,
          method: extractMethod,
          sizeKB: Math.round(blob.size / 1024)
        });

        // Set as original preview
        setOriginalPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });

        // Use nativeDpi from analysis as reference (for PDF), or 100 for CBZ (scale-based)
        const nativeDpi = isPdfAnalysis(analysis) ? analysis.nativeDpi : 100;
        setSourceImageData({ img, nativeDpi });
      }

      setCachedOriginalPage(previewPage);
    } catch (err) {
      console.error('Failed to load source image:', err);
    } finally {
      setIsCompareLoading(false);
    }
  }, [file, analysis, mode, previewPage]);

  // Apply conversion settings client-side (instant!)
  const applyConversionSettings = useCallback(() => {
    if (!sourceImageData) return;

    const { img, nativeDpi } = sourceImageData;

    // Calculate target size based on mode
    let scaleRatio: number;
    if (mode === 'pdf-to-cbz') {
      // PDF mode: use DPI ratio
      scaleRatio = effectiveDpi / nativeDpi;
    } else {
      // CBZ mode: use scale percentage
      scaleRatio = cbzScale / 100;
    }

    const targetWidth = Math.round(img.width * scaleRatio);
    const targetHeight = Math.round(img.height * scaleRatio);

    // Create canvas at target size
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw scaled image
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Convert to data URL with specified format and quality
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const qualityValue = format === 'jpeg' ? quality / 100 : undefined;
    const dataUrl = canvas.toDataURL(mimeType, qualityValue);

    // Calculate actual size from base64
    const base64Length = dataUrl.length - dataUrl.indexOf(',') - 1;
    const sizeBytes = base64Length * 0.75; // base64 to binary ratio
    const sizeKB = Math.round(sizeBytes / 1024);

    setConvertedImageInfo({
      sizeKB,
      width: targetWidth,
      height: targetHeight
    });

    setConvertedPreviewUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return dataUrl;
    });
  }, [sourceImageData, mode, effectiveDpi, cbzScale, format, quality]);

  // Load comparison images (for initial compare or page change)
  const loadComparisonImages = useCallback(async (resetView = true) => {
    if (!file || !analysis) return;

    setCompareMode(true);
    if (resetView) {
      setCompareZoom(1);
      setComparePan({ x: 0, y: 0 });
    }

    // Load source only if page changed
    if (cachedOriginalPage !== previewPage) {
      await loadSourceImage();
    }
  }, [file, analysis, previewPage, cachedOriginalPage, loadSourceImage]);

  // Track previous page for detecting page changes
  const prevPageRef = useRef(previewPage);

  // Reload source image only when page changes in compare mode
  useEffect(() => {
    if (compareMode && file) {
      if (prevPageRef.current !== previewPage) {
        prevPageRef.current = previewPage;
        setCompareZoom(1);
        setComparePan({ x: 0, y: 0 });
        loadSourceImage();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPage]);

  // Apply conversion settings instantly when they change (client-side processing)
  useEffect(() => {
    if (compareMode && sourceImageData) {
      applyConversionSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImageData, effectiveDpi, cbzScale, format, quality]);

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

    // Select endpoint and output settings based on mode
    const endpoint = mode === 'pdf-to-cbz' ? '/api/extract' : '/api/extract-cbz';
    const outputExtension = mode === 'pdf-to-cbz' ? '_direct.cbz' : '_direct.pdf';
    const mimeType = mode === 'pdf-to-cbz' ? 'application/zip' : 'application/pdf';
    const inputExtRegex = mode === 'pdf-to-cbz' ? /\.pdf$/i : /\.cbz$/i;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(endpoint, {
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

                  // Download the output file
                  const binaryString = atob(data.data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const blob = new Blob([bytes], { type: mimeType });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = file.name.replace(inputExtRegex, outputExtension);
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
  }, [file, mode]);

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
    setCompareZoom((z) => Math.max(0.5, Math.min(10, z * delta)));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const fileName = droppedFile.name.toLowerCase();
      if (fileName.endsWith('.pdf') || fileName.endsWith('.cbz')) {
        handleFileSelect(droppedFile);
      }
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-blue-400">
              {mode === 'pdf-to-cbz' ? t('pdfToCbz') : t('cbzToPdf')}
            </h1>
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => {
                  setMode('pdf-to-cbz');
                  setFile(null);
                  setAnalysis(null);
                  setPreviewUrl(null);
                  setError(null);
                  // Clean up comparison/preview state
                  setCompareMode(false);
                  setOriginalPreviewUrl(null);
                  setConvertedPreviewUrl(null);
                  setSourceImageData(null);
                  setOriginalImageInfo(null);
                  setConvertedImageInfo(null);
                  setCachedOriginalPage(null);
                  setCompareZoom(1);
                  setComparePan({ x: 0, y: 0 });
                }}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  mode === 'pdf-to-cbz' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('pdfToCbz')}
              </button>
              <button
                onClick={() => {
                  setMode('cbz-to-pdf');
                  setFile(null);
                  setAnalysis(null);
                  setPreviewUrl(null);
                  setError(null);
                  // Clean up comparison/preview state
                  setCompareMode(false);
                  setOriginalPreviewUrl(null);
                  setConvertedPreviewUrl(null);
                  setSourceImageData(null);
                  setOriginalImageInfo(null);
                  setConvertedImageInfo(null);
                  setCachedOriginalPage(null);
                  setCompareZoom(1);
                  setComparePan({ x: 0, y: 0 });
                }}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  mode === 'cbz-to-pdf' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t('cbzToPdf')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Language Selector */}
            <LanguageSelector currentLang={lang} onLanguageChange={setLang} />
            <Link
              href="/batch"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {t('batchMode')}
            </Link>
          </div>
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
                accept={mode === 'pdf-to-cbz' ? '.pdf' : '.cbz'}
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
                  <p>{mode === 'pdf-to-cbz' ? t('dropPdf') : t('dropCbz')}</p>
                </div>
              )}
            </div>

            {/* Analysis Results */}
            {isAnalyzing && (
              <div className="bg-gray-800 rounded-lg p-3 animate-pulse">
                <p className="text-center text-gray-400 text-sm">{t('analyzing')}</p>
              </div>
            )}

            {analysis && (
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  {isPdfAnalysis(analysis) ? (
                    <>
                      <div className="flex gap-4">
                        <span><span className="text-gray-400">{t('pages')}:</span> {analysis.pageCount}</span>
                        <span><span className="text-gray-400">{t('size')}:</span> <span className="text-green-400">{analysis.pdfSizeMB.toFixed(1)}MB</span></span>
                        <span><span className="text-gray-400">{t('native')}:</span> {analysis.nativeDpi}DPI</span>
                        <span><span className="text-gray-400">{t('hd')}:</span> {analysis.recommendedDpi}DPI</span>
                      </div>
                      <span className={`font-bold ${
                        estimatedSize && analysis.pdfSizeMB && Math.abs(estimatedSize - analysis.pdfSizeMB) < analysis.pdfSizeMB * 0.2
                          ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        ~{estimatedSize?.toFixed(0) || '?'}MB
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-4">
                        <span><span className="text-gray-400">{t('images')}:</span> {analysis.pageCount}</span>
                        <span><span className="text-gray-400">{t('size')}:</span> <span className="text-green-400">{analysis.cbzSizeMB.toFixed(1)}MB</span></span>
                        {analysis.pages.length > 0 && (
                          <span><span className="text-gray-400">{t('dimensions')}:</span> {analysis.pages[0].width}x{analysis.pages[0].height}</span>
                        )}
                      </div>
                      <span className={`font-bold ${
                        estimatedCbzToPdfSize && analysis.cbzSizeMB && Math.abs(estimatedCbzToPdfSize - analysis.cbzSizeMB) < analysis.cbzSizeMB * 0.2
                          ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        ~{estimatedCbzToPdfSize?.toFixed(0) || '?'}MB
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Auto-Optimize Button - PDF mode only */}
            {analysis && mode === 'pdf-to-cbz' && isPdfAnalysis(analysis) && (
              <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{t('autoOptimize')}</span>
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
                        {t('findOptimal')}
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
                      {showAllResults ? t('hideResults') : t('showResults')} {testResults.length} {t('results')}
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
                {/* Quality Mode + Custom DPI - PDF mode only */}
                {analysis && mode === 'pdf-to-cbz' && isPdfAnalysis(analysis) && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setMatchPdfSize(true); setDpi(''); }}
                      className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                        matchPdfSize && !dpi ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {t('matchPdf')} ({analysis.nativeDpi})
                    </button>
                    <button
                      onClick={() => { setMatchPdfSize(false); setDpi(''); }}
                      className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition-colors ${
                        !matchPdfSize && !dpi ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {t('hd')} ({analysis.recommendedDpi})
                    </button>
                    <input
                      type="number"
                      min="72"
                      max="600"
                      value={dpi || effectiveDpi}
                      onChange={(e) => setDpi(e.target.value)}
                      className="w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-center focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Format + Quality - unified for both modes */}
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
                        className={`flex-1 ${mode === 'pdf-to-cbz' ? 'accent-blue-500' : 'accent-green-500'}`}
                      />
                      <span className="text-sm text-gray-400 w-10">{quality}%</span>
                    </div>
                  )}
                </div>

                {/* Scale slider for CBZ→PDF */}
                {mode === 'cbz-to-pdf' && (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400">{t('scale')}:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCbzScale(100)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          cbzScale === 100 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        100%
                      </button>
                      <button
                        onClick={() => setCbzScale(75)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          cbzScale === 75 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        75%
                      </button>
                      <button
                        onClick={() => setCbzScale(50)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          cbzScale === 50 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        50%
                      </button>
                    </div>
                    <input
                      type="number"
                      min="25"
                      max="200"
                      value={cbzScale}
                      onChange={(e) => setCbzScale(parseInt(e.target.value, 10) || 100)}
                      className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-center focus:ring-1 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Convert Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleConvert}
                disabled={!file || isConverting || isExtracting}
                className={`px-3 py-3 ${mode === 'pdf-to-cbz' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-green-600 hover:bg-green-500'} disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-medium transition-colors`}
              >
                {isConverting ? t('converting') : mode === 'pdf-to-cbz'
                  ? `${t('convert')} (~${estimatedSize?.toFixed(0) || '?'}MB)`
                  : `${t('convert')} (~${estimatedCbzToPdfSize?.toFixed(0) || '?'}MB)`}
              </button>
              <button
                onClick={handleDirectExtract}
                disabled={!file || isExtracting || isConverting}
                className={`px-3 py-3 ${mode === 'pdf-to-cbz' ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:bg-gray-800 disabled:text-gray-500 rounded-lg font-medium transition-colors`}
              >
                {isExtracting ? t('extracting') : t('direct')}
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
                {compareMode ? t('comparison') : t('livePreview')}
                {isPreviewLoading && (
                  <span className="ml-2 text-sm text-gray-400 animate-pulse">{t('updating')}</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {analysis && previewUrl && !compareMode && (
                  <button
                    onClick={() => loadComparisonImages()}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium"
                  >
                    {t('compare')}
                  </button>
                )}
                {compareMode && (
                  <button
                    onClick={() => setCompareMode(false)}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm font-medium"
                  >
                    {t('back')}
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
                      {t('page')} {previewPage} {t('of')} {analysis.pageCount}
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
                {compareMode && (
                  <>
                    <span className="text-gray-600">|</span>
                    <button onClick={() => setCompareZoom((z) => Math.max(0.5, z - 0.25))} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">-</button>
                    <span className="text-sm text-gray-400 w-12 text-center">{Math.round(compareZoom * 100)}%</span>
                    <button onClick={() => setCompareZoom((z) => Math.min(10, z + 0.25))} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">+</button>
                    <button onClick={() => { setCompareZoom(1); setComparePan({ x: 0, y: 0 }); }} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">{t('reset')}</button>
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
                      <span className="text-gray-400">{t('loadingPreview')}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center p-4">
                      <svg className="w-16 h-16 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {mode === 'pdf-to-cbz' ? (
                        <p>{t('uploadPdf')}</p>
                      ) : analysis ? (
                        <p className="text-green-400">{t('cbzReady')} ({analysis.pageCount} {t('images')})</p>
                      ) : (
                        <p>{t('uploadCbz')}</p>
                      )}
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="mt-3 p-2 bg-gray-900 rounded text-xs text-gray-400 text-center">
                    {mode === 'pdf-to-cbz' ? (
                      <>
                        <span className="text-blue-400">DPI:</span> {effectiveDpi} |
                        <span className="text-blue-400 ml-2">Format:</span> {format.toUpperCase()}
                        {format === 'jpeg' && (
                          <> | <span className="text-blue-400">Quality:</span> {quality}%</>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-green-400">Scale:</span> {cbzScale}% |
                        <span className="text-green-400 ml-2">Format:</span> {format.toUpperCase()}
                        {format === 'jpeg' && (
                          <> | <span className="text-green-400">Quality:</span> {quality}%</>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Comparison Mode */}
            {compareMode && (
              <div className="space-y-2">
                {/* Side by side comparison */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Original */}
                  <div
                    className={`aspect-[3/4] bg-gray-900 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative flex items-center justify-center ${isCompareLoading ? 'opacity-50' : ''}`}
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
                        className="max-w-full max-h-full object-contain select-none"
                        style={{
                          transform: `translate(${comparePan.x}px, ${comparePan.y}px) scale(${compareZoom})`,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/80 text-xs text-green-400 px-1.5 py-0.5 rounded">
                      {t('original')} {originalImageInfo ? `${originalImageInfo.sizeKB}KB` : ''}
                    </div>
                  </div>

                  {/* Converted */}
                  <div
                    className="aspect-[3/4] bg-gray-900 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing relative flex items-center justify-center"
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
                        className="max-w-full max-h-full object-contain select-none"
                        style={{
                          transform: `translate(${comparePan.x}px, ${comparePan.y}px) scale(${compareZoom})`,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/80 text-xs text-blue-400 px-1.5 py-0.5 rounded">
                      {format.toUpperCase()} Q{quality}%
                      {mode === 'cbz-to-pdf' && cbzScale !== 100 && ` @${cbzScale}%`}
                      {convertedImageInfo ? ` ${convertedImageInfo.sizeKB}KB` : ''}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 py-3 border-t border-gray-800 text-center text-gray-500 text-sm">
          <div className="flex items-center justify-center gap-2">
            <span>{t('footer')}</span>
            <span className="text-gray-700">•</span>
            <a
              href="https://github.com/r45635/pdf-to-cbz-converter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              {t('viewOnGithub')}
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
