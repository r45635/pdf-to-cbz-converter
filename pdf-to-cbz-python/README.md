# PDF to CBZ Converter - Python

Convert PDF files to CBZ format with advanced features and cross-platform support.

> **Version:** 2.2.0  
> **Author:** Vincent Cruvellier  
> **Platforms:** Windows, macOS, Linux  
> **Python:** 3.9+

## ✨ Features

### Core Conversion
- Convert PDF to CBZ (PNG or JPEG)
- Auto DPI detection with smart recommendations
- Multi-threaded processing
- DPI analysis mode with size projections
- Comprehensive logging

### Configuration Management
- Save and load conversion preferences
- JSON configuration files
- Smart defaults with CLI override support

### Enhanced GUI
- Real-time preview with zoom controls (1/2/3 for Normal/Power/Ultra)
- Auto-updating preview on settings changes
- Settings transfer from preview to main GUI
- Always-visible size metrics

## 🚀 Installation

### Pre-built Executables (Recommended)

Download from [GitHub Releases](../../releases):

**Windows:**
```
pdf_to_cbz_v{version}_windows.zip
→ Run pdf_to_cbz_gui.exe or pdf_to_cbz_cli.exe
```

**macOS:**
```
pdf_to_cbz_v{version}_macos.zip
→ Open pdf_to_cbz_gui.app or run ./pdf_to_cbz_cli
```

### From Source

```bash
pip install -r requirements.txt
python pdf_to_cbz_gui.py  # GUI
python pdf_to_cbz.py document.pdf  # CLI
```

## 📖 Quick Start

```bash
# Get help
python hints.py
python pdf_to_cbz.py --help

# Create configuration
python pdf_to_cbz.py --create-config

# Basic conversion
python pdf_to_cbz.py document.pdf

# High-quality conversion
python pdf_to_cbz.py document.pdf -d 200 -f png -q 95

# Analyze before converting
python pdf_to_cbz.py document.pdf --analyse

# Save settings
python pdf_to_cbz.py document.pdf --save-config

# GUI
python pdf_to_cbz_gui.py
```

## 💡 Common Use Cases

### Comics/Manga
```bash
python pdf_to_cbz.py comic.pdf -d 150 -f jpeg -q 85
```

### Text Documents
```bash
python pdf_to_cbz.py textbook.pdf -d 200 -f png
```

### Batch Processing
```bash
# Set up config
python pdf_to_cbz.py sample.pdf -d 180 -f jpeg -q 90 --save-config

# Process files
python pdf_to_cbz.py book1.pdf
python pdf_to_cbz.py book2.pdf
```

## 🔧 Building Executables

### Windows
```bash
pyinstaller --onefile pdf_to_cbz_v2.spec
```

### macOS
```bash
pyinstaller --onefile --windowed --collect-all fitz --name pdf_to_cbz_gui pdf_to_cbz_gui.py
pyinstaller --onefile --collect-all fitz --name pdf_to_cbz_cli pdf_to_cbz.py
```

## 📦 Dependencies

- PyMuPDF (PDF processing)
- Pillow (Image manipulation)
- PyPDF2 (PDF utilities)
- tqdm (Progress bars)

## 🔄 Automated Releases

See [AUTOMATED_RELEASES.md](./AUTOMATED_RELEASES.md)

```powershell
.\release.ps1 -Version "2.2.0" -Message "Add new features"
```

## 📄 License

MIT License
