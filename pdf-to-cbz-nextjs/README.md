# PDF to CBZ Converter - Next.js

A modern web-based PDF to CBZ converter built with Next.js 16, TypeScript, and Tailwind CSS.

## Features

- **Live Preview**: Real-time page preview with adjustable parameters
- **Auto-Optimization**: Tests multiple DPI/quality combinations to find optimal settings
- **Direct Extraction**: Extract embedded images directly from PDF (exact quality match)
- **Side-by-side Comparison**: Compare original vs converted with synchronized zoom/pan
- **Streaming Progress**: Real-time conversion progress via Server-Sent Events
- **Two Conversion Modes**:
  - **Convert**: Render pages at chosen DPI (adjustable quality)
  - **Direct Extract**: Extract images as-is from PDF (exact quality)

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/analyze` | Analyze PDF structure and get recommendations |
| `POST /api/preview` | Generate preview of a single page |
| `POST /api/convert` | Convert PDF to CBZ with custom parameters |
| `POST /api/extract` | Direct image extraction to CBZ |
| `POST /api/extract-preview` | Extract original image from a page |
| `POST /api/optimize-stream` | Auto-optimize parameters (SSE) |

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **PDF Processing**: pdf-to-img, pdfjs-dist, pdf-lib
- **Image Processing**: Sharp
- **Archive**: Archiver

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/        # PDF analysis
│   │   ├── convert/        # Standard conversion
│   │   ├── extract/        # Direct extraction
│   │   ├── extract-preview/# Single page extraction
│   │   ├── optimize-stream/# Auto-optimization (SSE)
│   │   └── preview/        # Page preview
│   ├── page.tsx            # Main UI
│   └── layout.tsx
└── lib/
    └── pdf-converter.ts    # Core conversion logic
```

## Usage

1. **Upload PDF**: Drag & drop or click to select
2. **Adjust Settings**: Choose DPI mode, format (JPEG/PNG), quality
3. **Preview**: See real-time preview of conversion
4. **Compare**: Use comparison mode to see original vs converted
5. **Convert**:
   - Click "Convert" for rendered output
   - Click "Direct Extract" for exact image extraction

## License

MIT License
