# PDF to CBZ Converter

Convert PDF files to CBZ format for comic book readers. This repository contains two implementations:

**Live Demo:** [https://pdf-to-cbz-converter.vercel.app](https://pdf-to-cbz-converter.vercel.app)

## Projects

### [pdf-to-cbz-nextjs](./pdf-to-cbz-nextjs/) - Web Application

A modern web-based converter built with Next.js 16, featuring:

- **Live Preview**: Real-time preview with adjustable DPI, format, and quality
- **Auto-Optimization**: Automatic parameter detection for optimal file size
- **Direct Extraction**: Extract embedded images directly from PDF (exact quality)
- **Side-by-side Comparison**: Compare original vs converted with synchronized zoom/pan
- **Streaming Progress**: Real-time conversion progress with Server-Sent Events

```bash
cd pdf-to-cbz-nextjs
npm install
npm run dev
# Open http://localhost:3000
```

> **Note on Vercel Demo Limits**: The [live demo](https://pdf-to-cbz-converter.vercel.app) runs on Vercel's free tier which has a **4.5MB request body limit**. For larger PDF files, run the application locally or use the Python desktop application.

### [pdf-to-cbz-python](./pdf-to-cbz-python/) - Desktop Application

A Python-based converter with GUI and CLI, featuring:

- **Desktop GUI**: Full-featured graphical interface with preview
- **CLI Tool**: Command-line interface for batch processing
- **Configuration Management**: Save and load conversion preferences
- **Cross-platform**: Windows, macOS, Linux support
- **Standalone Executables**: Pre-built binaries available

```bash
cd pdf-to-cbz-python
pip install -r requirements.txt
python pdf_to_cbz_gui.py  # GUI
python pdf_to_cbz.py document.pdf  # CLI
```

## Sample Files

The `sample_dir/` folder contains sample PDF files for testing.

## License

MIT License - See [LICENSE](./LICENSE)

## Author

Vincent Cruvellier
