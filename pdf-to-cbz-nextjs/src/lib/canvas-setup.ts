// Canvas setup - must be loaded BEFORE any pdfjs import
// This ensures DOMMatrix and Path2D are available globally

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const canvas = require('canvas');
  
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = canvas.DOMMatrix;
    console.log('[canvas-setup] DOMMatrix polyfill installed');
  }
  
  if (typeof globalThis.Path2D === 'undefined' && canvas.Path2D) {
    globalThis.Path2D = canvas.Path2D;
    console.log('[canvas-setup] Path2D polyfill installed');
  }
} catch (error) {
  console.error('[canvas-setup] Failed to load canvas:', error);
}
