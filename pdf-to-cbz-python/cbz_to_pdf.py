#!/usr/bin/env python3
"""
cbz_to_pdf.py

Convert a CBZ (ZIP of images) into a PDF file.
Supports CBZ, CBR (if rarfile available), CB7 (if py7zr available), and CBT formats.

This module provides both CLI and programmatic interfaces.
"""
import argparse
import io
import logging
import os
import sys
import zipfile
import tarfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable, Optional

from PIL import Image
from tqdm import tqdm

# Optional imports for additional archive formats
# Check for unar (macOS-friendly) or unrar for RAR support
import shutil
import subprocess
import tempfile

UNAR_AVAILABLE = shutil.which('unar') is not None
UNRAR_AVAILABLE = False
RARFILE_AVAILABLE = False
rarfile = None

# Only test unrar if unar is NOT available (avoid Gatekeeper popup on macOS)
if not UNAR_AVAILABLE:
    try:
        import rarfile
        # Test if unrar actually works (may be blocked by Gatekeeper on macOS)
        try:
            result = subprocess.run(['unrar'], capture_output=True, timeout=2)
            UNRAR_AVAILABLE = True
            RARFILE_AVAILABLE = True
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
            UNRAR_AVAILABLE = False
            RARFILE_AVAILABLE = False
    except ImportError:
        pass

# RAR support is available if either unar or unrar works
RAR_SUPPORT = UNAR_AVAILABLE or RARFILE_AVAILABLE

try:
    import py7zr
    PY7ZR_AVAILABLE = True
except ImportError:
    PY7ZR_AVAILABLE = False
    py7zr = None

# Try img2pdf for better quality PDF creation
try:
    import img2pdf
    IMG2PDF_AVAILABLE = True
except ImportError:
    IMG2PDF_AVAILABLE = False
    img2pdf = None


def setup_logging(logfile: Path | None = None, debug: bool = False):
    """Configure logging for the converter."""
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG if debug else (logging.INFO if logfile else logging.ERROR))
    fmt = logging.Formatter("%(asctime)s %(levelname)s: %(message)s", "%Y-%m-%d %H:%M:%S")
    ch.setFormatter(fmt)
    root.addHandler(ch)

    if logfile:
        fh = logging.FileHandler(str(logfile), mode="w", encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        root.addHandler(fh)

    root.setLevel(logging.DEBUG)
    if not logfile and not debug:
        logging.disable(logging.WARNING)
    else:
        logging.disable(logging.NOTSET)


def format_size(size_bytes: int) -> str:
    """Convert a size in bytes to a human-readable string."""
    size = float(size_bytes)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size < 1024.0:
            return f"{size:.2f} {unit}"
        size /= 1024.0
    return f"{size:.2f} PB"


def is_image_file(filename: str) -> bool:
    """Check if a filename has an image extension."""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    return ext in ('jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp')


def natural_sort_key(s: str) -> list:
    """
    Generate a key for natural sorting (handles numbers in filenames).
    e.g., page_2.jpg < page_10.jpg
    """
    import re
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split(r'(\d+)', s)]


