# PDF to CBZ Converter - Python

Convert PDF files to CBZ format with advanced features and cross-platform support.

> **Version:** 2.2.2
> **Author:** Vincent Cruvellier
> **Platforms:** Windows, macOS, Linux
> **Python:** 3.9+

## Features

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

### GUI Mode
- Real-time preview with zoom controls
- Auto-updating preview on settings changes
- Settings transfer from preview to main GUI
- Always-visible size metrics

## Installation

### Pre-built Executables (Recommended)

Download from [GitHub Releases](../../releases):

| Platform | File | Run |
|----------|------|-----|
| Windows | `pdf_to_cbz_v{version}_windows.zip` | `pdf_to_cbz_gui.exe` or `pdf_to_cbz_cli.exe` |
| macOS | `pdf_to_cbz_v{version}_macos.zip` | `pdf_to_cbz_gui.app` or `./pdf_to_cbz_cli` |

### From Source

```bash
# Clone the repository
cd pdf-to-cbz-python

# Install Python dependencies
pip install -r requirements.txt

# Run CLI
python pdf_to_cbz.py document.pdf

# Run GUI
python pdf_to_cbz_gui.py
```

### GUI Requirements (tkinter)

The GUI requires **tkinter**, which is a system package (not installed via pip):

| Platform | Installation |
|----------|-------------|
| **macOS** | `brew install python-tk@3.x` (match your Python version) |
| **Ubuntu/Debian** | `sudo apt-get install python3-tk` |
| **Fedora** | `sudo dnf install python3-tkinter` |
| **Windows** | Included with standard Python installer |

> **Note:** The CLI works without tkinter. If tkinter is not available, the GUI will show installation instructions.

## Quick Start

```bash
# Get help
python pdf_to_cbz.py --help

# Analyze PDF (shows DPI recommendations)
python pdf_to_cbz.py document.pdf --analyse

# Basic conversion (auto DPI)
python pdf_to_cbz.py document.pdf

# Custom settings
python pdf_to_cbz.py document.pdf -d 200 -f jpeg -q 90

# Save settings as default
python pdf_to_cbz.py document.pdf -d 150 -f jpeg -q 85 --save-config

# Launch GUI
python pdf_to_cbz_gui.py
```

## CLI Options

```
usage: pdf_to_cbz.py [-h] [-o OUTPUT] [-d DPI] [-f {jpeg,png}] [-q QUALITY]
                     [-t THREADS] [-l LOGFILE] [--analyse] [--create-config]
                     [--save-config] input

Options:
  -o, --output      Output CBZ file (defaults to input.cbz)
  -d, --dpi         Force DPI (otherwise auto-detected)
  -f, --format      Image format: jpeg or png
  -q, --quality     JPEG quality (1-100)
  -t, --threads     Number of worker threads
  -l, --logfile     Write logs to file
  --analyse         Print DPI analysis and exit
  --create-config   Create sample configuration file
  --save-config     Save current options as defaults
```

## Common Use Cases

### Comics/Manga
```bash
python pdf_to_cbz.py comic.pdf -d 150 -f jpeg -q 85
```

### High-Quality Scans
```bash
python pdf_to_cbz.py artbook.pdf -d 300 -f png
```

### Batch Processing
```bash
# Set up defaults once
python pdf_to_cbz.py sample.pdf -d 180 -f jpeg -q 90 --save-config

# Process multiple files with saved settings
python pdf_to_cbz.py book1.pdf
python pdf_to_cbz.py book2.pdf
python pdf_to_cbz.py book3.pdf
```

## Dependencies

### Python Packages (requirements.txt)
- **PyMuPDF** - PDF rendering
- **Pillow** - Image processing
- **PyPDF2** - PDF utilities
- **tqdm** - Progress bars

### System Packages
- **tkinter** - GUI (see installation section)

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

## Automated Releases

See [AUTOMATED_RELEASES.md](./AUTOMATED_RELEASES.md) for CI/CD details.

```powershell
.\release.ps1 -Version "2.2.2" -Message "Add new features"
```

## License

MIT License - See [LICENSE](../LICENSE)
