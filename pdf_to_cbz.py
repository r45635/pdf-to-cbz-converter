#!/usr/bin/env python3
"""
pdf_to_cbz.py

Convert a PDF into a CBZ (ZIP of images) using PyMuPDF (fitz) for rasterization,
with multiprocessing and in-memory zipping. No external Poppler binaries are required.

Extras:
- Optional configuration helpers to create a sample config and save current settings.
"""
import argparse
import logging
import subprocess
import sys
import zipfile
import tempfile
import io
import os
from multiprocessing import freeze_support
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from PyPDF2 import PdfReader
from tqdm import tqdm
from PIL import Image
import fitz  # PyMuPDF
try:
    from config_manager import ConfigManager
except Exception:
    ConfigManager = None  # Optional for CLI helpers


def setup_logging(logfile: Path | None = None):
    """
    Configure logging:
      - No logfile: suppress WARNING and below, show only ERROR+ in console.
      - With logfile: write DEBUG+ to file and INFO+ to console.
    """
    root = logging.getLogger()
    # Clear existing handlers
    for handler in list(root.handlers):
        root.removeHandler(handler)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO if logfile else logging.ERROR)
    fmt = logging.Formatter("%(asctime)s %(levelname)s: %(message)s", "%Y-%m-%d %H:%M:%S")
    ch.setFormatter(fmt)
    root.addHandler(ch)

    # File handler if requested
    if logfile:
        fh = logging.FileHandler(str(logfile), mode="w", encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        root.addHandler(fh)

    # Global level
    root.setLevel(logging.DEBUG if logfile else logging.INFO)

    # If no logfile, disable WARNING and below globally
    if not logfile:
        logging.disable(logging.WARNING)


class Converter:
    def __init__(
        self,
        input_pdf: Path,
        output_cbz: Path,
        dpi: int | None,
        fmt: str,
        quality: int,
        threads: int,
        poppler_path: Path | None,
    ):
        self.input_pdf = input_pdf
        self.output_cbz = output_cbz
        self.dpi = dpi
        self.fmt = fmt
        self.quality = quality
        self.threads = threads
        self.poppler_path = poppler_path

    def calculate_clarity_dpi(self) -> int:
        reader = PdfReader(str(self.input_pdf))
        first = reader.pages[0]
        width_pt = float(first.mediabox.width)
        target_width = 2000
        dpi = int(target_width / width_pt * 72)
        dpi = max(dpi, 100)
        logging.info(
            f"Calculated clarity DPI: {dpi} "
            f"(target width {target_width}px, page width {width_pt}pt)"
        )
        return dpi

    def process_page(self, page_num: int) -> tuple[bytes, str]:
        ext = "jpg" if self.fmt == "jpeg" else "png"
        with tempfile.TemporaryDirectory(prefix="pdf2cbz_") as td:
            # Render using PyMuPDF (no external Poppler dependency)
            assert isinstance(self.dpi, int)
            try:
                with fitz.open(str(self.input_pdf)) as doc:
                    page = doc.load_page(page_num - 1)
                    scale = self.dpi / 72.0
                    mat = fitz.Matrix(scale, scale)
                    pix = page.get_pixmap(matrix=mat, alpha=False)
                    if self.fmt == "jpeg":
                        # Convert Pixmap to PIL for JPEG encoding and quality control
                        mode = "RGB"
                        img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
                        buf = io.BytesIO()
                        img.save(buf, format="JPEG", quality=self.quality)
                        data = buf.getvalue()
                    else:
                        # PNG bytes directly from Pixmap
                        data = pix.tobytes("png")
                    return data, f"{self.input_pdf.stem}_{page_num:03d}.{ext}"
            except Exception as e:
                logging.error(f"Rendering failed on page {page_num}: {e}")
        raise FileNotFoundError(f"Unable to render page {page_num}")

    def convert(self) -> None:
        reader = PdfReader(str(self.input_pdf))
        total = len(reader.pages)
        if not self.dpi:
            self.dpi = self.calculate_clarity_dpi()
        self.output_cbz.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(self.output_cbz, "w") as zf, \
             ProcessPoolExecutor(max_workers=self.threads) as executor:
            futures = {executor.submit(self.process_page, i + 1): i + 1 for i in range(total)}
            for fut in tqdm(as_completed(futures), total=total, desc="Converting"):
                page = futures[fut]
                try:
                    img_bytes, name = fut.result()
                    zf.writestr(name, img_bytes)
                except Exception as e:
                    logging.error(f"Failed to convert page {page}: {e}")
        logging.info(f"Created CBZ: {self.output_cbz}")

    def analyse(self) -> None:
        reader = PdfReader(str(self.input_pdf))
        widths = [float(p.mediabox.width) for p in reader.pages]
        dpi_vals = [int(2000 / w * 72) for w in widths]
        print("Page widths (pt):", [round(w, 1) for w in widths])
        print("Suggested DPIs:", dpi_vals)
        print("Min DPI:", min(dpi_vals))
        print("Max DPI:", max(dpi_vals))
        print("Avg DPI:", round(sum(dpi_vals) / len(dpi_vals)))


def parse_args():
    p = argparse.ArgumentParser(description="Convert PDF to CBZ")
    # Make input optional to allow pure config operations
    p.add_argument("input", type=Path, nargs="?", help="Input PDF file")
    p.add_argument(
        "-o", "--output", type=Path,
        help="Output CBZ file (defaults to input.cbz)"
    )
    p.add_argument("-d", "--dpi", type=int, help="Force DPI (otherwise auto)")
    p.add_argument(
        "-f", "--format", choices=["jpeg", "png"], default="jpeg",
        help="Image format"
    )
    p.add_argument("-q", "--quality", type=int, default=85, help="JPEG quality")
    p.add_argument(
        "-t", "--threads", type=int,
        default=os.cpu_count() or 1,
        help="Number of worker threads",
    )
    p.add_argument(
        "--poppler-path", type=Path,
        help="Path to Poppler bin folder (must contain pdftocairo[.exe])",
    )
    p.add_argument(
        "-l", "--logfile", type=Path,
        help="Write full logs (including debug and warnings) to this file",
    )
    p.add_argument(
        "--analyse", action="store_true",
        help="Print page-size/DPI analysis and exit"
    )
    # Config helpers (optional)
    p.add_argument(
        "--create-config", action="store_true",
        help="Create a sample configuration file in your home directory",
    )
    p.add_argument(
        "--save-config", action="store_true",
        help="Save current CLI options as your default configuration",
    )
    return p.parse_args()


def main():
    args = parse_args()
    setup_logging(args.logfile)

    # Handle config helper actions first
    if args.create_config:
        if not ConfigManager:
            print("Configuration helper unavailable (missing config_manager).")
        else:
            cm = ConfigManager()
            cm.create_sample_config()
        # If only creating config, and no input provided, exit here
        if args.input is None:
            return

    if args.save_config:
        if not ConfigManager:
            print("Configuration helper unavailable (missing config_manager).")
        else:
            cm = ConfigManager()
            # Persist current CLI values as defaults
            cm.set('dpi', args.dpi)
            cm.set('format', args.format)
            cm.set('quality', args.quality)
            cm.set('threads', args.threads)
            cm.set('poppler_path', str(args.poppler_path) if args.poppler_path else None)
            cm.save_config()
        # Continue with conversion if input is present

    inp = args.input
    if inp is None:
        logging.error("No input PDF provided. See --help for usage.")
        sys.exit(2)
    if not inp.is_file():
        logging.error("Input file not found: %s", inp)
        sys.exit(1)
    if inp.suffix.lower() != ".pdf":
        logging.error("Le fichier source n’est pas un PDF : %s", inp)
        sys.exit(1)

    out = args.output or inp.with_suffix(".cbz")
    conv = Converter(
        input_pdf=inp,
        output_cbz=out,
        dpi=args.dpi,
        fmt=args.format,
        quality=args.quality,
        threads=args.threads,
        poppler_path=args.poppler_path,
    )

    if args.analyse:
        conv.analyse()
    else:
        conv.convert()


if __name__ == "__main__":
    freeze_support()
    main()
