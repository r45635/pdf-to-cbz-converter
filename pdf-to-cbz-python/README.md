# PDF ↔ CBZ Converter - Python

Bidirectional converter between PDF and comic book archive formats (CBZ, CBR, CB7, CBT).

> **Version:** 2.4.0
> **Author:** Vincent Cruvellier
> **Platforms:** Windows, macOS, Linux
> **Python:** 3.9+

## Features

### Bidirectional Conversion
- **PDF → CBZ**: Convert PDF files to CBZ (PNG or JPEG)
- **CBZ → PDF**: Convert comic book archives back to PDF
- Supports CBZ, CBR, CB7, and CBT input formats
- Auto DPI detection with smart recommendations
- Multi-threaded processing
- Lossless quality with img2pdf (optional)

### Configuration Management
- Save and load conversion preferences
- JSON configuration files
- Smart defaults with CLI override support

### GUI Mode
- Mode selector: PDF→CBZ or CBZ→PDF
- Real-time preview with zoom controls
- Auto-updating preview on settings changes
- Dark/Light theme support

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
# Launch GUI (supports both directions)
python pdf_to_cbz_gui.py

# === PDF to CBZ ===
python pdf_to_cbz.py --help
python pdf_to_cbz.py document.pdf --analyse    # Analyze PDF
python pdf_to_cbz.py document.pdf              # Basic conversion
python pdf_to_cbz.py document.pdf -d 200 -f jpeg -q 90  # Custom settings

# === CBZ to PDF ===
python cbz_to_pdf.py --help
python cbz_to_pdf.py comic.cbz --analyse       # Analyze archive
python cbz_to_pdf.py comic.cbz                 # Basic conversion
python cbz_to_pdf.py comic.cbz -q 95           # High quality
```

## CLI Options

### pdf_to_cbz.py (PDF → CBZ)
```
Options:
  -o, --output      Output CBZ file (defaults to input.cbz)
  -d, --dpi         Force DPI (otherwise auto-detected)
  -f, --format      Image format: jpeg or png
  -q, --quality     JPEG quality (1-100)
  -t, --threads     Number of worker threads
  -l, --logfile     Write logs to file
  --analyse         Print DPI analysis and exit
  --save-config     Save current options as defaults
```

### cbz_to_pdf.py (CBZ → PDF)
```
Options:
  -o, --output      Output PDF file (defaults to input.pdf)
  -q, --quality     JPEG quality for conversion (1-100)
  --no-img2pdf      Use Pillow instead of img2pdf
  -t, --threads     Number of worker threads
  -l, --logfile     Write logs to file
  --analyse         Print archive analysis and exit
  --debug           Enable debug logging
```

**Supported input formats:** CBZ, CBR (requires unar or unrar), CB7 (requires py7zr), CBT

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
- **PyMuPDF** - PDF rendering (PDF→CBZ)
- **Pillow** - Image processing
- **PyPDF2** - PDF utilities
- **tqdm** - Progress bars
- **img2pdf** - Lossless PDF creation (CBZ→PDF, recommended)

### Optional Packages
- **py7zr** - CB7 support

### System Packages
- **tkinter** - GUI (see installation section)
- **unar** or **unrar** - CBR support

#### CBR Support Installation
| Platform | Command |
|----------|---------|
| **macOS** | `brew install unar` (recommended, Gatekeeper-friendly) |
| **Ubuntu/Debian** | `sudo apt-get install unar` or `sudo apt-get install unrar` |
| **Windows** | Download [unrar](https://www.rarlab.com/rar_add.htm) and add to PATH |

## License

MIT License - See [LICENSE](../LICENSE)
