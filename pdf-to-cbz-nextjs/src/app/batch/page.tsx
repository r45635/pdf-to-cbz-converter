'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import BatchUploader from '@/components/BatchUploader';
import BatchSettingsPanel from '@/components/BatchSettings';
import BatchResults from '@/components/BatchResults';
import {
  BatchFileState,
  BatchJobState,
  BatchSettings,
  BatchConfig,
  BatchSSEEvent,
  DEFAULT_BATCH_SETTINGS,
  DEFAULT_BATCH_CONFIG,
} from '@/lib/batch-types';

export default function BatchPage() {
  // State
  const [config, setConfig] = useState<BatchConfig>(DEFAULT_BATCH_CONFIG);
  const [settings, setSettings] = useState<BatchSettings>(DEFAULT_BATCH_SETTINGS);
  const [job, setJob] = useState<BatchJobState>({
    jobId: null,
    status: 'idle',
    files: [],
    expiresAt: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load config from server
  useEffect(() => {
    fetch('/api/batch-convert')
      .then((res) => res.json())
      .then((data) => {
        setConfig({
          maxFiles: data.maxFiles || DEFAULT_BATCH_CONFIG.maxFiles,
          maxFileSizeMB: data.maxFileSizeMB || DEFAULT_BATCH_CONFIG.maxFileSizeMB,
          defaultExpireMinutes: data.defaultExpireMinutes || DEFAULT_BATCH_CONFIG.defaultExpireMinutes,
          maxExpireMinutes: data.maxExpireMinutes || DEFAULT_BATCH_CONFIG.maxExpireMinutes,
          serverMaxFiles: data.serverMaxFiles || data.maxFiles || DEFAULT_BATCH_CONFIG.serverMaxFiles,
          serverMaxFileSizeMB: data.serverMaxFileSizeMB || data.maxFileSizeMB || DEFAULT_BATCH_CONFIG.serverMaxFileSizeMB,
        });
      })
      .catch(console.error);
  }, []);

  // Add files
  const handleFilesAdd = useCallback(
    (newFiles: File[]) => {
      setError(null);

      const currentFiles = job.files;
      const currentCount = currentFiles.length;

      const filesToAdd: BatchFileState[] = [];

      for (const file of newFiles) {
        // Check limits
        if (currentCount + filesToAdd.length >= config.maxFiles) {
          setError(`Maximum ${config.maxFiles} fichiers autorisés`);
          break;
        }

        const sizeMB = file.size / (1024 * 1024);

        if (sizeMB > config.maxFileSizeMB) {
          setError(`"${file.name}" dépasse la limite de ${config.maxFileSizeMB} MB`);
          continue;
        }

        // Check if already added
        const exists = currentFiles.some(
          (f) => f.originalName === file.name && f.originalSizeMB === sizeMB
        );
        if (exists) continue;

        filesToAdd.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          originalName: file.name,
          originalSizeMB: sizeMB,
          status: 'pending',
          progress: 0,
        });
      }

      if (filesToAdd.length > 0) {
        setJob((prev) => ({
          ...prev,
          files: [...prev.files, ...filesToAdd],
        }));
      }
    },
    [job.files, config]
  );

  // Remove file
  const handleFileRemove = useCallback((id: string) => {
    setJob((prev) => ({
      ...prev,
      files: prev.files.filter((f) => f.id !== id),
    }));
  }, []);

  // Clear all files
  const handleClearAll = useCallback(() => {
    setJob({
      jobId: null,
      status: 'idle',
      files: [],
      expiresAt: null,
    });
    setError(null);
    setShowResults(false);
  }, []);

  // Start batch conversion
  const handleStartConversion = useCallback(async () => {
    if (job.files.length === 0) return;

    setError(null);
    setJob((prev) => ({ ...prev, status: 'uploading' }));

    // Create FormData
    const formData = new FormData();
    job.files.forEach((f, i) => {
      formData.append(`file${i}`, f.file);
    });
    formData.append('dpi', settings.dpi.toString());
    formData.append('format', settings.format);
    formData.append('quality', settings.quality.toString());
    formData.append('expireMinutes', settings.expireMinutes.toString());

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/batch-convert', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Erreur de connexion au serveur');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Pas de flux de réponse');

      const decoder = new TextDecoder();
      let buffer = '';

      // Process SSE events
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: BatchSSEEvent = JSON.parse(line.slice(6));
              handleSSEEvent(event);
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setJob((prev) => ({ ...prev, status: 'idle' }));
      } else {
        setError(err instanceof Error ? err.message : 'Erreur de conversion');
        setJob((prev) => ({ ...prev, status: 'failed' }));
      }
    }
  }, [job.files, settings]);

  // Handle SSE events
  const handleSSEEvent = useCallback((event: BatchSSEEvent) => {
    switch (event.type) {
      case 'job_created':
        setJob((prev) => ({
          ...prev,
          jobId: event.jobId,
          status: 'processing',
          expiresAt: event.expiresAt,
        }));
        break;

      case 'file_start':
        setJob((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.originalName === event.fileName
              ? { ...f, status: 'analyzing' as const, progress: 0 }
              : f
          ),
        }));
        break;

      case 'file_analyzing':
        setJob((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.originalName === event.fileName
              ? { ...f, status: 'analyzing' as const }
              : f
          ),
        }));
        break;

      case 'file_progress':
        setJob((prev) => ({
          ...prev,
          files: prev.files.map((f) => {
            // Find by fileId from server or match by index
            const serverFile = prev.files.find((sf) => sf.id === event.fileId);
            if (serverFile) {
              return f.id === event.fileId
                ? {
                    ...f,
                    status: 'converting' as const,
                    progress: event.progress,
                    currentPage: event.currentPage,
                    totalPages: event.totalPages,
                  }
                : f;
            }
            return f;
          }),
        }));
        // Also update by fileName match as fallback
        setJob((prev) => {
          const hasMatch = prev.files.some((f) => f.id === event.fileId);
          if (hasMatch) return prev;

          // Find converting file and update it
          const convertingIndex = prev.files.findIndex(
            (f) => f.status === 'analyzing' || f.status === 'converting'
          );
          if (convertingIndex === -1) return prev;

          return {
            ...prev,
            files: prev.files.map((f, i) =>
              i === convertingIndex
                ? {
                    ...f,
                    status: 'converting' as const,
                    progress: event.progress,
                    currentPage: event.currentPage,
                    totalPages: event.totalPages,
                  }
                : f
            ),
          };
        });
        break;

      case 'file_complete':
        setJob((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.originalName === event.fileName
              ? {
                  ...f,
                  status: 'done' as const,
                  progress: 100,
                  result: {
                    outputName: event.outputName,
                    sizeMB: event.sizeMB,
                    pageCount: event.pageCount,
                    downloadUrl: prev.jobId
                      ? `/api/download/${prev.jobId}/${event.fileId}`
                      : undefined,
                  },
                }
              : f
          ),
        }));
        break;

      case 'file_error':
        setJob((prev) => ({
          ...prev,
          files: prev.files.map((f) =>
            f.originalName === event.fileName
              ? { ...f, status: 'error' as const, progress: 0, error: event.error }
              : f
          ),
        }));
        break;

      case 'job_complete':
        setJob((prev) => ({
          ...prev,
          status: event.status,
          downloadAllUrl:
            event.status !== 'failed' && event.successCount > 1
              ? `/api/download-all/${prev.jobId}`
              : undefined,
        }));
        setShowResults(true);
        break;

      case 'heartbeat':
        // Keep-alive, no action needed
        break;
    }
  }, []);

  // Cancel conversion
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const isProcessing = job.status === 'uploading' || job.status === 'processing';
  const canStart = job.files.length > 0 && !isProcessing;
  const completedCount = job.files.filter((f) => f.status === 'done').length;
  const errorCount = job.files.filter((f) => f.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-blue-400">Conversion Batch</h1>
            <p className="text-sm text-gray-400">Convertissez plusieurs PDFs en CBZ simultanément</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Mode fichier unique
          </Link>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Results Panel */}
        {showResults && job.jobId && (job.status === 'completed' || job.status === 'partial') && (
          <div className="mb-6">
            <BatchResults
              jobId={job.jobId}
              files={job.files}
              expiresAt={job.expiresAt}
              downloadAllUrl={job.downloadAllUrl}
              onClose={() => setShowResults(false)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Upload & Files */}
          <div className="lg:col-span-2 space-y-4">
            <BatchUploader
              files={job.files}
              onFilesAdd={handleFilesAdd}
              onFileRemove={handleFileRemove}
              onClearAll={handleClearAll}
              config={config}
              disabled={isProcessing}
            />

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleStartConversion}
                disabled={!canStart}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  canStart
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Conversion en cours...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Démarrer la conversion ({job.files.length} fichier{job.files.length > 1 ? 's' : ''})
                  </>
                )}
              </button>

              {isProcessing && (
                <button
                  onClick={handleCancel}
                  className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-colors"
                >
                  Annuler
                </button>
              )}
            </div>

            {/* Progress Summary */}
            {isProcessing && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-300">Progression globale</span>
                  <span className="text-sm text-blue-400">
                    {completedCount + errorCount}/{job.files.length}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-300"
                    style={{
                      width: `${((completedCount + errorCount) / job.files.length) * 100}%`,
                    }}
                  />
                </div>
                {errorCount > 0 && (
                  <p className="mt-2 text-xs text-red-400">
                    {errorCount} erreur{errorCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right Column - Settings */}
          <div>
            <BatchSettingsPanel
              settings={settings}
              onChange={setSettings}
              config={config}
              onConfigChange={setConfig}
              disabled={isProcessing}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-600 text-xs">
          PDF to CBZ Converter - Mode Batch
        </footer>
      </div>
    </div>
  );
}
