# PDF to CBZ Converter

Convert PDF files to CBZ format for comic book readers. Choose between a modern web application or a cross-platform desktop application.

**Live Demo:** [https://pdf-to-cbz-converter.vercel.app](https://pdf-to-cbz-converter.vercel.app)

## Screenshots

### Single File Mode
![Single File Mode](doc/web-single-mode.png)
*Live preview with adjustable DPI/quality settings and side-by-side comparison*

### Batch Mode
![Batch Mode](doc/web-batch-mode.png)
*Convert multiple PDFs at once with progress tracking and bulk download*

## Projects

| Project | Type | Best For |
|---------|------|----------|
| [pdf-to-cbz-nextjs](./pdf-to-cbz-nextjs/) | Web App | Quick conversions, live preview, batch processing |
| [pdf-to-cbz-python](./pdf-to-cbz-python/) | Desktop App | Large files, offline use |
| [Docker](https://hub.docker.com/r/r45635/pdf-to-cbz) | Container | Self-hosted, no size limits |

---

### Web Application (Next.js)

Modern web-based converter deployed on Vercel.

**Features:**
- **Single File Mode:** Live preview, adjustable DPI/quality, side-by-side comparison
- **Batch Mode:** Convert up to 50 PDFs simultaneously with progress tracking
- Auto-optimization for optimal file size
- Direct image extraction from PDF
- Real-time streaming progress
- Download results individually or as ZIP
- Configurable expiration for batch results (1h default)

**Quick Start:**
```bash
cd pdf-to-cbz-nextjs
npm install
npm run dev
# Open http://localhost:3000
```

**Batch Mode Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `POST /api/batch-convert` | Convert multiple PDFs (SSE streaming) |
| `GET /api/batch-results/{jobId}` | Get job status and download links |
| `GET /api/download/{jobId}/{fileId}` | Download individual CBZ |
| `GET /api/download-all/{jobId}` | Download all as ZIP |

**Environment Variables (Docker/Self-hosted):**
```bash
BATCH_MAX_FILES=50              # Max files per batch (default: 50)
BATCH_MAX_FILE_SIZE_MB=500      # Max size per file in MB (default: 500)
BATCH_DEFAULT_EXPIRE_MINUTES=60 # Results expiration (default: 60)
```

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, pdfjs-dist, Sharp

> **Note:** The [live demo](https://pdf-to-cbz-converter.vercel.app) has a 4.5MB file size limit (Vercel free tier). For larger files or batch processing, run locally or use Docker.

**Docker:**
```bash
docker pull r45635/pdf-to-cbz
docker run -p 3000:3000 r45635/pdf-to-cbz
# Open http://localhost:3000
```

---

### Desktop Application (Python)

Cross-platform desktop converter with GUI and CLI modes.

**Features:**
- Full-featured GUI with real-time preview
- CLI for scripting and automation
- Configuration management (save/load settings)
- Auto DPI detection with smart recommendations
- Multi-threaded conversion
- Pre-built executables available

**Quick Start:**
```bash
cd pdf-to-cbz-python
pip install -r requirements.txt

# CLI mode
python pdf_to_cbz.py document.pdf

# GUI mode (requires tkinter)
python pdf_to_cbz_gui.py
```

**Requirements:**
- Python 3.9+
- Windows, macOS, or Linux
- tkinter for GUI (see [Python README](./pdf-to-cbz-python/README.md) for installation)

---

## Sample Files

The `sample_dir/` folder contains sample PDF files for testing both applications.

## License

MIT License - See [LICENSE](./LICENSE)

**Author:** Vincent Cruvellier
