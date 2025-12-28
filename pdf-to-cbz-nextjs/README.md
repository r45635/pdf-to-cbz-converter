# PDF to CBZ Converter - Next.js

Modern web-based PDF to CBZ converter with real-time preview and auto-optimization.

**Live Demo:** [https://pdf-to-cbz-converter.vercel.app](https://pdf-to-cbz-converter.vercel.app)

## ✨ Features

- **Live Preview** - Real-time page preview with adjustable parameters
- **Auto-Optimization** - Automatic parameter tuning for optimal file size
- **Direct Extraction** - Extract embedded images directly from PDF
- **Side-by-side Comparison** - Compare original vs converted with synchronized zoom/pan
- **Streaming Progress** - Real-time conversion progress via Server-Sent Events
- **Two Conversion Modes:**
  - **Convert**: Render pages at chosen DPI (adjustable quality)
  - **Direct Extract**: Extract images as-is from PDF (exact quality)

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/analyze` | Analyze PDF structure and get recommendations |
| `POST /api/preview` | Generate preview of a single page |
| `POST /api/convert` | Convert PDF to CBZ with custom parameters |
| `POST /api/extract` | Direct image extraction to CBZ |
| `POST /api/extract-preview` | Extract original image from a page |
| `POST /api/optimize-stream` | Auto-optimize parameters (SSE) |

## 🛠️ Tech Stack

- **Framework:** Next.js 16 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **PDF Processing:** pdf-to-img, pdfjs-dist, pdf-lib
- **Image Processing:** Sharp
- **Archive:** Archiver

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/           # PDF analysis
│   │   ├── convert/           # Standard conversion
│   │   ├── extract/           # Direct extraction
│   │   ├── extract-preview/   # Single page extraction
│   │   ├── optimize-stream/   # Auto-optimization (SSE)
│   │   └── preview/           # Page preview
│   ├── page.tsx               # Main UI
│   └── layout.tsx
└── lib/
    └── pdf-converter.ts       # Core conversion logic
```

## 💡 Usage

1. **Upload PDF** - Drag & drop or click to select
2. **Adjust Settings** - Choose DPI mode, format (JPEG/PNG), quality
3. **Preview** - See real-time preview of conversion
4. **Compare** - Use comparison mode (original vs converted)
5. **Convert** - Click "Convert" or "Direct Extract"

## 🐳 Docker Deployment

Build and run locally with Docker:

```bash
# Build the image
docker build -t pdf-to-cbz .

# Run the container
docker run -p 3000:3000 pdf-to-cbz
```

Open [http://localhost:3000](http://localhost:3000)

**Docker Compose** (optional):

```yaml
# docker-compose.yml
services:
  pdf-to-cbz:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
```

```bash
docker compose up -d
```

## 🚀 Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyour-username%2Fpdf-to-cbz-converter%2Ftree%2Fmain%2Fpdf-to-cbz-nextjs)

**Configuration** (vercel.json):
- Region: Paris (cdg1)
- Function timeout: 300s

## 📄 License

MIT License
