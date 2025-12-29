'use client';

import { useCallback, useRef } from 'react';
import { BatchConfig, BatchFileState } from '@/lib/batch-types';

interface BatchUploaderProps {
  files: BatchFileState[];
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (id: string) => void;
  onClearAll: () => void;
  config: BatchConfig;
  disabled?: boolean;
}

export default function BatchUploader({
  files,
  onFilesAdd,
  onFileRemove,
  onClearAll,
  config,
  disabled = false,
}: BatchUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSizeMB = files.reduce((sum, f) => sum + f.originalSizeMB, 0);
  const canAddMore = files.length < config.maxFiles;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.toLowerCase().endsWith('.pdf')
      );

      if (droppedFiles.length > 0) {
        onFilesAdd(droppedFiles);
      }
    },
    [disabled, onFilesAdd]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        onFilesAdd(Array.from(selectedFiles));
      }
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onFilesAdd]
  );

  const getStatusIcon = (status: BatchFileState['status']) => {
    switch (status) {
      case 'pending':
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={2} />
          </svg>
        );
      case 'analyzing':
      case 'converting':
        return (
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        );
      case 'done':
        return (
          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
    }
  };

  const getStatusText = (file: BatchFileState) => {
    switch (file.status) {
      case 'pending':
        return 'En attente';
      case 'analyzing':
        return 'Analyse...';
      case 'converting':
        if (file.currentPage && file.totalPages) {
          return `Page ${file.currentPage}/${file.totalPages}`;
        }
        return `${file.progress}%`;
      case 'done':
        return file.result ? `${file.result.sizeMB.toFixed(1)} MB` : 'Terminé';
      case 'error':
        return file.error || 'Erreur';
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          disabled
            ? 'border-gray-700 bg-gray-800/50 cursor-not-allowed'
            : canAddMore
            ? 'border-gray-600 hover:border-blue-500 cursor-pointer'
            : 'border-yellow-600 bg-yellow-900/20'
        }`}
        onClick={() => !disabled && canAddMore && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled || !canAddMore}
        />

        <div className="flex flex-col items-center gap-2">
          <svg
            className={`w-10 h-10 ${disabled ? 'text-gray-600' : 'text-gray-500'}`}
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

          {files.length === 0 ? (
            <p className="text-gray-400">
              Glissez vos PDFs ici ou cliquez pour parcourir
            </p>
          ) : canAddMore ? (
            <p className="text-gray-400">
              Ajouter plus de fichiers ({files.length}/{config.maxFiles})
            </p>
          ) : (
            <p className="text-yellow-400">
              Limite atteinte ({files.length}/{config.maxFiles} fichiers)
            </p>
          )}

          <p className="text-xs text-gray-500">
            Max {config.maxFiles} fichiers, {config.maxFileSizeMB} MB/fichier
          </p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-700/50 border-b border-gray-700">
            <span className="text-sm text-gray-300">
              {files.length} fichier{files.length > 1 ? 's' : ''} ({totalSizeMB.toFixed(1)} MB)
            </span>
            {!disabled && (
              <button
                onClick={onClearAll}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Tout supprimer
              </button>
            )}
          </div>

          {/* File Items */}
          <div className="divide-y divide-gray-700 max-h-64 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className={`flex items-center gap-3 px-3 py-2 ${
                  file.status === 'error' ? 'bg-red-900/20' : ''
                }`}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">{getStatusIcon(file.status)}</div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{file.originalName}</p>
                  <p className="text-xs text-gray-500">
                    {file.originalSizeMB.toFixed(1)} MB
                  </p>
                </div>

                {/* Status */}
                <div className="flex-shrink-0 text-right">
                  <p
                    className={`text-xs ${
                      file.status === 'done'
                        ? 'text-green-400'
                        : file.status === 'error'
                        ? 'text-red-400'
                        : file.status === 'converting' || file.status === 'analyzing'
                        ? 'text-blue-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {getStatusText(file)}
                  </p>

                  {/* Progress Bar */}
                  {(file.status === 'analyzing' || file.status === 'converting') && (
                    <div className="w-20 h-1 bg-gray-700 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Remove Button */}
                {!disabled && file.status === 'pending' && (
                  <button
                    onClick={() => onFileRemove(file.id)}
                    className="flex-shrink-0 p-1 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