class CBZConverter:
    """
    Convert comic book archives (CBZ, CBR, CB7, CBT) to PDF.
    """

    SUPPORTED_EXTENSIONS = {'.cbz', '.cbr', '.cb7', '.cbt'}

    def __init__(
        self,
        input_path: Path,
        output_pdf: Path,
        quality: int = 85,
        use_img2pdf: bool = True,
        threads: int = 1,
    ):
        """
        Initialize the converter.

        Args:
            input_path: Path to the input comic book archive
            output_pdf: Path for the output PDF file
            quality: JPEG quality for images (1-100), used when img2pdf not available
            use_img2pdf: Whether to use img2pdf library (preserves original quality)
            threads: Number of threads for parallel processing
        """
        self.input_path = input_path
        self.output_pdf = output_pdf
        self.quality = quality
        self.use_img2pdf = use_img2pdf and IMG2PDF_AVAILABLE
        self.threads = threads

        # Validate input file
        if not input_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")

        ext = input_path.suffix.lower()
        if ext not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported format: {ext}. Supported: {self.SUPPORTED_EXTENSIONS}")

        # Check for required libraries for specific formats
        # Note: CBR files might actually be ZIP archives, so we check the format first
        if ext == '.cbr' and not RAR_SUPPORT:
            # Check if it's actually a ZIP file
            actual_format = self._detect_format_static(input_path)
            if actual_format != 'zip':
                raise ImportError("No RAR support. Install unar (brew install unar) or unrar.")
        if ext == '.cb7' and not PY7ZR_AVAILABLE:
            raise ImportError("py7zr library required for CB7 files. Install with: pip install py7zr")

    @staticmethod
    def _detect_format_static(path: Path) -> str:
        """Static method to detect archive format before full initialization."""
        with open(path, 'rb') as f:
            header = f.read(16)
        if header[:4] == b'PK\x03\x04' or header[:4] == b'PK\x05\x06':
            return 'zip'
        if header[:6] == b'Rar!\x1a\x07':
            return 'rar'
        return 'unknown'

    def _detect_archive_format(self) -> str:
        """
        Detect the actual archive format by reading file signatures.
        Some .cbr files are actually ZIP archives.

        Returns:
            Detected format: 'zip', 'rar', '7z', 'tar', or 'unknown'
        """
        with open(self.input_path, 'rb') as f:
            header = f.read(16)

        # ZIP signature: PK (0x504B0304)
        if header[:4] == b'PK\x03\x04' or header[:4] == b'PK\x05\x06':
            return 'zip'

        # RAR signature: Rar! (0x526172211A07)
        if header[:6] == b'Rar!\x1a\x07':
            return 'rar'

        # 7z signature: 7z (0x377ABCAF271C)
        if header[:6] == b'7z\xbc\xaf\x27\x1c':
            return '7z'

        # TAR signatures vary, check for common patterns
        # POSIX tar has "ustar" at offset 257
        with open(self.input_path, 'rb') as f:
            f.seek(257)
            tar_magic = f.read(5)
            if tar_magic == b'ustar':
                return 'tar'

        return 'unknown'

    def _get_archive_images(self) -> list[tuple[str, bytes]]:
        """
        Extract images from the archive and return them sorted.

        Returns:
            List of tuples (filename, image_bytes) sorted by filename
        """
        ext = self.input_path.suffix.lower()
        images = []

        # Detect actual format (some .cbr files are actually ZIPs)
        actual_format = self._detect_archive_format()
        logging.info(f"File extension: {ext}, detected format: {actual_format}")

        if ext == '.cbz':
            images = self._extract_from_zip()
        elif ext == '.cbr':
            # Try to use detected format if extension says CBR
            if actual_format == 'zip':
                logging.info("CBR file is actually a ZIP archive, using ZIP extractor")
                images = self._extract_from_zip()
            elif actual_format == 'rar':
                images = self._extract_from_rar()
            else:
                # Try RAR first, fall back to ZIP
                try:
                    images = self._extract_from_rar()
                except Exception as e:
                    logging.warning(f"RAR extraction failed: {e}, trying as ZIP")
                    try:
                        images = self._extract_from_zip()
                    except Exception as e2:
                        raise ValueError(f"Cannot open CBR file as RAR or ZIP: {e2}")
        elif ext == '.cb7':
            images = self._extract_from_7z()
        elif ext == '.cbt':
            images = self._extract_from_tar()

        # Sort images naturally (page_2 before page_10)
        images.sort(key=lambda x: natural_sort_key(x[0]))

        logging.info(f"Found {len(images)} images in archive")
        return images

    def _extract_from_zip(self) -> list[tuple[str, bytes]]:
        """Extract images from ZIP/CBZ archive."""
        images = []
        with zipfile.ZipFile(self.input_path, 'r') as zf:
            for name in zf.namelist():
                if is_image_file(name) and not name.startswith('__MACOSX'):
                    try:
                        data = zf.read(name)
                        images.append((name, data))
                    except Exception as e:
                        logging.warning(f"Failed to read {name}: {e}")
        return images

    def _extract_from_rar(self) -> list[tuple[str, bytes]]:
        """Extract images from RAR/CBR archive using unar or rarfile."""
        if not RAR_SUPPORT:
            raise ImportError("No RAR support available. Install unar (brew install unar) or unrar.")

        images = []

        # Prefer unar on macOS (no Gatekeeper issues)
        if UNAR_AVAILABLE:
            return self._extract_from_rar_unar()

        # Fall back to rarfile if unrar works
        if RARFILE_AVAILABLE:
            with rarfile.RarFile(self.input_path, 'r') as rf:
                for name in rf.namelist():
                    if is_image_file(name):
                        try:
                            data = rf.read(name)
                            images.append((name, data))
                        except Exception as e:
                            logging.warning(f"Failed to read {name}: {e}")
        return images

    def _extract_from_rar_unar(self) -> list[tuple[str, bytes]]:
        """Extract images from RAR using unar command."""
        images = []
        with tempfile.TemporaryDirectory() as tmpdir:
            # Extract RAR to temp directory using unar
            result = subprocess.run(
                ['unar', '-o', tmpdir, '-q', str(self.input_path)],
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                raise RuntimeError(f"unar extraction failed: {result.stderr}")

            # Find all extracted files (unar creates a subdirectory)
            for root, dirs, files in os.walk(tmpdir):
                for filename in files:
                    if is_image_file(filename):
                        filepath = os.path.join(root, filename)
                        try:
                            with open(filepath, 'rb') as f:
                                data = f.read()
                            images.append((filename, data))
                        except Exception as e:
                            logging.warning(f"Failed to read {filename}: {e}")
        return images

    def _extract_from_7z(self) -> list[tuple[str, bytes]]:
        """Extract images from 7-Zip/CB7 archive."""
        if not PY7ZR_AVAILABLE:
            raise ImportError("py7zr library not available")

        images = []
        with py7zr.SevenZipFile(self.input_path, 'r') as szf:
            # Read all files into memory
            all_files = szf.readall()
            for name, bio in all_files.items():
                if is_image_file(name):
                    try:
                        data = bio.read()
                        images.append((name, data))
                    except Exception as e:
                        logging.warning(f"Failed to read {name}: {e}")
        return images

    def _extract_from_tar(self) -> list[tuple[str, bytes]]:
        """Extract images from TAR/CBT archive."""
        images = []
        with tarfile.open(self.input_path, 'r:*') as tf:
            for member in tf.getmembers():
                if member.isfile() and is_image_file(member.name):
                    try:
                        f = tf.extractfile(member)
                        if f:
                            data = f.read()
                            images.append((member.name, data))
                    except Exception as e:
                        logging.warning(f"Failed to read {member.name}: {e}")
        return images

    def _convert_to_jpeg_if_needed(self, image_data: bytes, filename: str) -> bytes:
        """
        Convert image to JPEG if it's not already JPEG/PNG.
        img2pdf only supports JPEG, PNG, and some other formats.

        Args:
            image_data: Raw image bytes
            filename: Original filename for logging

        Returns:
            Image bytes (possibly converted to JPEG)
        """
        try:
            img = Image.open(io.BytesIO(image_data))

            # img2pdf supports JPEG, PNG, TIFF directly
            if img.format in ('JPEG', 'PNG', 'TIFF'):
                return image_data

            # Convert other formats to JPEG
            logging.debug(f"Converting {filename} from {img.format} to JPEG")
            if img.mode in ('RGBA', 'LA', 'P'):
                # Convert transparent images to RGB with white background
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            buf = io.BytesIO()
            img.save(buf, format='JPEG', quality=self.quality)
            return buf.getvalue()

        except Exception as e:
            logging.error(f"Failed to process image {filename}: {e}")
            raise

    def _create_pdf_with_img2pdf(self, images: list[tuple[str, bytes]],
                                  progress_callback: Optional[Callable[[int, int], None]] = None) -> None:
        """
        Create PDF using img2pdf library (preserves original image quality).

        Args:
            images: List of (filename, image_bytes) tuples
            progress_callback: Optional callback for progress updates
        """
        logging.info("Creating PDF with img2pdf (lossless for JPEG/PNG)")

        total = len(images)
        processed_images = []

        # Process images (convert if needed)
        for i, (name, data) in enumerate(images):
            try:
                processed_data = self._convert_to_jpeg_if_needed(data, name)
                processed_images.append(processed_data)
            except Exception as e:
                logging.error(f"Skipping {name}: {e}")
                continue

            if progress_callback:
                progress_callback(i + 1, total)

        if not processed_images:
            raise ValueError("No valid images found in archive")

        # Create PDF
        self.output_pdf.parent.mkdir(parents=True, exist_ok=True)

        with open(self.output_pdf, 'wb') as f:
            f.write(img2pdf.convert(processed_images))

        logging.info(f"Created PDF: {self.output_pdf}")

    def _create_pdf_with_pillow(self, images: list[tuple[str, bytes]],
                                 progress_callback: Optional[Callable[[int, int], None]] = None) -> None:
        """
        Create PDF using Pillow (fallback method, may recompress images).

        Args:
            images: List of (filename, image_bytes) tuples
            progress_callback: Optional callback for progress updates
        """
        logging.info("Creating PDF with Pillow")

        total = len(images)
        pil_images = []

        for i, (name, data) in enumerate(images):
            try:
                img = Image.open(io.BytesIO(data))

                # Convert to RGB if needed (PDF doesn't support all modes)
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    if img.mode in ('RGBA', 'LA'):
                        background.paste(img, mask=img.split()[-1])
                        img = background
                    else:
                        img = img.convert('RGB')
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                pil_images.append(img)

            except Exception as e:
                logging.error(f"Skipping {name}: {e}")
                continue

            if progress_callback:
                progress_callback(i + 1, total)

        if not pil_images:
            raise ValueError("No valid images found in archive")

        # Create PDF
        self.output_pdf.parent.mkdir(parents=True, exist_ok=True)

        first_image = pil_images[0]
        if len(pil_images) > 1:
            first_image.save(
                self.output_pdf,
                save_all=True,
                append_images=pil_images[1:],
                quality=self.quality
            )
        else:
            first_image.save(self.output_pdf, quality=self.quality)

        logging.info(f"Created PDF: {self.output_pdf}")

    def convert(self, progress_callback: Optional[Callable[[int, int], None]] = None) -> None:
        """
        Convert the comic book archive to PDF.

        Args:
            progress_callback: Optional callback function(completed, total) for progress updates
        """
        logging.info(f"Converting {self.input_path} to PDF")

        # Extract images from archive
        images = self._get_archive_images()

        if not images:
            raise ValueError(f"No images found in {self.input_path}")

        # Create PDF using appropriate method
        if self.use_img2pdf:
            self._create_pdf_with_img2pdf(images, progress_callback)
        else:
            self._create_pdf_with_pillow(images, progress_callback)

    def analyse(self) -> str:
        """
        Analyze the comic book archive and return information.

        Returns:
            Analysis report as a string
        """
        images = self._get_archive_images()

        if not images:
            return "No images found in archive."

        total_size = sum(len(data) for _, data in images)

        # Get dimensions of first image
        first_img = Image.open(io.BytesIO(images[0][1]))
        first_width, first_height = first_img.size
        first_format = first_img.format

        # Estimate PDF size (roughly similar to total image size)
        estimated_pdf_size = total_size

        lines = [
            f"Archive: {self.input_path.name}",
            f"Format: {self.input_path.suffix.upper()[1:]}",
            f"Number of pages: {len(images)}",
            f"Total images size: {format_size(total_size)}",
            f"",
            f"First page: {images[0][0]}",
            f"  Dimensions: {first_width} x {first_height} pixels",
            f"  Format: {first_format}",
            f"",
            f"Estimated PDF size: {format_size(estimated_pdf_size)}",
            f"",
            f"img2pdf available: {'Yes (recommended)' if IMG2PDF_AVAILABLE else 'No (using Pillow fallback)'}",
        ]

        # Check for additional format support
        if RAR_SUPPORT:
            if UNAR_AVAILABLE:
                lines.append("CBR support: Yes (unar)")
            elif RARFILE_AVAILABLE:
                lines.append("CBR support: Yes (rarfile)")
        if PY7ZR_AVAILABLE:
            lines.append("CB7 support: Yes (py7zr)")

        return "\n".join(lines)


def parse_args():
    """Parse command line arguments."""
    p = argparse.ArgumentParser(
        description="Convert comic book archives (CBZ, CBR, CB7, CBT) to PDF"
    )
    p.add_argument("input", type=Path, help="Input comic book archive file")
    p.add_argument(
        "-o", "--output", type=Path,
        help="Output PDF file (defaults to input.pdf)"
    )
    p.add_argument(
        "-q", "--quality", type=int, default=85,
        help="JPEG quality for image conversion (1-100, default: 85)"
    )
    p.add_argument(
        "--no-img2pdf", action="store_true",
        help="Don't use img2pdf even if available (uses Pillow instead)"
    )
    p.add_argument(
        "-t", "--threads", type=int, default=os.cpu_count() or 1,
        help="Number of worker threads"
    )
    p.add_argument(
        "-l", "--logfile", type=Path,
        help="Write logs to this file"
    )
    p.add_argument(
        "--analyse", action="store_true",
        help="Analyze archive and exit (no conversion)"
    )
    p.add_argument(
        "--debug", action="store_true",
        help="Enable debug logging"
    )
    return p.parse_args()


def main():
    """Main entry point for CLI usage."""
    args = parse_args()
    setup_logging(args.logfile, debug=args.debug)

    inp = args.input
    if not inp.exists():
        logging.error(f"Input file not found: {inp}")
        sys.exit(1)

    out = args.output or inp.with_suffix(".pdf")

    try:
        converter = CBZConverter(
            input_path=inp,
            output_pdf=out,
            quality=args.quality,
            use_img2pdf=not args.no_img2pdf,
            threads=args.threads,
        )

        if args.analyse:
            print(converter.analyse())
        else:
            # Use tqdm for progress in CLI mode
            def progress_cb(completed, total):
                pass  # tqdm handles this

            with tqdm(total=100, desc="Converting") as pbar:
                def update_progress(completed, total):
                    pbar.n = int(completed / total * 100)
                    pbar.refresh()

                converter.convert(progress_callback=update_progress)

            print(f"\nCreated: {out}")
            print(f"Size: {format_size(out.stat().st_size)}")

    except Exception as e:
        logging.error(f"Conversion failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
