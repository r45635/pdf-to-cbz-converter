# PDF to CBZ Converter

Convert PDF files to CBZ format for comic book readers. Choose between a web application or desktop application.

**Live Demo:** [https://pdf-to-cbz-converter.vercel.app](https://pdf-to-cbz-converter.vercel.app)

## 🚀 Quick Start

### Web Application (Next.js)
```bash
cd pdf-to-cbz-nextjs
npm install
npm run dev
# Open http://localhost:3000
```

### Desktop Application (Python)
```bash
cd pdf-to-cbz-python
pip install -r requirements.txt
python pdf_to_cbz_gui.py
```

## 📦 Projects

### [pdf-to-cbz-nextjs](./pdf-to-cbz-nextjs/) - Web Application

Modern web-based converter with real-time preview and auto-optimization.

**Features:**
- Live preview with adjustable DPI/quality
- Auto-optimization for optimal file size
- Direct image extraction from PDF
- Side-by-side comparison
- Streaming progress updates

**Tech:** Next.js 16, TypeScript, Tailwind CSS, Sharp

> **Note:** Live demo has 4.5MB file limit. For larger files, run locally or use the Python app.

### [pdf-to-cbz-python](./pdf-to-cbz-python/) - Desktop Application

Cross-platform desktop converter with GUI and CLI.

**Features:**
- Full-featured GUI with preview
- CLI for batch processing
- Configuration management
- Auto DPI detection
- Multi-threaded conversion
- Pre-built executables available

**Requirements:** Python 3.9+, Windows/macOS/Linux

## 📄 License

MIT License - See [LICENSE](./LICENSE)

**Author:** Vincent Cruvellier
