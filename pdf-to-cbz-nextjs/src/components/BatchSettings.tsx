'use client';

import { useState } from 'react';
import { BatchSettings, BatchConfig, BatchConversionMode } from '@/lib/batch-types';

interface BatchSettingsProps {
  settings: BatchSettings;
  onChange: (settings: BatchSettings) => void;
  config: BatchConfig;
  onConfigChange: (config: BatchConfig) => void;
  disabled?: boolean;
  mode: BatchConversionMode;
}

export default function BatchSettingsPanel({
  settings,
  onChange,
  config,
  onConfigChange,
  disabled = false,
  mode,
}: BatchSettingsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-medium text-gray-300">Paramètres de conversion</h3>

      {/* DPI - PDF to CBZ only */}
      {mode === 'pdf-to-cbz' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Résolution (DPI)</label>
          <div className="flex gap-2">
            <button
              onClick={() => onChange({ ...settings, dpi: 'auto' })}
              disabled={disabled}
              className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                settings.dpi === 'auto'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Auto (natif)
            </button>
            <input
              type="number"
              min="72"
              max="600"
              value={typeof settings.dpi === 'number' ? settings.dpi : ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  onChange({ ...settings, dpi: 'auto' });
                } else {
                  const dpi = parseInt(value, 10);
                  if (dpi >= 72 && dpi <= 600) {
                    onChange({ ...settings, dpi });
                  }
                }
              }}
              placeholder="150"
              disabled={disabled}
              className={`w-20 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-center focus:ring-1 focus:ring-blue-500 ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
          </div>
        </div>
      )}

      {/* Format - PDF to CBZ only */}
      {mode === 'pdf-to-cbz' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Format d&apos;image</label>
          <div className="flex gap-4">
            <label className={`flex items-center cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
              <input
                type="radio"
                name="format"
                value="jpeg"
                checked={settings.format === 'jpeg'}
                onChange={() => onChange({ ...settings, format: 'jpeg' })}
                disabled={disabled}
                className="mr-2"
              />
              <span className="text-sm text-gray-300">JPEG</span>
            </label>
            <label className={`flex items-center cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
              <input
                type="radio"
                name="format"
                value="png"
                checked={settings.format === 'png'}
                onChange={() => onChange({ ...settings, format: 'png' })}
                disabled={disabled}
                className="mr-2"
              />
              <span className="text-sm text-gray-300">PNG</span>
            </label>
          </div>
        </div>
      )}

      {/* Quality */}
      {(mode === 'cbz-to-pdf' || settings.format === 'jpeg') && (
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Qualité JPEG</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="50"
              max="100"
              value={settings.quality}
              onChange={(e) => onChange({ ...settings, quality: parseInt(e.target.value, 10) })}
              disabled={disabled}
              className={`flex-1 ${mode === 'cbz-to-pdf' ? 'accent-green-500' : 'accent-blue-500'} ${disabled ? 'opacity-50' : ''}`}
            />
            <span className="text-sm text-gray-400 w-12 text-right">{settings.quality}%</span>
          </div>
        </div>
      )}

      {/* Expiration */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400">Expiration des résultats</label>
        <select
          value={settings.expireMinutes}
          onChange={(e) => onChange({ ...settings, expireMinutes: parseInt(e.target.value, 10) })}
          disabled={disabled}
          className={`w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:ring-1 focus:ring-blue-500 ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <option value={30}>30 minutes</option>
          <option value={60}>1 heure</option>
          <option value={120}>2 heures</option>
          <option value={360}>6 heures</option>
          <option value={720}>12 heures</option>
          {config.maxExpireMinutes >= 1440 && <option value={1440}>24 heures</option>}
        </select>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="pt-2 border-t border-gray-700">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Paramètres avancés
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3">
            {/* Max Files */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400">
                Nombre max de fichiers (max serveur: {config.serverMaxFiles})
              </label>
              <input
                type="number"
                min="1"
                max={config.serverMaxFiles}
                value={config.maxFiles}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (value >= 1 && value <= config.serverMaxFiles) {
                    onConfigChange({ ...config, maxFiles: value });
                  }
                }}
                disabled={disabled}
                className={`w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:ring-1 focus:ring-blue-500 ${
                  disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Max File Size */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400">
                Taille max par fichier en MB (max serveur: {config.serverMaxFileSizeMB})
              </label>
              <input
                type="number"
                min="1"
                max={config.serverMaxFileSizeMB}
                value={config.maxFileSizeMB}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (value >= 1 && value <= config.serverMaxFileSizeMB) {
                    onConfigChange({ ...config, maxFileSizeMB: value });
                  }
                }}
                disabled={disabled}
                className={`w-full px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:ring-1 focus:ring-blue-500 ${
                  disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Info */}
            <p className="text-xs text-gray-500">
              Ces limites s&apos;appliquent à cette session. Le serveur a des limites maximales que vous ne pouvez pas dépasser.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
