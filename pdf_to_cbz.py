#!/usr/bin/env python3
# pdf_to_cbz v1.0.0 - Build 20240518

import os
import sys
import time
import zipfile
import argparse
import shutil
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from pdf2image import convert_from_path, pdfinfo_from_path
from PIL import Image
import subprocess

POPPLER_PATH = r"C:\WIN32APP\Poppler\poppler-24.08.0\Library\bin"
PDFIMAGES_EXE = os.path.join(POPPLER_PATH, "pdfimages.exe")

def print_version():
    print("pdf_to_cbz v1.0.0 - Build 20240518")

def setup_logging(logfile, verbose):
    log_level = logging.DEBUG if verbose else logging.INFO
    handlers = [logging.StreamHandler(sys.stdout)] if not logfile else [logging.FileHandler(logfile, encoding='utf-8')]
    logging.basicConfig(level=log_level, format='%(asctime)s [%(levelname)s] %(message)s', handlers=handlers)
    return logging.getLogger()
    return logging.getLogger()

def parse_arguments():
    parser = argparse.ArgumentParser(description="PDF to CBZ batch converter with advanced options.", formatter_class=argparse.RawTextHelpFormatter)

    # 🎛️ Options générales
    parser.add_argument("input", help="Input PDF file or directory containing PDFs")
    parser.add_argument("output", nargs="?", help="Optional output CBZ name (for single file only)")
    parser.add_argument("--force", action="store_true", help="Force overwrite of CBZ")
    parser.add_argument("--dry-run", action="store_true", help="Only show what would be done")
    parser.add_argument("--threads", type=int, default=1, help="Number of threads (default: 1)")
    parser.add_argument("--version", action="store_true", help="Show version and exit")
    parser.add_argument("--logfile", help="Log file to write output")

    # 🖼️ Images & qualité
    parser.add_argument("--format", choices=["png", "jpeg"], default="png", help="Image format (default: png)")
    parser.add_argument("--quality", type=int, default=85, help="JPEG quality (default: 85)")
    parser.add_argument("--dpi", type=int, help="Force DPI")
    parser.add_argument("--auto-dpi", action="store_true", help="Auto-determine optimal DPI from PDF")
    parser.add_argument("--prefix", default="page_", help="Prefix for image names (default: page_)")

    # 🗃️ Sortie CBZ
    parser.add_argument("--output-dir", help="Directory where CBZ files will be saved")
    parser.add_argument("--cbz-comment", help="Optional comment for the CBZ archive")
    parser.add_argument("--keep-temp", action="store_true", help="Keep image folders after processing")

    # 🧪 Diagnostic
    parser.add_argument("--analyse", action="store_true", help="Only analyse input PDF(s) [alias: --analyze] and suggest DPI")
    parser.add_argument("--analyze", dest="analyse", action="store_true", help=argparse.SUPPRESS)

    # 🧰 Avancé
    parser.add_argument("--verbose", "--debug", dest="verbose", action="store_true", help="Verbose/debug output")

    return parser.parse_args()

