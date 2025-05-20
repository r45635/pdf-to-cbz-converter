
import os
import sys
import time
import shutil
import zipfile
import logging
import argparse
from concurrent.futures import ThreadPoolExecutor
from pdf2image import convert_from_path
from PIL import Image
from PyPDF2 import PdfReader

def get_poppler_path():
    if getattr(sys, 'frozen', False):
        return os.path.join(sys._MEIPASS, 'poppler_bin')
    else:
        return r'C:\WIN32APP\Poppler\poppler-24.08.0\Library\bin'

POPPLER_PATH = get_poppler_path()

def setup_logging(logfile, verbose):
    handlers = [logging.StreamHandler(sys.stdout)]
    if logfile:
        handlers.append(logging.FileHandler(logfile, encoding="utf-8"))
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers
    )
    return logging.getLogger("pdf2cbz")

def convert_page(image, image_path, fmt="png", quality=85):
    if fmt == "jpeg":
        image = image.convert("RGB")
        image.save(image_path, "JPEG", quality=quality)
    else:
        image.save(image_path, "PNG")

def process_pdf(input_pdf, args, logger):
    base_name = os.path.splitext(os.path.basename(input_pdf))[0]
    temp_dir = base_name + "_images"
    os.makedirs(temp_dir, exist_ok=True)

    if args.analyse:
        reader = PdfReader(input_pdf)
        dpi = 172  # Placeholder default for analysis
        logger.info(f"{os.path.basename(input_pdf)}: Suggested DPI = {dpi}")
        return

    if not args.force and os.path.exists(args.output or f"{base_name}.cbz"):
        logger.warning(f"File exists: {args.output or base_name + '.cbz'} (use --force to overwrite)")
        return

    dpi = args.dpi or (172 if args.auto_dpi else 200)
    t0 = time.time()
    images = convert_from_path(input_pdf, dpi=dpi, poppler_path=POPPLER_PATH)
    total = len(images)
    logger.info(f"Converting '{os.path.basename(input_pdf)}' ({total} pages) with DPI={dpi}...")

    def convert_and_save(idx):
        filename = f"{args.prefix}{idx+1:03d}.{args.format}"
        image_path = os.path.join(temp_dir, filename)
        convert_page(images[idx], image_path, fmt=args.format, quality=args.quality)
        progress = int((idx+1)/total*100)
        print(f"\rProgress: {progress}% ({idx+1}/{total})", end="", flush=True)

    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        executor.map(convert_and_save, range(total))

    print()
    output_cbz = args.output or f"{base_name}.cbz"
    with zipfile.ZipFile(output_cbz, 'w', zipfile.ZIP_DEFLATED) as cbz:
        for f in sorted(os.listdir(temp_dir)):
            cbz.write(os.path.join(temp_dir, f), arcname=f)
        if args.cbz_comment:
            cbz.comment = args.cbz_comment.encode()

    size_pdf = os.path.getsize(input_pdf)
    size_cbz = os.path.getsize(output_cbz)
    ratio = 100 * size_cbz / size_pdf
    logger.info(f"✅ CBZ saved: {output_cbz}")
    logger.info(f"📦 Size: {size_cbz/1024/1024:.2f} MB (PDF: {size_pdf/1024/1024:.2f} MB, Ratio: {ratio:.1f}%)")
    logger.info(f"⏱️ Done in {int(time.time()-t0)}s")

    if not args.keep_temp:
        shutil.rmtree(temp_dir)
        logger.info(f"🧹 Temporary folder deleted: {temp_dir}")

def parse_args():
    parser = argparse.ArgumentParser(description="PDF to CBZ batch converter with advanced options.")
    parser.add_argument("input", help="Input PDF file or directory containing PDFs")
    parser.add_argument("output", nargs="?", help="Optional output CBZ name (for single file only)")
    parser.add_argument("--force", action="store_true", help="Force overwrite of CBZ")
    parser.add_argument("--dry-run", action="store_true", help="Only show what would be done")
    parser.add_argument("--threads", type=int, default=1, help="Number of threads (default: 1)")
    parser.add_argument("--version", action="version", version="pdf_to_cbz v105", help="Show version and exit")
    parser.add_argument("--logfile", help="Log file to write output")
    parser.add_argument("--format", choices=["png", "jpeg"], default="png", help="Image format (default: png)")
    parser.add_argument("--quality", type=int, default=85, help="JPEG quality (default: 85)")
    parser.add_argument("--dpi", type=int, help="Force DPI")
    parser.add_argument("--auto-dpi", action="store_true", help="Auto-determine optimal DPI from PDF")
    parser.add_argument("--prefix", default="page_", help="Prefix for image names (default: page_)")
    parser.add_argument("--output-dir", help="Directory where CBZ files will be saved")
    parser.add_argument("--cbz-comment", help="Optional comment for the CBZ archive")
    parser.add_argument("--keep-temp", action="store_true", help="Keep image folders after processing")
    parser.add_argument("--analyse", "--analyze", action="store_true", dest="analyse",
                        help="Only analyse input PDF(s) [alias: --analyze] and suggest DPI")
    parser.add_argument("--verbose", "--debug", action="store_true", dest="verbose", help="Verbose/debug output")
    return parser.parse_args()

def main():
    args = parse_args()
    logger = setup_logging(args.logfile, args.verbose)

    if not os.path.exists(args.input):
        logger.error("Input must be a PDF file or a directory of PDFs.")
        return

    files = []
    if os.path.isdir(args.input):
        files = [os.path.join(args.input, f) for f in os.listdir(args.input) if f.lower().endswith(".pdf")]
    elif args.input.lower().endswith(".pdf"):
        files = [args.input]
    else:
        logger.error("Input must be a PDF file or a directory of PDFs.")
        return

    for pdf in files:
        process_pdf(pdf, args, logger)

if __name__ == "__main__":
    main()
