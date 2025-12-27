// Polyfills for serverless environment (Vercel)
// Must be imported before pdfjs-dist

if (typeof globalThis.DOMMatrix === 'undefined') {
  try {
    // Canvas provides DOMMatrix polyfill
    const canvas = require('canvas');
    globalThis.DOMMatrix = canvas.DOMMatrix;
    globalThis.Path2D = canvas.Path2D;
  } catch {
    // Fallback: minimal DOMMatrix polyfill
    class DOMMatrixPolyfill {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true;
      isIdentity = true;

      constructor(init?: string | number[]) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          this.m11 = this.a;
          this.m12 = this.b;
          this.m21 = this.c;
          this.m22 = this.d;
          this.m41 = this.e;
          this.m42 = this.f;
        }
      }

      multiply() { return new DOMMatrixPolyfill(); }
      translate() { return new DOMMatrixPolyfill(); }
      scale() { return new DOMMatrixPolyfill(); }
      rotate() { return new DOMMatrixPolyfill(); }
      inverse() { return new DOMMatrixPolyfill(); }
      transformPoint(point: { x: number; y: number }) { return point; }
    }
    globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof DOMMatrix;
  }
}

export {};
