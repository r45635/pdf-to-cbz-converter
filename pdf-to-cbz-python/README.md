# PDF to CBZ Converter - Python

A local advanced converter from PDF to CBZ, with DPI analysis, image format options, configuration management, comprehensive hints system, and enhanced GUI.

![PDF to CBZ Banner](banner.png)

> Version `v2.2.0`
> Author: Vincent Cruvellier
> Compatible with: Windows/macOS/Linux, Python 3.9+

---

## Features

### Core Conversion
- Convert PDF to CBZ in PNG or JPEG
- Auto DPI detection with smart recommendations
- Manual DPI/quality/image format options
- Multi-thread support with auto-detection
- DPI analysis mode with size projections
- Auto cleanup of temp image folders
- Comprehensive logging system

### Configuration Management
- **Persistent Settings**: Save and load conversion preferences
- **JSON Configuration**: Human-readable config files
- **Smart Defaults**: Automatic optimal value selection
- **CLI Override**: Command line arguments override config settings

### Enhanced GUI (v2.1.0+)
- **Enhanced Preview System**: Always-visible zoom controls
- **Smart Zoom Modes**: Normal/Puissant/Ultra levels (keyboard: 1/2/3)
- **Auto-Updating Preview**: Real-time updates on settings changes
- **Settings Transfer**: Apply preview settings to main GUI
- **Protected Info Bar**: Always-visible size metrics

---

## Installation

### Option 1: Download Pre-built Executables (Recommended)

Download from [GitHub Releases](../../releases):

**Windows:**
- Download `pdf_to_cbz_v{version}_windows.zip`
- Extract and run `pdf_to_cbz_gui.exe` (GUI) or `pdf_to_cbz_cli.exe` (CLI)

**macOS:**
- Download `pdf_to_cbz_v{version}_macos.zip`
- Extract and open `pdf_to_cbz_gui.app`
- CLI: run `./pdf_to_cbz_cli` from Terminal

### Option 2: Install from Source

```bash
# Install dependencies
pip install -r requirements.txt

# Run GUI
python pdf_to_cbz_gui.py

# Run CLI
python pdf_to_cbz.py document.pdf
```

---

## Quick Start

### Get Help
```bash
python hints.py           # Show hints and guidance
python pdf_to_cbz.py --help  # Command help
```

### Create Configuration
```bash
python pdf_to_cbz.py --create-config
# Creates ~/.pdf2cbz_config.sample.json
```

### Basic Usage

```bash
# Basic conversion with auto-settings
python pdf_to_cbz.py document.pdf

# High-quality conversion
python pdf_to_cbz.py document.pdf -d 200 -f png -q 95

# Analyze before converting
python pdf_to_cbz.py document.pdf --analyse

# Save settings for future use
python pdf_to_cbz.py document.pdf --save-config
```

### GUI
```bash
python pdf_to_cbz_gui.py
```

---

## Advanced Usage

### For Comics/Manga
```bash
python pdf_to_cbz.py comic.pdf -d 150 -f jpeg -q 85
```

### For Text Documents
```bash
python pdf_to_cbz.py textbook.pdf -d 200 -f png
```

### Batch Processing
```bash
# Set up config first
python pdf_to_cbz.py sample.pdf -d 180 -f jpeg -q 90 --save-config

# Process multiple files
python pdf_to_cbz.py book1.pdf
python pdf_to_cbz.py book2.pdf
```

---

## Building Executables

### Windows
```bash
pyinstaller --onefile pdf_to_cbz_v2.spec
```

### macOS
```bash
pyinstaller --onefile --windowed --collect-all fitz --name pdf_to_cbz_gui pdf_to_cbz_gui.py
pyinstaller --onefile --collect-all fitz --name pdf_to_cbz_cli pdf_to_cbz.py
```

---

## Dependencies

- Python >= 3.9
- PyMuPDF
- Pillow
- PyPDF2
- tqdm

---

## Automated Releases

See [AUTOMATED_RELEASES.md](./AUTOMATED_RELEASES.md) for GitHub Actions release system.

```powershell
.\release.ps1 -Version "2.2.0" -Message "Add new features"
```

---

## License

MIT License
