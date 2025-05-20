# 📘 PDF to CBZ Converter (`pdf_to_cbz`)

A local advanced converter from PDF to CBZ, with DPI analysis, image format options, batch mode, multi-threading, logging, and more.

![PDF to CBZ Banner](banner.png)

> Version `v1.0.0` – Build `20240518`  
> Author: Vincent Cruvellier  
> Compatible with: Windows (requires Poppler), Python 3.9+

---

## ✨ Features

- 🖼️ Convert PDF to CBZ in PNG or JPEG
- 🧠 Auto DPI detection (`--auto-dpi`)
- 📏 Manual DPI/quality/image format options
- ⚙️ Batch directory conversion
- 🚀 Multi-thread support (`--threads`)
- 🧪 DPI analysis mode (`--analyse`)
- 🧼 Auto cleanup of temp image folders
- 📝 Logging to console or file (`--logfile`)
- 🧪 Dry-run mode (`--dry-run`)
- 📦 CBZ comment embedding (`--cbz-comment`)
- ✅ Executable version available (see below)

---

## 📥 Installation

### 1. Clone this repository

```bash
git clone https://github.com/your-username/pdf_to_cbz.git
cd pdf_to_cbz
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Install Poppler for Windows

- Download: https://github.com/oschwartz10612/poppler-windows/releases
- Add the `bin/` directory to your system `PATH`
- Or configure the `POPPLER_PATH` variable in the script

---

## 🚀 Usage

### Basic conversion:

```bash
python pdf_to_cbz_v104.py myfile.pdf
```

### Batch conversion with options:

```bash
python pdf_to_cbz_v104.py sample_dir/ --output-dir out_cbz --auto-dpi --format jpeg --quality 85 --threads 4
```

### Analyse without conversion:

```bash
python pdf_to_cbz_v104.py myfile.pdf --analyse
```

### Get help:

```bash
python pdf_to_cbz_v104.py --help
```

---

## 🖥️ Windows Executable Version

If you don't want to install Python or dependencies, compile a standalone `.exe`:

```bash
pyinstaller --onefile pdf_to_cbz.spec
```

Or use the one already in the `dist/` folder (if available):

```bash
pdf_to_cbz.exe sample_dir/ --output-dir out_cbz --auto-dpi
```

> Requires Poppler (`pdftoppm.exe`) in system PATH.

---

## 🧪 Testing

A `.bat` script is provided to validate all main features:

```bash
test_pdf_to_cbz.bat
```

---

## 📁 Sample Data

- `sample_dir/`: contains sample PDF input
- `out_cbz/`: output CBZ results

---

## 🛠 Dependencies

- Python ≥ 3.9
- pdf2image
- Pillow
- Poppler for Windows

---

## 📄 License

This project is licensed under the MIT License. See `LICENSE`.

---

## 💬 Credits

Built with ❤️ to make comic collections easier to manage and convert.
