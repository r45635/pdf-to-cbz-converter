import { useState, useCallback } from 'react';
import { useTranslation } from '@/lib/useTranslation';
import LanguageSelector from '@/components/LanguageSelector';
import BatchUploader from '@/components/BatchUploader';
import BatchSettings from '@/components/BatchSettings';
import BatchResults from '@/components/BatchResults';
import * as TauriClient from '@/lib/tauri-client';

type ConversionMode = 'pdf-to-cbz' | 'cbz-to-pdf';

interface BatchFile {
  id: string;
  path: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
  outputPath?: string;
  size?: number;
}

interface BatchSettings {
  dpi: number;
  format: TauriClient.ImageFormat;
  quality: number;
  expirationMinutes: number;
}

interface BatchProps {
  onNavigateToHome?: () => void;
}

export default function Batch({ onNavigateToHome }: BatchProps) {
  const { lang, setLang, t } = useTranslation();
  const [mode, setMode] = useState<ConversionMode>('pdf-to-cbz');
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [settings, setSettings] = useState<BatchSettings>({
    dpi: 0, // 0 = auto (native DPI)
    format: 'jpeg',
    quality: 85,
    expirationMinutes: 60,
  });
  const [globalProgress, setGlobalProgress] = useState({
    completedFiles: 0,
    totalFiles: 0,
    currentFileProgress: 0,
  });

  // File selection handler
  const handleSelectFiles = useCallback(async () => {
    const paths = mode === 'pdf-to-cbz'
      ? await TauriClient.selectMultiplePdfFiles()
      : []; // TODO: Implement selectMultipleCbzFiles if needed
      
    if (paths.length === 0) return;
    
    const fileObjects: BatchFile[] = paths.map((path, index) => ({
      id: `file-${Date.now()}-${index}`,
      path,
      name: path.split('/').pop() || path.split('\\').pop() || `file-${index}`,
      status: 'pending' as const,
    }));
    
    setFiles(fileObjects);
  }, [mode]);

  // Update file status
  const updateFileStatus = useCallback((
    fileId: string,
    status: BatchFile['status'],
    error?: string,
    outputPath?: string,
    progress?: number
  ) => {
    setFiles(prev => prev.map(f => 
      f.id === fileId 
        ? { ...f, status, error, outputPath, progress }
        : f
    ));
  }, []);

  // Remove file from list
  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  // Clear all files
  const clearFiles = useCallback(() => {
    if (!isConverting) {
      setFiles([]);
      setGlobalProgress({ completedFiles: 0, totalFiles: 0, currentFileProgress: 0 });
    }
  }, [isConverting]);

  // Batch conversion handler
  const handleConvert = useCallback(async () => {
    if (files.length === 0) return;

    setIsConverting(true);
    setGlobalProgress({ completedFiles: 0, totalFiles: files.length, currentFileProgress: 0 });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        updateFileStatus(file.id, 'processing');
        
        let imageData: Uint8Array;
        
        if (mode === 'pdf-to-cbz') {
          // Get DPI for this file
          let fileDpi = settings.dpi;
          
          // If auto DPI (0), analyze the file to get native DPI
          if (fileDpi === 0) {
            try {
              const analysis = await TauriClient.analyzePdf(file.path);
              fileDpi = analysis.nativeDpi;
            } catch (err) {
              // If analysis fails, use default 150 DPI
              fileDpi = 150;
            }
          }
          
          // Convert the file
          imageData = await TauriClient.convertPdfToCbz(
            file.path,
            fileDpi,
            settings.format,
            settings.quality,
            (progress) => {
              updateFileStatus(file.id, 'processing', undefined, undefined, progress.percentage);
              setGlobalProgress({
                completedFiles: i,
                totalFiles: files.length,
                currentFileProgress: progress.percentage,
              });
            }
          );
        } else {
          // TODO: Implement CBZ to PDF conversion
          throw new Error('CBZ to PDF conversion not yet implemented');
        }
        
        // Save the file automatically
        const outputPath = file.path.replace(/\.(pdf|cbz)$/i, mode === 'pdf-to-cbz' ? '.cbz' : '.pdf');
        await TauriClient.saveDataToFile(imageData, outputPath);
        
        updateFileStatus(file.id, 'completed', undefined, outputPath);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Conversion failed';
        updateFileStatus(file.id, 'error', errorMessage);
      }
      
      // Update global progress
      setGlobalProgress(prev => ({
        ...prev,
        completedFiles: i + 1,
        currentFileProgress: 0,
      }));
    }
    
    setIsConverting(false);
  }, [files, mode, settings, updateFileStatus]);

  // Cancel conversion
  const handleCancel = useCallback(() => {
    setIsConverting(false);
    // Reset pending files
    setFiles(prev => prev.map(f => 
      f.status === 'processing' ? { ...f, status: 'pending' as const, progress: 0 } : f
    ));
    setGlobalProgress({ completedFiles: 0, totalFiles: 0, currentFileProgress: 0 });
  }, []);

  // Calculate stats
  const stats = {
    total: files.length,
    completed: files.filter(f => f.status === 'completed').length,
    errors: files.filter(f => f.status === 'error').length,
    pending: files.filter(f => f.status === 'pending').length,
    processing: files.filter(f => f.status === 'processing').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onNavigateToHome}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('batchConversion')}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <LanguageSelector lang={lang} setLang={setLang} />
              <button
                onClick={onNavigateToHome}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {t('singleFileMode')}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Mode Selector */}
        <div className="mb-6 flex gap-4 bg-white dark:bg-gray-800 p-2 rounded-lg shadow">
          <button
            onClick={() => setMode('pdf-to-cbz')}
            disabled={isConverting}
            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
              mode === 'pdf-to-cbz'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            {t('pdfToCbz')}
          </button>
          <button
            onClick={() => setMode('cbz-to-pdf')}
            disabled={isConverting}
            className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
              mode === 'cbz-to-pdf'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            {t('cbzToPdf')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: File Upload & Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* File Upload */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {t('files')}
              </h2>
              
              <button
                onClick={handleSelectFiles}
                disabled={isConverting}
                className="w-full px-6 py-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-12 h-12 text-gray-400 mx-auto mb-3"
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
                <p className="text-gray-700 dark:text-gray-300 font-medium">
                  {mode === 'pdf-to-cbz' ? t('dropPdf') : t('dropCbz')}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {stats.total} {stats.total === 1 ? t('file') : t('files')}
                </p>
              </button>

              {files.length > 0 && (
                <button
                  onClick={clearFiles}
                  disabled={isConverting}
                  className="w-full mt-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear all files
                </button>
              )}
            </div>

            {/* Settings */}
            <BatchSettings
              mode={mode}
              settings={settings}
              onSettingsChange={setSettings}
              disabled={isConverting}
            />

            {/* Action Buttons */}
            <div className="space-y-3">
              {!isConverting ? (
                <button
                  onClick={handleConvert}
                  disabled={files.length === 0}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  {t('startConversion')} ({stats.total} {stats.total === 1 ? t('file') : t('files')})
                </button>
              ) : (
                <button
                  onClick={handleCancel}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                >
                  {t('cancel')}
                </button>
              )}
            </div>

            {/* Stats */}
            {files.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white">
                  Status
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{stats.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Completed:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{stats.completed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Processing:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">{stats.processing}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Pending:</span>
                    <span className="font-medium text-gray-600 dark:text-gray-400">{stats.pending}</span>
                  </div>
                  {stats.errors > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Errors:</span>
                      <span className="font-medium text-red-600 dark:text-red-400">{stats.errors}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-2">
            {/* Global Progress */}
            {isConverting && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                  {t('globalProgress')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {t('conversionInProgress')}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {globalProgress.completedFiles} / {globalProgress.totalFiles}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${((globalProgress.completedFiles + (globalProgress.currentFileProgress / 100)) / globalProgress.totalFiles) * 100}%`
                      }}
                    />
                  </div>
                  {globalProgress.currentFileProgress > 0 && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Current file: {Math.round(globalProgress.currentFileProgress)}%
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Results */}
            <BatchResults
              files={files}
              onRemove={removeFile}
              disabled={isConverting}
            />

            {files.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg
                  className="w-16 h-16 text-gray-400 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-gray-500 dark:text-gray-400">
                  {mode === 'pdf-to-cbz' ? t('batchDescPdf') : t('batchDescCbz')}
                </p>
              </div>
            )}
          </div>
        </div>
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