def suggest_dpi_from_pdf(pdf_path):
    try:
        result = subprocess.run(
            [PDFIMAGES_EXE, "-list", pdf_path],
            capture_output=True, text=True, check=True
        )
        lines = result.stdout.strip().splitlines()
        dpi_values = []
        for line in lines[2:]:
            parts = line.split()
            if len(parts) >= 12:
                try:
                    x_ppi = int(parts[10])
                    y_ppi = int(parts[11])
                    dpi_values.append((x_ppi + y_ppi) // 2)
                except ValueError:
                    continue
        if not dpi_values:
            return 300
        return sum(dpi_values) // len(dpi_values)
    except Exception:
        return 300

def process_pdf(pdf_path, args, logger):
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    output_cbz = args.output or f"{base_name}.cbz"
    if args.output_dir:
        os.makedirs(args.output_dir, exist_ok=True)
        output_cbz = os.path.join(args.output_dir, os.path.basename(output_cbz))

    if args.analyse:
        dpi = suggest_dpi_from_pdf(pdf_path)
        logger.info(f"{pdf_path}: Suggested DPI = {dpi}")
        return
    if os.path.exists(output_cbz) and not args.force:
        logger.warning(f"File exists: {output_cbz} (use --force to overwrite)")
        return

        logger.info(f"{pdf_path}: Suggested DPI = {dpi}")
        return

    dpi = args.dpi or (suggest_dpi_from_pdf(pdf_path) if args.auto_dpi else 200)
    temp_dir = f"{base_name}_images"
    os.makedirs(temp_dir, exist_ok=True)

    if args.dry_run:
        logger.info(f"[DRY RUN] Would convert '{pdf_path}' with DPI={dpi}, format={args.format}, quality={args.quality}")
        return

    try:
        info = pdfinfo_from_path(pdf_path, poppler_path=POPPLER_PATH)
        total_pages = info['Pages']
    except Exception as e:
        logger.error(f"Cannot read PDF info: {e}")
        return

    start_time = time.time()
    image_paths = []

    def convert_page(i):
        try:
            images = convert_from_path(pdf_path, first_page=i, last_page=i, dpi=dpi, poppler_path=POPPLER_PATH)
            img_name = f"{args.prefix}{i:03d}.{ 'jpg' if args.format == 'jpeg' else 'png' }"
            img_path = os.path.join(temp_dir, img_name)
            if args.format == "jpeg":
                images[0].save(img_path, "JPEG", quality=args.quality)
            else:
                images[0].save(img_path, "PNG")
            return img_path
        except Exception as e:
            logger.error(f"Page {i}: {e}")
            return None

    logger.info(f"Converting '{pdf_path}' ({total_pages} pages) with DPI={dpi}...")
    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        futures = [executor.submit(convert_page, i) for i in range(1, total_pages + 1)]
        for idx, future in enumerate(futures, 1):
            result = future.result()
            if result:
                image_paths.append(result)
            progress = int((idx / total_pages) * 100)
            sys.stdout.write(f"\rProgress: {progress}% ({idx}/{total_pages})")
            sys.stdout.flush()
    print()

    logger.info("Creating CBZ archive...")
    with zipfile.ZipFile(output_cbz, 'w') as cbz:
        if args.cbz_comment:
            cbz.comment = args.cbz_comment.encode("utf-8")
        for img_path in image_paths:
            cbz.write(img_path, os.path.basename(img_path))

    size_cbz = os.path.getsize(output_cbz)
    size_pdf = os.path.getsize(pdf_path)
    ratio = 100.0 * size_cbz / size_pdf if size_pdf > 0 else 0

    logger.info(f"✅ CBZ saved: {output_cbz}")
    logger.info(f"📦 Size: {size_cbz/1024/1024:.2f} MB (PDF: {size_pdf/1024/1024:.2f} MB, Ratio: {ratio:.1f}%)")

    if not args.keep_temp:
        shutil.rmtree(temp_dir)
        logger.info(f"🧹 Temporary folder deleted: {temp_dir}")

    duration = time.time() - start_time
    logger.info(f"⏱️ Done in {int(duration // 60)}m {int(duration % 60)}s")

def main():
    args = parse_arguments()
    if args.version:
        print_version()
        return

    logger = setup_logging(args.logfile, args.verbose)

    input_files = []
    if os.path.isdir(args.input):
        input_files = [os.path.join(args.input, f) for f in os.listdir(args.input) if f.lower().endswith(".pdf")]
    elif os.path.isfile(args.input) and args.input.lower().endswith(".pdf"):
        input_files = [args.input]
    else:
        logger.error("Input must be a PDF file or a directory of PDFs.")
        return

    for pdf in input_files:
        process_pdf(pdf, args, logger)

if __name__ == "__main__":
    main()
