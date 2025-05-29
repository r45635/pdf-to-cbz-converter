#!/usr/bin/env python3
"""
Efficient PDF to CBZ converter leveraging Poppler CLI, multiprocessing, and in-memory zipping.
"""
import argparse
import logging
import subprocess
import sys
import zipfile
import tempfile
import shutil
import statistics
from multiprocessing import freeze_support
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import PyPDF2
from tqdm import tqdm


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


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
        self.tempdir: Path | None = None

    def calculate_clarity_dpi(self, target_width_px: int = 2000) -> int:
        """
        Estimate DPI for clarity based on the first page width.
        """
        reader = PyPDF2.PdfReader(str(self.input_pdf))
        first = reader.pages[0]
        width_pt = float(first.mediabox.width)
        clarity_dpi = int(target_width_px / width_pt * 72)
        logging.info(
            f"Calculated clarity DPI: {clarity_dpi} "
            f"(target width {target_width_px}px, page width {width_pt:.1f}pt)"
        )
        return clarity_dpi

    def recommend_dpi_for_size(self, target_width_px: int = 2000) -> int:
        """
        Recommend a DPI to match the original PDF's file size via iterative sampling.
        Uses binary search over DPI values, sampling first/middle/last pages.
        """
        reader = PyPDF2.PdfReader(str(self.input_pdf))
        total_pages = len(reader.pages)
        indices = [1] if total_pages < 3 else [1, total_pages // 2, total_pages]
        orig_size = self.input_pdf.stat().st_size

        def estimate_size(dpi_val: int) -> float:
            sample_temp = Path(tempfile.mkdtemp(prefix="pdf2cbz_sample_"))
            try:
                self.tempdir = sample_temp
                self.dpi = dpi_val
                sizes = []
                for pg in indices:
                    data, _ = self.process_page(pg)
                    sizes.append(len(data))
                avg = statistics.mean(sizes)
                return avg * total_pages
            finally:
                shutil.rmtree(sample_temp, ignore_errors=True)

        clarity_dpi = self.calculate_clarity_dpi(target_width_px)
        low = clarity_dpi
        est_low = estimate_size(low)
        high = low
        est_high = est_low
        while est_high < orig_size and high <= 5000:
            high *= 2
            est_high = estimate_size(high)
        while high - low > 1:
            mid = (low + high) // 2
            if estimate_size(mid) < orig_size:
                low = mid
            else:
                high = mid
        final_est = estimate_size(high)
        logging.info(
            f"Size-matching DPI determined: {high} "
            f"(estimated {final_est/1024/1024:.1f}MB vs "
            f"original {orig_size/1024/1024:.1f}MB)"
        )
        return high

    def analyze_dpi(self, target_width_px: int = 2000) -> None:
        """
        Detailed PDF analysis: media box widths, clarity DPI, size recommendation,
        and embedded image DPI statistics.
        """
        reader = PyPDF2.PdfReader(str(self.input_pdf))
        widths = [float(p.mediabox.width) for p in reader.pages]
        count = len(widths)
        print(f"PDF Analysis for '{self.input_pdf.name}': {count} pages")
        print(
            f"Page widths (pt): min {min(widths):.1f}, "
            f"max {max(widths):.1f}, avg {statistics.mean(widths):.1f}"
        )
        clarity = self.calculate_clarity_dpi(target_width_px)
        print(f"Clarity-based DPI: {clarity}")
        size_based = self.recommend_dpi_for_size(target_width_px)
        print(f"Size-based DPI: {size_based}")

        dpi_w_vals, dpi_h_vals = [], []
        for page in reader.pages:
            resources = page.get('/Resources') or {}
            xobjects = resources.get('/XObject') or {}
            for xobj in xobjects.values():
                try:
                    obj = xobj.get_object()
                except Exception:
                    continue
                if obj.get('/Subtype') == '/Image':
                    pw = obj.get('/Width'); ph = obj.get('/Height')
                    if pw and ph:
                        mw = float(page.mediabox.width)
                        mh = float(page.mediabox.height)
                        dpi_w_vals.append(pw / (mw / 72))
                        dpi_h_vals.append(ph / (mh / 72))
        if dpi_w_vals:
            print(
                f"Embedded DPI W: min {min(dpi_w_vals):.1f}, "
                f"max {max(dpi_w_vals):.1f}, avg {statistics.mean(dpi_w_vals):.1f}"
            )
            print(
                f"Embedded DPI H: min {min(dpi_h_vals):.1f}, "
                f"max {max(dpi_h_vals):.1f}, avg {statistics.mean(dpi_h_vals):.1f}"
            )
        else:
            print("No embedded images for DPI stats.")

    def process_page(self, page: int) -> tuple[bytes, str]:
        base = self.input_pdf.stem
        ext = 'jpg' if self.fmt == 'jpeg' else 'png'
        assert self.tempdir, "Temp directory not initialized"
        prefix = self.tempdir / f"{base}_{page:03d}"
        binary = (
            str(self.poppler_path / 'pdftocairo') if self.poppler_path else 'pdftocairo'
        )
        cmd = [
            binary, '-f', str(page), '-l', str(page),
            f'-{self.fmt}', '-r', str(self.dpi),
            str(self.input_pdf), str(prefix),
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        pattern = f"{prefix.name}-*.{ext}"
        files = list(self.tempdir.glob(pattern))
        if not files:
            raise FileNotFoundError(f"No image for page {page}")
        data = files[0].read_bytes()
        files[0].unlink()
        return data, f"{base}_{page:03d}.{self.fmt}"

    def convert(self) -> None:
        reader = PyPDF2.PdfReader(str(self.input_pdf))
        total = len(reader.pages)
        if not self.dpi:
            self.dpi = self.recommend_dpi_for_size()
        self.output_cbz.parent.mkdir(parents=True, exist_ok=True)
        self.tempdir = Path(tempfile.mkdtemp(prefix=f"pdf2cbz_{self.input_pdf.stem}_"))
        with ProcessPoolExecutor(max_workers=self.threads) as executor:
            futures = [executor.submit(self.process_page, i) for i in range(1, total+1)]
            with zipfile.ZipFile(self.output_cbz, 'w') as zf:
                for fut in tqdm(as_completed(futures), total=total, desc='Converting'):
                    try:
                        img, name = fut.result()
                        zf.writestr(name, img)
                    except Exception:
                        continue
        shutil.rmtree(self.tempdir, ignore_errors=True)
        logging.info(f"Created CBZ: {self.output_cbz}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='PDF→CBZ converter with size-matching DPI.'
    )
    parser.add_argument('input', type=Path, help='Input PDF path')
    parser.add_argument('-o', '--output', type=Path, help='Output CBZ path')
    parser.add_argument('--output-dir', type=Path, help='Directory for CBZ')
    parser.add_argument('-d', '--dpi', type=int, help='Override DPI')
    parser.add_argument('-f', '--format', choices=['jpeg', 'png'], default='jpeg')
    parser.add_argument('-q', '--quality', type=int, default=75)
    parser.add_argument('-t', '--threads', type=int, default=4)
    parser.add_argument('--poppler-path', type=Path)
    parser.add_argument('--analyse', action='store_true')
    return parser.parse_args()


def main():
    setup_logging()
    args = parse_args()
    if not args.input.is_file():
        logging.error(f"Input not found: {args.input}")
        sys.exit(1)
    out = args.output or args.input.with_suffix('.cbz')
    if args.output_dir:
        args.output_dir.mkdir(exist_ok=True)
        out = args.output_dir / out.name
    conv = Converter(
        input_pdf=args.input,
        output_cbz=out,
        dpi=args.dpi,
        fmt=args.format,
        quality=args.quality,
        threads=args.threads,
        poppler_path=args.poppler_path,
    )
    if args.analyse:
        conv.analyze_dpi()
        sys.exit(0)
    conv.convert()


if __name__ == '__main__':
    freeze_support()
    main()
