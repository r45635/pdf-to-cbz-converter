'use client';

import { useState, useCallback } from 'react';
import { BatchFileState } from '@/lib/batch-types';

interface BatchResultsProps {
  jobId: string;
  files: BatchFileState[];
  expiresAt: number | null;
  downloadAllUrl?: string;
  onClose: () => void;
}

export default function BatchResults({
  jobId,
  files,
  expiresAt,
  downloadAllUrl,
  onClose,
}: BatchResultsProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const completedFiles = files.filter((f) => f.status === 'done' && f.result);
  const failedFiles = files.filter((f) => f.status === 'error');

  const getRemainingTime = useCallback(() => {
    if (!expiresAt) return null;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return 'Expiré';

    const minutes = Math.floor(remaining / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  }, [expiresAt]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const copyAllLinks = useCallback(() => {
    const links = completedFiles
      .map((f) => f.result?.downloadUrl)
      .filter(Boolean)
      .join('\n');
    copyToClipboard(links, 'all');
  }, [completedFiles, copyToClipboard]);

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-900/50 to-blue-900/50 border-b border-gray-700">
        <div>
          <h3 className="font-medium text-gray-200">
            Conversion terminée
          </h3>
          <p className="text-xs text-gray-400">
            {completedFiles.length} réussi{completedFiles.length > 1 ? 's' : ''}
            {failedFiles.length > 0 && `, ${failedFiles.length} erreur${failedFiles.length > 1 ? 's' : ''}`}
            {expiresAt && ` • Expire dans ${getRemainingTime()}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Results List */}
      <div className="divide-y divide-gray-700 max-h-72 overflow-y-auto">
        {completedFiles.map((file) => (
          <div key={file.id} className="flex items-center gap-3 px-4 py-3">
            {/* Success Icon */}
            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">
                {file.result?.outputName}
              </p>
              <p className="text-xs text-gray-500">
                {file.result?.sizeMB.toFixed(1)} MB • {file.result?.pageCount} pages
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Download Button */}
              <a
                href={file.result?.downloadUrl}
                download={file.result?.outputName}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
              >
                Télécharger
              </a>

              {/* Copy Link Button */}
              <button
                onClick={() => file.result?.downloadUrl && copyToClipboard(file.result.downloadUrl, file.id)}
                className={`p-1.5 rounded transition-colors ${
                  copiedId === file.id
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                }`}
                title="Copier le lien"
              >
                {copiedId === file.id ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ))}

        {/* Failed Files */}
        {failedFiles.map((file) => (
          <div key={file.id} className="flex items-center gap-3 px-4 py-3 bg-red-900/20">
            {/* Error Icon */}
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>

            {/* File Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{file.originalName}</p>
              <p className="text-xs text-red-400">{file.error || 'Erreur de conversion'}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      {completedFiles.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-700/50 border-t border-gray-700">
          {/* Download All */}
          {downloadAllUrl && completedFiles.length > 1 && (
            <a
              href={downloadAllUrl}
              download
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Tout télécharger (ZIP)
            </a>
          )}

          {/* Copy All Links */}
          <button
            onClick={copyAllLinks}
            className={`flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors ${
              copiedId === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-600 hover:bg-gray-500 text-gray-200'
            }`}
          >
            {copiedId === 'all' ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copié !
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copier tous les liens
              </>
            )}
          </button>

          {/* Job ID for reference */}
          <span className="ml-auto text-xs text-gray-500">
            Job: {jobId.slice(0, 8)}...
          </span>
        </div>
      )}
    </div>
  );
}
