# PDF to CBZ Converter

Convert PDF files to CBZ format for comic book readers. Choose between a modern web application or a cross-platform desktop application.

**Live Demo:** [https://pdf-to-cbz-converter.vercel.app](https://pdf-to-cbz-converter.vercel.app)

## Projects

| Project | Type | Best For |
|---------|------|----------|
| [pdf-to-cbz-nextjs](./pdf-to-cbz-nextjs/) | Web App | Quick conversions, live preview, no install |
| [pdf-to-cbz-python](./pdf-to-cbz-python/) | Desktop App | Large files, batch processing, offline use |
| [Docker](https://hub.docker.com/r/r45635/pdf-to-cbz) | Container | Self-hosted, no size limits |

---

### Web Application (Next.js)

Modern web-based converter deployed on Vercel.

**Features:**
- Live preview with adjustable DPI/quality
- Auto-optimization for optimal file size
- Direct image extraction from PDF
- Side-by-side comparison view
- Real-time streaming progress

**Quick Start:**
```bash
cd pdf-to-cbz-nextjs
npm install
npm run dev
# Open http://localhost:3000
```

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, pdfjs-dist, Sharp

> **Note:** The [live demo](https://pdf-to-cbz-converter.vercel.app) has a 4.5MB file size limit (Vercel free tier). For larger files, run locally or use the Python app.

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
- CLI for scripting and batch processing
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
