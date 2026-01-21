import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from '@/lib/useTranslation';
import LanguageSelector from '@/components/LanguageSelector';
import * as TauriClient from '@/lib/tauri-client';
import { listen } from '@tauri-apps/api/event';

type ConversionMode = 'pdf-to-cbz' | 'cbz-to-pdf';

interface BatchFile {
  path: string;
  name: string;
  savePath?: string;
  sourceSize?: number;  // File size in bytes
  convertedSize?: number;  // Converted file size in bytes
  status: 'pending' | 'converting' | 'completed' | 'error' | 'cancelled';
  progress: number;
  error?: string;
}

interface HomeProps {}

export default function Home({}: HomeProps) {
  const { lang, setLang, t } = useTranslation();
  const [mode, setMode] = useState<ConversionMode>('pdf-to-cbz');
  
  // Batch mode (works for single or multiple files)
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);

  // Options
  const [dpi, setDpi] = useState<string>('100');  // Reduced default from 150 to 100 for speed
  const [format, setFormat] = useState<TauriClient.ImageFormat>('jpeg');
  const [quality, setQuality] = useState(75);  // Reduced from 85 to 75 for speed
  const [directExtract, setDirectExtract] = useState(true);  // Direct extraction enabled by default

  // Status
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelledRef = useRef(false);

  // Get effective DPI
  const effectiveDpi = parseInt(dpi, 10) || 150;

  // File selection handler - always adds to batch
  const handleFileSelect = useCallback(async (multiple = true) => {
    console.log('[DEBUG] handleFileSelect called, mode:', mode, 'multiple:', multiple);
    setError(null);
    
    try {
      const result = mode === 'pdf-to-cbz' 
        ? await TauriClient.selectPdfFile(multiple)
        : await TauriClient.selectCbzFile(multiple);
      
      console.log('[DEBUG] Selected file(s):', result);
      if (!result) {
        console.log('[DEBUG] No file selected');
        return;
      }

      // Handle single or multiple files - always add to batch
      const paths = Array.isArray(result) ? result : [result];
      const newFiles = await Promise.all(paths.map(async (path) => {
        const size = await TauriClient.getFileSize(path);
        return {
          path,
          name: path.split('/').pop() || path.split('\\').pop() || 'file',
          sourceSize: size,
          status: 'pending' as const,
          progress: 0,
        };
      }));

      // Add to existing files (avoid duplicates)
      setBatchFiles(prev => {
        const existingPaths = new Set(prev.map(f => f.path));
        const filesToAdd = newFiles.filter(f => !existingPaths.has(f.path));
        return [...prev, ...filesToAdd];
      });
    } catch (err) {
      console.error('[ERROR] File selection failed:', err);
      setError(err instanceof Error ? err.message : 'File selection failed');
    }
  }, [mode]);

  // Batch conversion handler
  const handleBatchConvert = useCallback(async () => {
    if (batchFiles.length === 0) return;

    console.log('[DEBUG] Starting batch conversion for', batchFiles.length, 'files');

    // Reset cancellation flag
    setIsCancelling(false);
    cancelledRef.current = false;

    // Ask user to select destination directory (suggest first file's directory)
    const firstFilePath = batchFiles[0].path;
    const firstFileDir = firstFilePath.substring(0, firstFilePath.lastIndexOf('/'));
    
    const destinationDir = await TauriClient.selectDirectory(firstFileDir);
    if (!destinationDir) {
      console.log('[DEBUG] User cancelled directory selection');
      return; // User cancelled
    }

    console.log('[DEBUG] Destination directory:', destinationDir);

    // Create a local copy of files to process
    const filesToProcess = [...batchFiles];

    // Reset all files to pending status
    setBatchFiles(filesToProcess.map(f => ({ ...f, status: 'pending', progress: 0, error: undefined, savePath: undefined })));

    // Process each file
    for (let i = 0; i < filesToProcess.length; i++) {
      // Check if conversion was cancelled
      if (cancelledRef.current) {
        console.log('[DEBUG] Batch conversion cancelled by user');
        // Mark remaining files as cancelled
        setBatchFiles(prev => prev.map((f) => 
          f.status === 'pending' ? { ...f, status: 'cancelled' } : f
        ));
        break;
      }

      const file = filesToProcess[i];
      console.log(`[DEBUG] Processing file ${i + 1}/${filesToProcess.length}: ${file.name}`);

      try {
        // Mark as converting
        setBatchFiles(prev => prev.map((f) => 
          f.path === file.path ? { ...f, status: 'converting', progress: 0 } : f
        ));

        // Convert with progress callback (no need to analyze first - conversion does it internally)
        const outputData = mode === 'pdf-to-cbz'
          ? await TauriClient.convertPdfToCbz(
              file.path,
              effectiveDpi,
              format,
              quality,
              (progress) => {
                // Map conversion progress from 0% to 90%
                const mappedProgress = progress.percentage * 0.9;
                setBatchFiles(prev => prev.map((f) => 
                  f.path === file.path ? { ...f, progress: Math.round(mappedProgress) } : f
                ));
              },
              directExtract  // Pass direct extraction option
            )
          : await TauriClient.convertCbzToPdf(
              file.path,
              (progress) => {
                // Map conversion progress from 0% to 90%
                const mappedProgress = progress.percentage * 0.9;
                setBatchFiles(prev => prev.map((f) => 
                  f.path === file.path ? { ...f, progress: Math.round(mappedProgress) } : f
                ));
              }
            );

        // Update progress after conversion (90%)
        setBatchFiles(prev => prev.map((f) => 
          f.path === file.path ? { ...f, progress: 90 } : f
        ));

        // Determine default file name
        const defaultName = mode === 'pdf-to-cbz'
          ? file.name.replace(/\.pdf$/i, '.cbz')
          : file.name.replace(/\.(cbz|cbr)$/i, '.pdf');

        const savePath = `${destinationDir}/${defaultName}`;

        // Store the save path
        setBatchFiles(prev => prev.map((f) => 
          f.path === file.path ? { ...f, savePath, progress: 95 } : f
        ));

        // Save the file
        const isMagicMarker = 
          outputData.length === 4 && 
          outputData[0] === 0xFF && outputData[1] === 0xFE && 
          outputData[2] === 0xFD && outputData[3] === 0xFC;
        
        if (isMagicMarker) {
          // Large PDF - use saveLastPdf
          await TauriClient.saveLastPdf(savePath);
        } else {
          // Normal size - write directly
          await TauriClient.saveDataToFile(outputData, savePath);
        }

        // Get converted file size
        const convertedSize = await TauriClient.getFileSize(savePath);
        
        // Mark as completed
        setBatchFiles(prev => prev.map((f) => 
          f.path === file.path ? { ...f, status: 'completed', progress: 100, convertedSize } : f
        ));

        console.log(`[DEBUG] Successfully converted: ${file.name} -> ${savePath}`);

      } catch (err) {
        console.error(`[ERROR] Failed to convert ${file.name}:`, err);
        
        // Check if it's a cancellation error
        const errorMessage = err instanceof Error ? err.message : 'Conversion failed';
        const isCancellation = errorMessage.includes('cancelled') || errorMessage.includes('Conversion cancelled');
        
        setBatchFiles(prev => prev.map((f) => 
          f.path === file.path ? { 
            ...f, 
            status: isCancellation ? 'cancelled' : 'error', 
            progress: 0, 
            error: isCancellation ? undefined : errorMessage 
          } : f
        ));
        
        // If cancelled, stop processing remaining files
        if (isCancellation) {
          console.log('[DEBUG] Conversion was cancelled, stopping batch');
          cancelledRef.current = true;
          setBatchFiles(prev => prev.map((f) => 
            f.status === 'pending' ? { ...f, status: 'cancelled' } : f
          ));
          break;
        }
      }
    }

    console.log('[DEBUG] Batch conversion completed');
    setIsCancelling(false);
    cancelledRef.current = false;
  }, [batchFiles, mode, effectiveDpi, format, quality, directExtract]);

  // Cancel batch conversion
  const handleCancelBatch = useCallback(() => {
    console.log('[DEBUG] User requested to cancel batch conversion');
    setIsCancelling(true);
    cancelledRef.current = true;
    
    // Also call Rust cancellation to stop ongoing conversions
    TauriClient.cancelConversion().catch(err => {
      console.error('[ERROR] Failed to cancel conversion:', err);
    });
  }, []);

  // Restart batch conversion
  const handleRestartBatch = useCallback(() => {
    setBatchFiles(prev => prev.map(f => ({ ...f, status: 'pending', progress: 0, error: undefined })));
  }, []);

  // Clear and add new files
  const handleClearAndAddNew = useCallback(async () => {
    setBatchFiles([]);
    await handleFileSelect(true);
  }, [handleFileSelect]);

  // Handle file drop event from Tauri
  useEffect(() => {
    const unlisten = listen<string[]>('tauri://file-drop', async (event) => {
      console.log('[DEBUG] File drop event:', event.payload);
      const files = event.payload;
      
      if (files.length === 0) return;
      
      // Filter files based on mode
      const validFiles = files.filter(f => {
        const lower = f.toLowerCase();
        if (mode === 'pdf-to-cbz') {
          return lower.endsWith('.pdf');
        } else {
          return lower.endsWith('.cbz') || lower.endsWith('.cbr');
        }
      });

      if (validFiles.length === 0) {
        setError(mode === 'pdf-to-cbz' ? 'Please drop PDF files only' : 'Please drop CBZ/CBR files only');
        return;
      }

      // Add all files to batch
      const newFiles = await Promise.all(validFiles.map(async (path) => {
        const size = await TauriClient.getFileSize(path);
        return {
          path,
          name: path.split('/').pop() || path.split('\\').pop() || 'file',
          sourceSize: size,
          status: 'pending' as const,
          progress: 0,
        };
      }));

      // Add to existing files (avoid duplicates)
      setBatchFiles(prev => {
        const existingPaths = new Set(prev.map(f => f.path));
        const filesToAdd = newFiles.filter(f => !existingPaths.has(f.path));
        return [...prev, ...filesToAdd];
      });
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [mode]);

  // Mode change handler
  const handleModeChange = useCallback((newMode: ConversionMode) => {
    setMode(newMode);
    setBatchFiles([]);
    setError(null);
  }, []);

  // Check if any conversion is in progress
  const isConverting = batchFiles.some(f => f.status === 'converting');
  const hasCompleted = batchFiles.some(f => f.status === 'completed');

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
          <div className="border-2 border-dashed rounded-lg p-12 text-center transition-colors border-gray-300 dark:border-gray-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700">
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
                {mode === 'pdf-to-cbz' 
                  ? 'Drag & drop PDF file(s) here or click to select' 
                  : 'Drag & drop CBZ/CBR file(s) here or click to select'}
              </p>
              
              {/* Add Files Button */}
              <div className="mt-4">
                <button
                  onClick={() => handleFileSelect(true)}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  📁 Add Files to List
                </button>
              </div>
              
              {batchFiles.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                  {batchFiles.length} file(s) in list
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Batch Mode Interface - Always visible when there are files */}
        {batchFiles.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Batch Conversion ({batchFiles.length} files)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFileSelect(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  ➕ Add More Files
                </button>
                <button
                  onClick={() => {
                    setBatchFiles([]);
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  🗑️ Clear All
                </button>
              </div>
            </div>

            {/* Conversion Settings */}
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Conversion Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {mode === 'pdf-to-cbz' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      DPI
                    </label>
                    <input
                      type="number"
                      value={dpi}
                      onChange={(e) => setDpi(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Format
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as TauriClient.ImageFormat)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="jpeg">JPEG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
                {format === 'jpeg' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Quality ({quality})
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
              </div>
              
              {/* Direct Extraction Option (PDF to CBZ only with JPEG format) */}
              {mode === 'pdf-to-cbz' && format === 'jpeg' && (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directExtract}
                      onChange={(e) => setDirectExtract(e.target.checked)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        ⚡ Direct Extraction (Fast Mode)
                      </div>
                      <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        Extract JPEG images directly from PDF without re-encoding. Much faster but only works if PDF contains JPEG images. Falls back to standard mode if not available.
                      </div>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Batch Files List */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Source ⇒ Destination
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Progress
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {batchFiles.map((file, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => TauriClient.openFile(file.path)}
                              className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                            >
                              {file.name}
                            </button>
                            {file.sourceSize && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                ({(file.sourceSize / 1024 / 1024).toFixed(1)} MB)
                              </span>
                            )}
                          </div>
                          {file.savePath && (
                            <>
                              <span className="text-gray-400">⇓</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => TauriClient.openFile(file.savePath!)}
                                  className="text-green-600 dark:text-green-400 hover:underline text-left"
                                >
                                  {file.savePath.split('/').pop() || file.savePath.split('\\').pop()}
                                </button>
                                {file.convertedSize && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({(file.convertedSize / 1024 / 1024).toFixed(1)} MB)
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          file.status === 'pending' ? 'bg-gray-100 text-gray-800' :
                          file.status === 'converting' ? 'bg-blue-100 text-blue-800' :
                          file.status === 'completed' ? 'bg-green-100 text-green-800' :
                          file.status === 'cancelled' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {file.status}
                        </span>
                        {file.error && (
                          <p className="text-xs text-red-600 mt-1">{file.error}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                            <div
                              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {file.progress}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Batch Control Buttons */}
            <div className="mt-6 flex gap-3">
              {!isConverting && !hasCompleted && (
                <button
                  onClick={handleBatchConvert}
                  disabled={batchFiles.length === 0}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  🚀 Start Batch Conversion
                </button>
              )}
              
              {isConverting && (
                <button
                  onClick={handleCancelBatch}
                  disabled={isCancelling}
                  className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {isCancelling ? '⏹️ Cancelling...' : '⏹️ Stop Conversion'}
                </button>
              )}
              
              {hasCompleted && !isConverting && (
                <>
                  <button
                    onClick={handleRestartBatch}
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                  >
                    🔄 Restart Batch Conversion
                  </button>
                  <button
                    onClick={handleClearAndAddNew}
                    className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                  >
                    🆕 Clear & Add New Files
                  </button>
                </>
              )}
              
              {isConverting && (
                <div className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium text-center">
                  ⏳ Converting... ({batchFiles.filter(f => f.status === 'completed').length}/{batchFiles.length})
                </div>
              )}
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
