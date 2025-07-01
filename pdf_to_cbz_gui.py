#!/usr/bin/env python3
"""
pdf_to_cbz_gui.py

Convert a PDF into a CBZ (ZIP of images) using Poppler’s pdftocairo for rasterization,
with a fallback to pdf2image, multiprocessing, and in-memory zipping.

Supports both CLI and GUI modes. If run with arguments, operates as a CLI tool
(similar to pdf_to_cbz.py). If run without arguments, launches a Tkinter-based GUI
allowing users to configure options, choose files via dialogs, and track progress
with a graphical progress bar. In GUI “Analyse only” mode (or via “Compute Analysis”), it shows:
  - Actual input PDF file size
  - Recommended DPI based on page width
  - Estimated per-page image size at recommended DPI
  - Projected total CBZ size at recommended DPI

Additionally, you can compu    if inp.suffix.lower() != ".pdf":
        logging.error("Input file is not a PDF: %s", inp)
        sys.exit(1)these analysis metrics at any time via the "Compute Analysis" button before running.
"""
import argparse
import io
import logging
import os
import subprocess
import sys
import tempfile
import threading
import zipfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
from PIL import Image, ImageTk, ImageDraw
from PyPDF2 import PdfReader
from pdf2image import convert_from_path

# Import our custom modules
try:
    from config_manager import ConfigManager
    from hints import print_usage_hints, print_dpi_recommendations, print_format_recommendations
except ImportError:
    # Fallback if modules aren't available
    ConfigManager = None


def setup_logging(logfile: Path | None = None, debug: bool = False):
    """
    Configure logging:
      - No logfile: suppress WARNING and below, show only ERROR+ in console.
      - With logfile: write DEBUG+ to file and INFO+ to console.
      - With debug: set all handlers to DEBUG level.
    """
    root = logging.getLogger()
    # Clear existing handlers
    for handler in list(root.handlers):
        root.removeHandler(handler)

    # Console handler
    ch = logging.StreamHandler(sys.stdout)
    # If debug is on, we want to see everything on the console.
    ch.setLevel(logging.DEBUG if debug else (logging.INFO if logfile else logging.ERROR))
    fmt = logging.Formatter("%(asctime)s %(levelname)s: %(message)s", "%Y-%m-%d %H:%M:%S")
    ch.setFormatter(fmt)
    root.addHandler(ch)

    # File handler if requested
    if logfile:
        fh = logging.FileHandler(str(logfile), mode="w", encoding="utf-8")
        fh.setLevel(logging.DEBUG) # Always log debug to file
        fh.setFormatter(fmt)
        root.addHandler(fh)

    # Global level
    root.setLevel(logging.DEBUG) # Always set root to debug

    # If no logfile and not in debug, disable WARNING and below globally
    if not logfile and not debug:
        logging.disable(logging.WARNING)
    else:
        logging.disable(logging.NOTSET)


def format_size(size_bytes: int) -> str:
    """
    Convert a size in bytes to a human-readable string.
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


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
        """
        Calculate a reasonable DPI.
        Aims for a target pixel width (e.g., 2000px) for clarity on high-res displays,
        but enforces a minimum DPI to prevent poor quality for very wide pages.
        """
        reader = PdfReader(str(self.input_pdf))
        if not reader.pages:
            logging.debug("No pages in PDF, returning default DPI 150.")
            return 150  # Default DPI if no pages

        first_page_width_pt = float(reader.pages[0].mediabox.width)
        if first_page_width_pt <= 0:
            logging.debug(f"Invalid page width ({first_page_width_pt}pt), returning default DPI 150.")
            return 150  # Default for invalid width

        # Constants
        TARGET_PIXEL_WIDTH = 2000
        MIN_DPI = 150

        # Page width in inches
        width_inches = first_page_width_pt / 72
        logging.debug(f"First page width: {first_page_width_pt:.2f}pt ({width_inches:.2f} inches)")

        # Calculate DPI based on a target pixel width
        calculated_dpi = int(TARGET_PIXEL_WIDTH / width_inches)
        logging.debug(f"Calculated DPI based on {TARGET_PIXEL_WIDTH}px target: {calculated_dpi}")

        # Enforce a minimum DPI for quality
        final_dpi = max(calculated_dpi, MIN_DPI)

        if final_dpi != calculated_dpi:
            logging.info(f"Calculated DPI ({calculated_dpi}) was below minimum. Using {final_dpi} DPI.")
        
        logging.info(f"Recommended DPI for {self.input_pdf.name}: {final_dpi}")
        return final_dpi

    def process_page(self, page_num: int) -> tuple[bytes, str]:
        ext = "jpg" if self.fmt == "jpeg" else "png"
        with tempfile.TemporaryDirectory(prefix="pdf2cbz_") as td:
            prefix = os.path.join(td, "page")
            poppler_exe = (
                (self.poppler_path / ("pdftocairo.exe" if os.name == "nt" else "pdftocairo"))
                if self.poppler_path else
                ("pdftocairo.exe" if os.name == "nt" else "pdftocairo")
            )
            cmd = [
                str(poppler_exe),
                f"-{self.fmt}", "-r", str(self.dpi),
                "-f", str(page_num), "-l", str(page_num),
                str(self.input_pdf), prefix,
            ]
            try:
                # On Windows, prevent subprocess from showing console windows
                startupinfo = None
                if os.name == 'nt':
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = subprocess.SW_HIDE
                
                proc = subprocess.run(
                    cmd, stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE, text=True, check=False,
                    startupinfo=startupinfo
                )
                if proc.returncode == 0:
                    single = os.path.join(td, f"page.{ext}")
                    if os.path.exists(single):
                        data = Path(single).read_bytes()
                        return data, f"{self.input_pdf.stem}_{page_num:03d}.{ext}"
                    multi = os.path.join(td, f"page-{page_num}.{ext}")
                    if os.path.exists(multi):
                        data = Path(multi).read_bytes()
                        return data, f"{self.input_pdf.stem}_{page_num:03d}.{ext}"
                logging.debug(
                    f"pdftocairo did not emit an image for page {page_num} "
                    f"(rc={proc.returncode}). stderr:\n{proc.stderr.strip()}\n"
                    "Falling back to pdf2image."
                )
            except FileNotFoundError:
                logging.debug(f"pdftocairo not found at {poppler_exe!r}, falling back")
            except Exception as e:
                logging.debug(f"pdftocairo crashed: {e}, falling back")

            try:
                images = convert_from_path(
                    str(self.input_pdf), dpi=self.dpi,
                    first_page=page_num, last_page=page_num,
                    fmt=self.fmt, single_file=False,
                    poppler_path=str(self.poppler_path) if self.poppler_path else None,
                )
                if images:
                    buf = io.BytesIO()
                    save_kwargs = {"quality": self.quality} if self.fmt == "jpeg" else {}
                    images[0].save(buf, format=self.fmt.upper(), **save_kwargs)
                    return buf.getvalue(), f"{self.input_pdf.stem}_{page_num:03d}.{ext}"
            except Exception as e:
                logging.error(f"pdf2image fallback failed on page {page_num}: {e}")
        raise FileNotFoundError(f"Unable to render page {page_num}")

    def convert(self, progress_callback=None) -> None:
        reader = PdfReader(str(self.input_pdf))
        total = len(reader.pages)
        if not self.dpi:
            self.dpi = self.calculate_clarity_dpi()
        self.output_cbz.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(self.output_cbz, "w") as zf, \
             ProcessPoolExecutor(max_workers=self.threads) as executor:
            futures = {executor.submit(self.process_page, i + 1): i + 1 for i in range(total)}
            completed = 0
            if progress_callback is None:
                # CLI mode: use tqdm
                from tqdm import tqdm
                for fut in tqdm(as_completed(futures), total=total, desc="Converting"):
                    page = futures[fut]
                    try:
                        img_bytes, name = fut.result()
                        zf.writestr(name, img_bytes)
                    except Exception as e:
                        logging.error(f"Failed to convert page {page}: {e}")
                logging.info(f"Created CBZ: {self.output_cbz}")
            else:
                # GUI mode: update progress_callback
                for fut in as_completed(futures):
                    page = futures[fut]
                    try:
                        img_bytes, name = fut.result()
                        zf.writestr(name, img_bytes)
                    except Exception as e:
                        logging.error(f"Failed to convert page {page}: {e}")
                    completed += 1
                    progress_callback(completed, total)
                logging.info(f"Created CBZ: {self.output_cbz}")

    def analyse(self) -> str:
        """
        Provides a detailed analysis of the PDF's page sizes and recommended DPI.
        """
        reader = PdfReader(str(self.input_pdf))
        if not reader.pages:
            return "PDF has no pages."

        widths_pt = [float(p.mediabox.width) for p in reader.pages]
        heights_pt = [float(p.mediabox.height) for p in reader.pages]
        avg_width_pt = sum(widths_pt) / len(widths_pt)
        avg_height_pt = sum(heights_pt) / len(heights_pt)
        
        # Use the same logic as the main DPI calculation function
        recommended_dpi = self.calculate_clarity_dpi()
        
        # Calculate expected dimensions with the recommended DPI
        first_page_width_in = widths_pt[0] / 72
        first_page_height_in = heights_pt[0] / 72
        expected_width_px = int(first_page_width_in * recommended_dpi)
        expected_height_px = int(first_page_height_in * recommended_dpi)

        lines = [
            f"Average page size: {avg_width_pt:.1f}pt x {avg_height_pt:.1f}pt",
            f'First page size: {widths_pt[0]:.1f}pt x {heights_pt[0]:.1f}pt ({first_page_width_in:.2f}" x {first_page_height_in:.2f}")',
            "",
            f"Recommended DPI: {recommended_dpi}",
            "This is based on balancing a target width of ~2000px with a minimum DPI of 150.",
            f"At {recommended_dpi} DPI, the first page will be approx. {expected_width_px} x {expected_height_px} pixels.",
        ]
        return "\n".join(lines)


def parse_args():
    p = argparse.ArgumentParser(description="Convert PDF to CBZ")
    p.add_argument("input", type=Path, help="Input PDF file")
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
    p.add_argument(
        "--debug", action="store_true",
        help="Enable debug logging"
    )
    return p.parse_args()


class PDF2CBZGui:
    def __init__(self, root):
        self.root = root
        self.root.title("PDF → CBZ Converter")
        
        # Initialize configuration
        self.config_manager = ConfigManager() if ConfigManager else None
        self.load_config_values()
        
        self.create_widgets()
    
    def load_config_values(self):
        """Load default values from configuration."""
        if self.config_manager:
            self.default_dpi = self.config_manager.get('dpi', '')
            self.default_format = self.config_manager.get('format', 'jpeg')
            self.default_quality = self.config_manager.get('quality', 85)
            self.default_threads = self.config_manager.get('threads', os.cpu_count() or 1)
            self.default_poppler_path = self.config_manager.get('poppler_path', '')
            self.default_output_dir = self.config_manager.get('output_directory', '')
        else:
            # Fallback defaults
            self.default_dpi = ''
            self.default_format = 'jpeg'
            self.default_quality = 85
            self.default_threads = os.cpu_count() or 1
            self.default_poppler_path = ''
            self.default_output_dir = ''

    def create_widgets(self):
        pad = {"padx": 5, "pady": 5}

        # Input PDF
        tk.Label(self.root, text="Input PDF:").grid(row=0, column=0, sticky="e", **pad)
        self.input_var = tk.StringVar()
        tk.Entry(self.root, textvariable=self.input_var, width=50).grid(row=0, column=1, **pad)
        tk.Button(self.root, text="Browse...", command=self.browse_input).grid(row=0, column=2, **pad)

        # Output CBZ
        tk.Label(self.root, text="Output CBZ:").grid(row=1, column=0, sticky="e", **pad)
        self.output_var = tk.StringVar()
        tk.Entry(self.root, textvariable=self.output_var, width=50).grid(row=1, column=1, **pad)
        tk.Button(self.root, text="Browse...", command=self.browse_output).grid(row=1, column=2, **pad)

        # DPI
        tk.Label(self.root, text="DPI:").grid(row=2, column=0, sticky="e", **pad)
        self.dpi_var = tk.StringVar(value=str(self.default_dpi) if self.default_dpi else "")
        dpi_frame = tk.Frame(self.root)
        dpi_frame.grid(row=2, column=1, sticky="w", **pad)
        tk.Entry(dpi_frame, textvariable=self.dpi_var, width=10).pack(side=tk.LEFT)
        tk.Label(dpi_frame, text="(auto if empty)", font=("Arial", 8), fg="gray").pack(side=tk.LEFT, padx=5)

        # Format
        tk.Label(self.root, text="Format:").grid(row=3, column=0, sticky="e", **pad)
        self.format_var = tk.StringVar(value=self.default_format)
        format_frame = tk.Frame(self.root)
        format_frame.grid(row=3, column=1, sticky="w", **pad)
        tk.OptionMenu(format_frame, self.format_var, "jpeg", "png").pack(side=tk.LEFT)
        tk.Button(format_frame, text="?", command=self.show_format_help, width=2).pack(side=tk.LEFT, padx=5)

        # Quality
        tk.Label(self.root, text="JPEG Quality:").grid(row=4, column=0, sticky="e", **pad)
        self.quality_var = tk.StringVar(value=str(self.default_quality))
        quality_frame = tk.Frame(self.root)
        quality_frame.grid(row=4, column=1, sticky="w", **pad)
        tk.Entry(quality_frame, textvariable=self.quality_var, width=10).pack(side=tk.LEFT)
        tk.Scale(quality_frame, from_=10, to=100, orient=tk.HORIZONTAL, variable=self.quality_var, length=100).pack(side=tk.LEFT, padx=5)

        # Threads
        tk.Label(self.root, text="Threads:").grid(row=5, column=0, sticky="e", **pad)
        self.threads_var = tk.StringVar(value=str(self.default_threads))
        threads_frame = tk.Frame(self.root)
        threads_frame.grid(row=5, column=1, sticky="w", **pad)
        tk.Entry(threads_frame, textvariable=self.threads_var, width=10).pack(side=tk.LEFT)
        tk.Button(threads_frame, text="Auto", command=self.set_auto_threads, width=6).pack(side=tk.LEFT, padx=5)

        # Poppler Path
        tk.Label(self.root, text="Poppler Path:").grid(row=6, column=0, sticky="e", **pad)
        self.poppler_var = tk.StringVar()
        tk.Entry(self.root, textvariable=self.poppler_var, width=50).grid(row=6, column=1, **pad)
        tk.Button(self.root, text="Browse...", command=self.browse_poppler).grid(row=6, column=2, **pad)

        # Logfile
        tk.Label(self.root, text="Log File:").grid(row=7, column=0, sticky="e", **pad)
        self.logfile_var = tk.StringVar()
        tk.Entry(self.root, textvariable=self.logfile_var, width=50).grid(row=7, column=1, **pad)
        tk.Button(self.root, text="Browse...", command=self.browse_logfile).grid(row=7, column=2, **pad)

        # Analyse and Debug Checkboxes
        checkbox_frame = tk.Frame(self.root)
        checkbox_frame.grid(row=8, column=0, columnspan=2, sticky="w", **pad)
        self.analyse_var = tk.BooleanVar()
        tk.Checkbutton(checkbox_frame, text="Analyse only (no conversion)", variable=self.analyse_var).pack(side=tk.LEFT)
        self.debug_var = tk.BooleanVar()
        tk.Checkbutton(checkbox_frame, text="Debug Mode", variable=self.debug_var).pack(side=tk.LEFT, padx=10)
        
        tk.Button(self.root, text="Compute Analysis", command=self.compute_analysis).grid(row=8, column=2, sticky="w", **pad)

        # Progress Bar
        self.progress = ttk.Progressbar(self.root, orient="horizontal", length=400, mode="determinate")
        self.progress.grid(row=9, column=0, columnspan=3, **pad)

        # Output Text (for analysis results)
        self.text_area = scrolledtext.ScrolledText(self.root, width=60, height=15, state="disabled")
        self.text_area.grid(row=10, column=0, columnspan=3, rowspan=5, **pad)

        # Configuration and Help Buttons
        config_frame = tk.Frame(self.root)
        config_frame.grid(row=15, column=0, columnspan=3, pady=5)
        
        tk.Button(config_frame, text="Save Config", command=self.save_current_config).pack(side=tk.LEFT, padx=5)
        tk.Button(config_frame, text="Load Config", command=self.load_config_file).pack(side=tk.LEFT, padx=5)
        tk.Button(config_frame, text="Show Hints", command=self.show_hints).pack(side=tk.LEFT, padx=5)
        
        # Run and Quit Buttons
        button_frame = tk.Frame(self.root)
        button_frame.grid(row=16, column=0, columnspan=3, pady=10)
        
        tk.Button(button_frame, text="Run", command=self.start_process, bg="lightgreen", width=10).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Preview", command=self.open_preview_window).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="Quit", command=self.root.quit, width=10).pack(side=tk.LEFT, padx=5)

    def open_preview_window(self):
        """Opens a new window to preview conversion settings on a single page."""
        input_path = self.input_var.get().strip()
        if not input_path or not Path(input_path).is_file():
            messagebox.showerror("Error", "Please select a valid input PDF file first.")
            return

        try:
            reader = PdfReader(input_path)
            total_pages = len(reader.pages)
        except Exception as e:
            messagebox.showerror("Error", f"Could not read PDF: {e}")
            return

        # Initialize attributes to prevent errors before images are loaded
        self.full_res_original_pil = None
        self.full_res_converted_pil = None

        # Create the new window
        self.preview_window = tk.Toplevel(self.root)
        self.preview_window.title("Conversion Preview")
        self.preview_window.geometry("1000x700")
        
        # Bind close event to ask about applying settings
        self.preview_window.protocol("WM_DELETE_WINDOW", self._on_preview_window_close)

        # --- Controls Frame ---
        controls_frame = tk.Frame(self.preview_window, padx=10, pady=10)
        controls_frame.pack(fill=tk.X)

        # Page Selection
        tk.Label(controls_frame, text="Page:").pack(side=tk.LEFT, padx=(0, 5))
        self.preview_page_var = tk.StringVar(value="1")
        page_spinbox = tk.Spinbox(
            controls_frame, from_=1, to=total_pages,
            textvariable=self.preview_page_var, width=5,
            command=self._update_preview_images
        )
        page_spinbox.pack(side=tk.LEFT, padx=5)

        # DPI
        tk.Label(controls_frame, text="DPI:").pack(side=tk.LEFT, padx=(10, 5))
        self.preview_dpi_var = tk.StringVar(value=self.dpi_var.get() or "150")
        dpi_entry = tk.Entry(controls_frame, textvariable=self.preview_dpi_var, width=5)
        dpi_entry.pack(side=tk.LEFT, padx=5)
        dpi_entry.bind('<Return>', lambda e: self._update_preview_images())

        # Quality
        tk.Label(controls_frame, text="Quality:").pack(side=tk.LEFT, padx=(10, 5))
        self.preview_quality_var = tk.StringVar(value=self.quality_var.get() or "85")
        quality_scale = tk.Scale(
            controls_frame, from_=10, to=100, orient=tk.HORIZONTAL,
            variable=self.preview_quality_var, length=100,
            command=lambda x: self.preview_window.after_idle(self._update_preview_images)
        )
        quality_scale.pack(side=tk.LEFT, padx=5)

        # Update Button
        tk.Button(
            controls_frame, text="Update Preview",
            command=self._update_preview_images, bg="lightblue"
        ).pack(side=tk.LEFT, padx=10)
        
        # Apply Settings Button
        tk.Button(
            controls_frame, text="Apply Settings to Main",
            command=self._apply_preview_settings_to_main, bg="lightgreen"
        ).pack(side=tk.LEFT, padx=5)

        # Zoom controls
        self.zoom_enabled_var = tk.BooleanVar(value=True)
        tk.Checkbutton(
            controls_frame, text="Enable Zoom", variable=self.zoom_enabled_var
        ).pack(side=tk.LEFT, padx=10)
        
        # Zoom mode selection
        tk.Label(controls_frame, text="Zoom:").pack(side=tk.LEFT, padx=(10, 5))
        self.zoom_mode_var = tk.StringVar(value="Normal")
        zoom_mode_menu = tk.OptionMenu(controls_frame, self.zoom_mode_var, "Normal", "Puissant", "Ultra",
                                       command=lambda x: self._update_zoom_mode_display())
        zoom_mode_menu.pack(side=tk.LEFT, padx=5)
        tk.Button(controls_frame, text="?", command=self._show_zoom_help, width=2).pack(side=tk.LEFT, padx=2)


        # --- Image Frame ---
        self.image_frame = tk.Frame(self.preview_window)
        self.image_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(10, 5))  # Less bottom padding
        self.image_frame.grid_rowconfigure(2, weight=3)  # Main images get most weight
        self.image_frame.grid_rowconfigure(0, weight=0, minsize=140)  # Zoom areas reduced height
        self.image_frame.grid_columnconfigure(0, weight=1)
        self.image_frame.grid_columnconfigure(1, weight=1)

        # --- Fixed Zoom Areas (above each image) ---
        # Create zoom areas with fixed size to prevent automatic resizing - reduced height to save space
        # Use Frame containers with fixed pixel size to contain the zoom Labels
        self.zoom_frame_orig = tk.Frame(self.image_frame, width=280, height=140, bd=2, relief=tk.RIDGE, bg="white")
        self.zoom_frame_orig.grid_propagate(False)  # Prevent frame from resizing
        self.zoom_frame_orig.grid(row=0, column=0, pady=2, padx=5)
        
        self.zoom_frame_conv = tk.Frame(self.image_frame, width=280, height=140, bd=2, relief=tk.RIDGE, bg="white")
        self.zoom_frame_conv.grid_propagate(False)  # Prevent frame from resizing
        self.zoom_frame_conv.grid(row=0, column=1, pady=2, padx=5)
        
        # Create Labels inside the fixed-size frames
        self.zoom_lens_orig = tk.Label(self.zoom_frame_orig, bg="white", text="Original\nZoom\n(Normal)", anchor="center", font=("Arial", 8))
        self.zoom_lens_orig.pack(fill=tk.BOTH, expand=True)
        
        self.zoom_lens_conv = tk.Label(self.zoom_frame_conv, bg="white", text="Preview\nZoom\n(Normal)", anchor="center", font=("Arial", 8))
        self.zoom_lens_conv.pack(fill=tk.BOTH, expand=True)
        
        # Set the zoom row to have a reduced fixed height
        self.image_frame.grid_rowconfigure(0, weight=0, minsize=140)
        
        self.zoom_lens_orig_image = None # To hold the zoomed original image
        self.zoom_lens_conv_image = None # To hold the zoomed converted image

        tk.Label(self.image_frame, text="Original (Reference at 300 DPI)", font=("Arial", 10, "bold")).grid(row=1, column=0, pady=(3,1), sticky="s")
        tk.Label(self.image_frame, text="Preview", font=("Arial", 10, "bold")).grid(row=1, column=1, pady=(3,1), sticky="s")

        self.preview_original_label = tk.Label(self.image_frame, bg="gray90", text="Loading...")
        self.preview_original_label.grid(row=2, column=0, sticky="nsew", padx=5, pady=(0, 5))  # Add bottom padding
        self.preview_converted_label = tk.Label(self.image_frame, bg="gray90", text="Loading...")
        self.preview_converted_label.grid(row=2, column=1, sticky="nsew", padx=5, pady=(0, 5))  # Add bottom padding

        # Bind events for zoom only to the converted (preview) image
        self.preview_converted_label.bind("<Motion>", self._update_zoom_lens)
        self.preview_converted_label.bind("<Enter>", self._show_zoom_lens)
        self.preview_converted_label.bind("<Leave>", self._hide_zoom_lens)

        # Hide the lens if the mouse leaves the entire image frame
        self.image_frame.bind("<Leave>", self._hide_zoom_lens)

        # Bind window resize event to refresh image display
        self.preview_window.bind("<Configure>", self._on_window_resize)
        
        # Bind keyboard shortcuts for zoom modes
        self.preview_window.bind("<Key-1>", lambda e: self._set_zoom_mode("Normal"))
        self.preview_window.bind("<Key-2>", lambda e: self._set_zoom_mode("Puissant"))
        self.preview_window.bind("<Key-3>", lambda e: self._set_zoom_mode("Ultra"))
        self.preview_window.focus_set()  # Enable keyboard focus

        # --- Info Frame ---
        info_frame = tk.Frame(self.preview_window)
        info_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=(5, 0))  # Add padding above info
        
        self.preview_info_label = tk.Label(info_frame, text="Select options and click 'Update Preview'", 
                                         bd=1, relief=tk.SUNKEN, anchor=tk.W, height=2)  # Fixed height
        self.preview_info_label.pack(fill=tk.X, padx=5, pady=2)

        # Load initial images
        self.preview_window.after(100, self._update_preview_images) # Use after to ensure window is drawn
        # Force zoom areas to maintain fixed size
        self.preview_window.after(200, self._fix_zoom_area_size)

    def _fix_zoom_area_size(self):
        """Force zoom areas to maintain their fixed size."""
        if hasattr(self, 'zoom_frame_orig') and hasattr(self, 'zoom_frame_conv'):
            self.zoom_frame_orig.config(width=280, height=140)
            self.zoom_frame_conv.config(width=280, height=140)
            self.zoom_frame_orig.grid_propagate(False)
            self.zoom_frame_conv.grid_propagate(False)

    def _on_window_resize(self, event):
        """Handle window resize events with a delay to avoid excessive refreshing."""
        # Only handle resize events for the main preview window, not child widgets
        if event.widget == self.preview_window:
            # Cancel any pending refresh
            if hasattr(self, '_resize_after_id'):
                self.preview_window.after_cancel(self._resize_after_id)
            # Schedule a delayed refresh
            self._resize_after_id = self.preview_window.after(300, self._refresh_image_display)

    def _refresh_image_display(self):
        """Refresh the image display after a window resize."""
        # Only refresh if we have images and data available
        if (hasattr(self, 'full_res_original_pil') and hasattr(self, 'full_res_converted_pil') and
            self.full_res_original_pil and self.full_res_converted_pil and
            hasattr(self, '_last_file_size')):
            self._display_images(
                self.full_res_original_pil, 
                self.full_res_converted_pil, 
                self._last_file_size, 
                self._last_dpi, 
                self._last_quality
            )

    def _update_preview_images(self):
        """Renders and displays the original and converted preview images."""
        try:
            page_num = int(self.preview_page_var.get())
            dpi = int(self.preview_dpi_var.get())
            quality = int(self.preview_quality_var.get())
            input_path = self.input_var.get().strip()
            poppler_path_str = self.poppler_var.get().strip()
            poppler_path = Path(poppler_path_str) if poppler_path_str else None
            fmt = self.format_var.get()

            # Run rendering in a separate thread to keep the GUI responsive
            threading.Thread(
                target=self._render_and_load_images,
                args=(input_path, poppler_path, page_num, dpi, quality, fmt),
                daemon=True
            ).start()

        except (ValueError, TypeError) as e:
            self.preview_info_label.config(text=f"Error: Invalid input - {e}")
        except Exception as e:
            messagebox.showerror("Preview Error", f"An unexpected error occurred: {e}", parent=self.preview_window)

    def _render_and_load_images(self, input_path, poppler_path, page_num, dpi, quality, fmt):
        """The actual image rendering logic (to be run in a thread)."""
        try:
            # Render original (reference) image at a fixed high DPI
            original_pil = convert_from_path(
                input_path, dpi=300, first_page=page_num, last_page=page_num,
                poppler_path=str(poppler_path) if poppler_path else None
            )[0]

            # Render preview image with user settings
            converted_pil = convert_from_path(
                input_path, dpi=dpi, first_page=page_num, last_page=page_num,
                fmt=fmt, poppler_path=str(poppler_path) if poppler_path else None
            )[0]

            # Calculate file size
            buffer = io.BytesIO()
            save_kwargs = {"quality": quality} if fmt == "jpeg" else {}
            converted_pil.save(buffer, format=fmt.upper(), **save_kwargs)
            file_size = len(buffer.getvalue())
            
            # Update GUI on the main thread
            self.root.after(0, self._display_images, original_pil, converted_pil, file_size, dpi, quality)

        except Exception as e:
            logging.error(f"Error rendering preview: {e}")
            self.root.after(0, messagebox.showerror, "Render Error", f"Failed to render page: {e}", parent=self.preview_window)

    def _display_images(self, original_pil, converted_pil, file_size, dpi, quality):
        """Updates the image labels and info text (must run on main GUI thread)."""
        # Store full-res images for the zoom feature
        self.full_res_original_pil = original_pil
        self.full_res_converted_pil = converted_pil
        
        # Store last values for resize refresh
        self._last_file_size = file_size
        self._last_dpi = dpi
        self._last_quality = quality

        # Get available space for both labels
        orig_w, orig_h = self.preview_original_label.winfo_width(), self.preview_original_label.winfo_height()
        conv_w, conv_h = self.preview_converted_label.winfo_width(), self.preview_converted_label.winfo_height()

        # Avoid resizing to 1x1 on first load - use consistent dimensions
        if orig_w < 100 or conv_w < 100: 
            target_w = 480  # Slightly smaller to ensure info bar stays visible
        else:
            target_w = min(orig_w, conv_w)  # Use the smaller width to ensure both fit
            
        if orig_h < 100 or conv_h < 100: 
            target_h = 500  # Reduced height to leave space for info bar
        else:
            # Reserve space for info bar at bottom (approximately 40px)
            target_h = min(orig_h, conv_h) - 40  # Leave space for the info bar

        # Calculate proper aspect ratio scaling for both images to fit the same display size
        def scale_image_to_fit(img, target_w, target_h):
            img_w, img_h = img.size
            scale_w = target_w / img_w
            scale_h = target_h / img_h
            scale = min(scale_w, scale_h)  # Use the smaller scale to maintain aspect ratio
            new_w = int(img_w * scale)
            new_h = int(img_h * scale)
            return img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Scale both images to fit the same display dimensions
        scaled_original = scale_image_to_fit(original_pil, target_w, target_h)
        scaled_converted = scale_image_to_fit(converted_pil, target_w, target_h)

        # Keep a reference to the PhotoImage objects to prevent garbage collection
        self.original_img_tk = ImageTk.PhotoImage(scaled_original)
        self.converted_img_tk = ImageTk.PhotoImage(scaled_converted)

        self.preview_original_label.config(image=self.original_img_tk, text="")
        self.preview_converted_label.config(image=self.converted_img_tk, text="")

        # Calculate projection information for total document size
        try:
            from PyPDF2 import PdfReader
            input_path = self.input_var.get().strip()
            reader = PdfReader(input_path)
            total_pages = len(reader.pages)
            
            # Get the current PDF file size
            pdf_file_size = Path(input_path).stat().st_size
            
            # Calculate projected total size
            projected_total_size = file_size * total_pages
            
            # Calculate size difference vs original at 300 DPI
            original_size_ratio = (dpi / 300.0) ** 2  # Size scales with DPI squared
            size_vs_original = f"vs 300 DPI: {original_size_ratio:.1f}x"
            
            info_text = (
                f"PDF: {format_size(pdf_file_size)} | "
                f"Preview: {converted_pil.width}x{converted_pil.height}px @ {dpi} DPI | "
                f"Page Size: {format_size(file_size)} ({size_vs_original}) | "
                f"Est. Total: {format_size(projected_total_size)} ({total_pages} pages) | "
                f"Original Ref: {original_pil.width}x{original_pil.height}px @ 300 DPI"
            )
        except Exception as e:
            # Fallback to basic info if projection calculation fails
            info_text = (
                f"Preview: {converted_pil.width}x{converted_pil.height}px @ {dpi} DPI | "
                f"Est. Size: {format_size(file_size)} (Quality: {quality}) | "
                f"Original Ref: {original_pil.width}x{original_pil.height}px @ 300 DPI"
            )
        
        self.preview_info_label.config(text=info_text)


    def _show_zoom_lens(self, event):
        """Enable zoom display and show initial zoom."""
        if not self.zoom_enabled_var.get():
            return
        # Update zoom areas immediately only if we're over an image
        self._update_zoom_lens(event)

    def _hide_zoom_lens(self, event):
        """Hide the zoom lens and reset to placeholder."""
        if not self.zoom_enabled_var.get():
            return
        
        # Reset zoom areas to placeholder text with current zoom mode
        zoom_mode = self.zoom_mode_var.get()
        placeholder_text = f"Original\nZoom\n({zoom_mode})"
        preview_text = f"Preview\nZoom\n({zoom_mode})"
        
        self.zoom_lens_orig.config(image="", text=placeholder_text)
        self.zoom_lens_conv.config(image="", text=preview_text)
        
        # Clear image references
        self.zoom_lens_orig_image = None
        self.zoom_lens_conv_image = None

    def _update_zoom_lens(self, event):
        """Update the zoom lens content for both images in fixed positions."""
        if not self.zoom_enabled_var.get():
            zoom_mode = self.zoom_mode_var.get()
            self.zoom_lens_orig.config(image="", text=f"Original\nZoom\n({zoom_mode})")
            self.zoom_lens_conv.config(image="", text=f"Preview\nZoom\n({zoom_mode})")
            return

        # Check if we have images to work with
        if not self.full_res_original_pil or not self.full_res_converted_pil:
            return

        # Get mouse position relative to the preview label
        widget = self.preview_converted_label
        event_x = event.x
        event_y = event.y
        
        # Get widget dimensions
        widget_w, widget_h = widget.winfo_width(), widget.winfo_height()
        
        # Ensure we have valid dimensions
        if widget_w <= 1 or widget_h <= 1:
            return
        
        # Check if mouse is actually over the image area (not just the label background)
        # Get the actual image dimensions displayed in the label
        if hasattr(self, 'converted_img_tk') and self.converted_img_tk:
            img_display_w = self.converted_img_tk.width()
            img_display_h = self.converted_img_tk.height()
            
            # Calculate the centered position of the image within the label
            img_offset_x = (widget_w - img_display_w) // 2
            img_offset_y = (widget_h - img_display_h) // 2
            
            # Check if mouse is within the actual image bounds
            if (event_x < img_offset_x or event_x > img_offset_x + img_display_w or
                event_y < img_offset_y or event_y > img_offset_y + img_display_h):
                # Mouse is outside the image area, hide zoom
                self._hide_zoom_lens(event)
                return
            
            # Adjust coordinates to be relative to the image, not the label
            event_x -= img_offset_x
            event_y -= img_offset_y
            widget_w = img_display_w
            widget_h = img_display_h

        # Use fixed zoom area dimensions based on the reduced label size
        zoom_area_w = 280  # Reduced width for consistency
        zoom_area_h = 140  # Reduced height for consistency

        # --- Calculate crop coordinates based on the preview image ---
        img_w, img_h = self.full_res_converted_pil.size
        x_ratio = img_w / widget_w
        y_ratio = img_h / widget_h
        source_x = event_x * x_ratio
        source_y = event_y * y_ratio

        # Calculate zoom area size maintaining aspect ratio of the zoom display area
        zoom_display_ratio = zoom_area_w / zoom_area_h
        
        # Define zoom scale factor based on selected mode (smaller = more zoomed in)
        zoom_mode = self.zoom_mode_var.get()
        if zoom_mode == "Normal":
            zoom_scale = 0.15  # Show 15% of the original image dimension
        elif zoom_mode == "Puissant":
            zoom_scale = 0.08  # Show 8% of the original image dimension (plus puissant)
        elif zoom_mode == "Ultra":
            zoom_scale = 0.04  # Show 4% of the original image dimension (très puissant)
        else:
            zoom_scale = 0.15  # Fallback to normal
        
        # Calculate crop size maintaining the zoom area's aspect ratio
        if zoom_display_ratio > 1:  # Wider than tall
            crop_height = img_h * zoom_scale
            crop_width = crop_height * zoom_display_ratio
        else:  # Taller than wide
            crop_width = img_w * zoom_scale
            crop_height = crop_width / zoom_display_ratio
        
        # Ensure crop size doesn't exceed image boundaries
        crop_width = min(crop_width, img_w)
        crop_height = min(crop_height, img_h)
        
        # Calculate crop box centered on mouse position
        crop_left = max(0, source_x - crop_width / 2)
        crop_top = max(0, source_y - crop_height / 2)
        crop_right = min(img_w, source_x + crop_width / 2)
        crop_bottom = min(img_h, source_y + crop_height / 2)

        # Adjust if we're at the edges
        if crop_right - crop_left < crop_width:
            if crop_left == 0:
                crop_right = min(img_w, crop_left + crop_width)
            else:
                crop_left = max(0, crop_right - crop_width)
                
        if crop_bottom - crop_top < crop_height:
            if crop_top == 0:
                crop_bottom = min(img_h, crop_top + crop_height)
            else:
                crop_top = max(0, crop_bottom - crop_height)

        if crop_right <= crop_left or crop_bottom <= crop_top:
            return

        crop_box = (int(crop_left), int(crop_top), int(crop_right), int(crop_bottom))

        try:
            # --- Process and display the PREVIEW zoom ---
            cropped_preview = self.full_res_converted_pil.crop(crop_box)
            # Resize to fit the zoom display area maintaining aspect ratio
            zoomed_preview = cropped_preview.resize((zoom_area_w, zoom_area_h), Image.Resampling.NEAREST)
            
            self.zoom_lens_conv_image = ImageTk.PhotoImage(zoomed_preview)
            self.zoom_lens_conv.config(image=self.zoom_lens_conv_image, text="", compound="center")

            # --- Process and display the ORIGINAL zoom ---
            # Scale the crop box for the original image if its resolution differs
            orig_img_w, orig_img_h = self.full_res_original_pil.size
            orig_x_ratio = orig_img_w / img_w
            orig_y_ratio = orig_img_h / img_h

            orig_crop_left = crop_left * orig_x_ratio
            orig_crop_top = crop_top * orig_y_ratio
            orig_crop_right = crop_right * orig_x_ratio
            orig_crop_bottom = crop_bottom * orig_y_ratio

            orig_crop_box = (int(orig_crop_left), int(orig_crop_top), int(orig_crop_right), int(orig_crop_bottom))

            cropped_original = self.full_res_original_pil.crop(orig_crop_box)
            zoomed_original = cropped_original.resize((zoom_area_w, zoom_area_h), Image.Resampling.NEAREST)
            
            self.zoom_lens_orig_image = ImageTk.PhotoImage(zoomed_original)
            self.zoom_lens_orig.config(image=self.zoom_lens_orig_image, text="", compound="center")
            
        except Exception as e:
            # Handle any cropping/resizing errors gracefully
            self.zoom_lens_orig.config(image="", text="Zoom\nError")
            self.zoom_lens_conv.config(image="", text="Zoom\nError")


    def browse_input(self):
        path = filedialog.askopenfilename(
            title="Select PDF file",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*")]
        )
        if path:
            self.input_var.set(path)
            # Suggest default output filename
            out = Path(path).with_suffix(".cbz")
            self.output_var.set(str(out))

    def browse_output(self):
        path = filedialog.asksaveasfilename(
            title="Select output CBZ file",
            defaultextension=".cbz",
            filetypes=[("CBZ files", "*.cbz"), ("ZIP files", "*.zip"), ("All files", "*")]
        )
        if path:
            self.output_var.set(path)

    def browse_poppler(self):
        path = filedialog.askdirectory(title="Select Poppler bin directory")
        if path:
            self.poppler_var.set(path)

    def browse_logfile(self):
        path = filedialog.asksaveasfilename(
            title="Select log file",
            defaultextension=".log",
            filetypes=[("Log files", "*.log"), ("All files", "*")]
        )
        if path:
            self.logfile_var.set(path)

    def append_text(self, text: str):
        self.text_area.configure(state="normal")
        self.text_area.insert(tk.END, text + "\n")
        self.text_area.configure(state="disabled")
        self.text_area.see(tk.END)

    def _validate_and_get_numeric_config(self, var, default_value):
        """Safely get an integer from a tk.StringVar, falling back to a default."""
        value_str = var.get().strip()
        if not value_str or value_str == 'None':
            return default_value
        try:
            return int(value_str)
        except (ValueError, TypeError):
            logging.warning(f"Invalid numeric value '{value_str}', using default {default_value}.")
            return default_value

    def compute_analysis(self):
        input_path = self.input_var.get().strip()
        if not input_path:
            messagebox.showerror("Error", "Please select an input PDF file.")
            return
        pdf_path = Path(input_path)
        if not pdf_path.is_file() or pdf_path.suffix.lower() != ".pdf":
            messagebox.showerror("Error", f"Invalid PDF file: {pdf_path}")
            return

        # Clear text area
        self.text_area.configure(state="normal")
        self.text_area.delete(1.0, tk.END)
        self.text_area.configure(state="disabled")

        # Setup logging for analysis
        debug_mode = self.debug_var.get()
        logfile_val = self.logfile_var.get().strip()
        logfile_path = Path(logfile_val) if logfile_val else None
        setup_logging(logfile_path, debug=debug_mode)

        try:
            quality_val = self._validate_and_get_numeric_config(self.quality_var, 85)
            threads_val = self._validate_and_get_numeric_config(self.threads_var, os.cpu_count() or 1)

            logging.debug(f"Starting analysis with quality={quality_val}, threads={threads_val}")

            conv = Converter(
                input_pdf=pdf_path,
                output_cbz=Path(""),  # not used here
                dpi=None,
                fmt=self.format_var.get(),
                quality=quality_val,
                threads=threads_val,
                poppler_path=Path(self.poppler_var.get()) if self.poppler_var.get().strip() else None,
            )
            # 1. DPI analysis
            analysis_text = conv.analyse()
            self.append_text("=== DPI Analysis ===")
            for line in analysis_text.splitlines():
                self.append_text(line)

            # 2. Actual input file size
            file_size = pdf_path.stat().st_size
            readable_file_size = format_size(file_size)
            self.append_text(f"\nActual PDF file size: {readable_file_size}")

            # 3. Recommended DPI
            recommended_dpi = conv.calculate_clarity_dpi()
            self.append_text(f"Recommended DPI based on first page: {recommended_dpi}")

            # 4. Number of pages
            reader = PdfReader(str(pdf_path))
            total_pages = len(reader.pages)
            self.append_text(f"Total pages: {total_pages}")

            # 5. Estimate per-page image size at recommended DPI
            try:
                images = convert_from_path(
                    str(pdf_path),
                    dpi=recommended_dpi,
                    first_page=1,
                    last_page=1,
                    fmt=self.format_var.get(),
                    single_file=False,
                    poppler_path=str(Path(self.poppler_var.get())) if self.poppler_var.get().strip() else None,
                )
                if images:
                    buf = io.BytesIO()
                    save_kwargs = {"quality": quality_val} if self.format_var.get() == "jpeg" else {}
                    images[0].save(buf, format=self.format_var.get().upper(), **save_kwargs)
                    per_page_bytes = len(buf.getvalue())
                    readable_per_page = format_size(per_page_bytes)
                    projected_total = per_page_bytes * total_pages
                    readable_projected = format_size(projected_total)

                    self.append_text(f"\nEstimated size for one page at {recommended_dpi} DPI: {readable_per_page}")
                    self.append_text(f"Projected total CBZ size: {readable_projected} ({total_pages} pages at {readable_per_page} each)")
                else:
                    self.append_text("\nUnable to render first page for size estimation.")
            except Exception as e:
                logging.error(f"Error during size projection: {e}")
                self.append_text(f"\nError estimating output size: {e}")

        except Exception as e:
            logging.error(f"Error during analysis: {e}")
            messagebox.showerror("Error", f"An error occurred during analysis:\n{e}")

    def start_process(self):
        input_path = self.input_var.get().strip()
        if not input_path:
            messagebox.showerror("Error", "Please select an input PDF file.")
            return
        pdf_path = Path(input_path)
        if not pdf_path.is_file() or pdf_path.suffix.lower() != ".pdf":
            messagebox.showerror("Error", f"Input file not found or not a PDF: {pdf_path}")
            return

        output_path = self.output_var.get().strip()
        if not output_path:
            output_path = str(pdf_path.with_suffix(".cbz"))
        cbz_path = Path(output_path)

        try:
            dpi_val = int(self.dpi_var.get()) if self.dpi_var.get().strip() else None
        except ValueError:
            messagebox.showerror("Error", "DPI must be an integer.")
            return

        fmt_val = self.format_var.get()
        try:
            quality_val = self._validate_and_get_numeric_config(self.quality_var, 85)
        except ValueError:
            messagebox.showerror("Error", "Quality must be an integer.")
            return

        try:
            threads_val = self._validate_and_get_numeric_config(self.threads_var, os.cpu_count() or 1)
        except ValueError:
            messagebox.showerror("Error", "Threads must be an integer.")
            return

        poppler_val = self.poppler_var.get().strip()
        poppler_path = Path(poppler_val) if poppler_val else None

        logfile_val = self.logfile_var.get().strip()
        logfile_path = Path(logfile_val) if logfile_val else None

        analyse_only = self.analyse_var.get()
        debug_mode = self.debug_var.get()

        # Setup logging
        setup_logging(logfile_path, debug=debug_mode)

        # Clear text area
        self.text_area.configure(state="normal")
        self.text_area.delete(1.0, tk.END)
        self.text_area.configure(state="disabled")

        # Reset progress bar
        self.progress["value"] = 0
        self.progress["maximum"] = 1  # Will set proper maximum once we know page count

        # Disable Run button
        for widget in self.root.grid_slaves():
            if isinstance(widget, tk.Button) and widget["text"] == "Run":
                widget.config(state="disabled")

        def run_task():
            try:
                setup_logging(logfile_path, debug=debug_mode)
                conv = Converter(
                    input_pdf=pdf_path,
                    output_cbz=cbz_path,
                    dpi=dpi_val,
                    fmt=fmt_val,
                    quality=quality_val,
                    threads=threads_val,
                    poppler_path=poppler_path,
                )
                if analyse_only:
                    # Analysis only (same as compute_analysis, but collects results)
                    analysis_text = conv.analyse()
                    self.append_text("=== DPI Analysis ===")
                    for line in analysis_text.splitlines():
                        self.append_text(line)

                    # File size & projections
                    file_size = pdf_path.stat().st_size
                    readable_file_size = format_size(file_size)
                    self.append_text(f"\nActual PDF file size: {readable_file_size}")

                    recommended_dpi = conv.calculate_clarity_dpi()
                    self.append_text(f"Recommended DPI based on first page: {recommended_dpi}")

                    reader = PdfReader(str(pdf_path))
                    total_pages = len(reader.pages)
                    self.append_text(f"Total pages: {total_pages}")

                    try:
                        images = convert_from_path(
                            str(pdf_path),
                            dpi=recommended_dpi,
                            first_page=1,
                            last_page=1,
                            fmt=fmt_val,
                            single_file=False,
                            poppler_path=str(poppler_path) if poppler_path else None,
                        )
                        if images:
                            buf = io.BytesIO()
                            save_kwargs = {"quality": quality_val} if fmt_val == "jpeg" else {}
                            images[0].save(buf, format=fmt_val.upper(), **save_kwargs)
                            per_page_bytes = len(buf.getvalue())
                            readable_per_page = format_size(per_page_bytes)
                            projected_total = per_page_bytes * total_pages
                            readable_projected = format_size(projected_total)

                            self.append_text(f"\nEstimated size for one page at {recommended_dpi} DPI: {readable_per_page}")
                            self.append_text(f"Projected total CBZ size: {readable_projected} ({total_pages} pages at {readable_per_page} each)")
                        else:
                            self.append_text("\nUnable to render first page for size estimation.")
                    except Exception as e:
                        logging.error(f"Error during size projection: {e}")
                        self.append_text(f"\nError estimating output size: {e}")

                    messagebox.showinfo("Analysis Complete", "Analysis and size projection complete. See results below.")
                else:
                    reader = PdfReader(str(pdf_path))
                    total_pages = len(reader.pages)
                    self.progress["maximum"] = total_pages

                    def progress_cb(completed, total):
                        self.progress["value"] = completed
                        self.root.update_idletasks()

                    conv.convert(progress_callback=progress_cb)
                    messagebox.showinfo("Conversion Complete", f"Created CBZ:\n{cbz_path}")
            except Exception as e:
                logging.error(f"Error during processing: {e}")
                messagebox.showerror("Error", f"An error occurred:\n{e}")
            finally:
                # Re-enable Run button
                for widget in self.root.grid_slaves():
                    if isinstance(widget, tk.Button) and widget["text"] == "Run":
                        widget.config(state="normal")

        threading.Thread(target=run_task, daemon=True).start()

    def set_auto_threads(self):
        """Set threads to CPU count."""
        self.threads_var.set(str(os.cpu_count() or 1))
    
    def show_format_help(self):
        """Show format selection help."""
        help_text = """Image Format Guide:

JPEG:
• Best for photos and complex images
• Smaller file sizes
• Quality 70-85: Good for most content
• Quality 90+: High quality, larger files

PNG:
• Best for line art and simple graphics
• Lossless compression
• Larger files but perfect quality
• Good for black & white documents

Recommendations:
• Comics/Manga: JPEG 85
• Text documents: PNG
• Scanned books: JPEG 80-90"""
        messagebox.showinfo("Format Help", help_text)
    
    def save_current_config(self):
        """Save current settings to config file."""
        if not self.config_manager:
            messagebox.showwarning("Warning", "Configuration manager not available")
            return
            
        try:
            # Get current values
            dpi_val = self.dpi_var.get().strip()
            if dpi_val:
                self.config_manager.set('dpi', int(dpi_val))
            else:
                self.config_manager.set('dpi', None)
                
            self.config_manager.set('format', self.format_var.get())
            self.config_manager.set('quality', int(self.quality_var.get()))
            self.config_manager.set('threads', int(self.threads_var.get()))
            
            poppler_path = self.poppler_var.get().strip()
            if poppler_path:
                self.config_manager.set('poppler_path', poppler_path)
            else:
                self.config_manager.set('poppler_path', None)
                
            self.config_manager.save_config()
            messagebox.showinfo("Success", f"Configuration saved to {self.config_manager.config_path}")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save configuration: {e}")
    
    def load_config_file(self):
        """Load configuration from file."""
        if not self.config_manager:
            messagebox.showwarning("Warning", "Configuration manager not available")
            return
            
        config_path = filedialog.askopenfilename(
            title="Select configuration file",
            filetypes=[("JSON files", "*.json"), ("All files", "*")]
        )
        if config_path:
            try:
                self.config_manager.config_path = Path(config_path)
                self.config_manager.load_config()
                self.load_config_values()
                # Update GUI with new values
                self.dpi_var.set(str(self.default_dpi) if self.default_dpi else "")
                self.format_var.set(self.default_format)
                self.quality_var.set(str(self.default_quality))
                self.threads_var.set(str(self.default_threads))
                self.poppler_var.set(self.default_poppler_path)
                messagebox.showinfo("Success", f"Configuration loaded from {config_path}")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to load configuration: {e}")
    
    def show_hints(self):
        """Show helpful hints in a new window."""
        hints_window = tk.Toplevel(self.root)
        hints_window.title("Helpful Hints")
        hints_window.geometry("600x500")
        
        # Create text widget with scrollbar
        text_widget = scrolledtext.ScrolledText(hints_window, wrap=tk.WORD, width=70, height=30)
        text_widget.pack(padx=10, pady=10, fill=tk.BOTH, expand=True)
        
        # Add hints content
        hints_content = """💡 PDF to CBZ Converter - Helpful Hints:

🎯 DPI Recommendations:
   • Use 'Compute Analysis' to see suggested DPI for your PDF
   • For comics/manga: 150-200 DPI usually sufficient
   • For text documents: 200-300 DPI for better readability
   • High DPI = larger file size but better quality

📁 Output Tips:
   • CBZ files are just ZIP archives with images
   • Use JPEG for smaller files, PNG for better quality
   • Quality 85 is a good balance for JPEG

⚡ Performance:
   • More threads = faster conversion (up to CPU limit)
   • Large PDFs may need more memory
   • SSD storage helps with temp file operations

🔧 Poppler Setup:
   • Download from: https://github.com/oschwartz10612/poppler-windows/releases
   • Extract and add bin/ folder to PATH
   • Or specify location in Poppler Path field

🔍 Troubleshooting:
   • Use log file to capture detailed logs
   • If pdftocairo fails, converter automatically falls back to pdf2image
   • Check that input PDF is not password protected

📋 Configuration:
   • Save current settings with 'Save Config' button
   • Load saved settings with 'Load Config' button
   • Settings are automatically applied to new conversions"""
        
        text_widget.insert(tk.END, hints_content)
        text_widget.configure(state="disabled")
        
    def _show_zoom_help(self):
        """Show help about zoom modes."""
        help_text = """Modes de Zoom Disponibles:

🔍 Normal (15%) - Touche [1]:
• Zoom modéré pour une vue d'ensemble
• Idéal pour comparer les détails généraux
• Montre environ 15% de la zone d'origine

🔍🔍 Puissant (8%) - Touche [2]:
• Zoom plus fort pour examiner les détails fins
• Parfait pour vérifier la qualité du texte
• Montre environ 8% de la zone d'origine

🔍🔍🔍 Ultra (4%) - Touche [3]:
• Zoom très puissant pour l'inspection pixel par pixel
• Utile pour analyser la netteté et les artefacts
• Montre environ 4% de la zone d'origine

⌨️ Raccourcis Clavier:
• Appuyez sur 1, 2 ou 3 pour changer rapidement de mode

💡 Conseil: 
Utilisez le mode Normal pour une comparaison générale, 
Puissant pour vérifier la lisibilité du texte,
et Ultra pour une analyse détaillée de la qualité."""
        
        messagebox.showinfo("Aide - Modes de Zoom", help_text, parent=self.preview_window)

    def _update_zoom_mode_display(self):
        """Update the zoom area placeholder text to show current zoom mode."""
        if hasattr(self, 'zoom_lens_orig') and hasattr(self, 'zoom_lens_conv'):
            zoom_mode = self.zoom_mode_var.get()
            # Only update if no actual zoom image is currently displayed
            if not hasattr(self, 'zoom_lens_orig_image') or self.zoom_lens_orig_image is None:
                self.zoom_lens_orig.config(text=f"Original\nZoom\n({zoom_mode})")
                self.zoom_lens_conv.config(text=f"Preview\nZoom\n({zoom_mode})")

    def _set_zoom_mode(self, mode):
        """Set zoom mode and update display."""
        self.zoom_mode_var.set(mode)
        self._update_zoom_mode_display()

    def _on_preview_window_close(self):
        """Handle preview window close event - ask user if they want to apply settings."""
        # Get current preview settings
        try:
            current_dpi = self.preview_dpi_var.get().strip()
            current_quality = self.preview_quality_var.get().strip()
            current_page = self.preview_page_var.get().strip()
            current_format = self.format_var.get()
            current_zoom_mode = self.zoom_mode_var.get()
            
            # Create a summary of current settings
            settings_summary = f"""Paramètres actuels de prévisualisation:

• DPI: {current_dpi}
• Qualité JPEG: {current_quality}
• Format: {current_format.upper()}
• Page visualisée: {current_page}
• Mode de zoom: {current_zoom_mode}

Voulez-vous appliquer ces paramètres à l'interface principale ?"""

            # Ask user if they want to apply these settings
            response = messagebox.askyesnocancel(
                "Appliquer les paramètres de prévisualisation ?",
                settings_summary,
                parent=self.preview_window
            )
            
            if response is True:  # Yes - apply settings
                self._apply_preview_settings_to_main(show_confirmation=False)
                messagebox.showinfo(
                    "Paramètres appliqués",
                    "Les paramètres de prévisualisation ont été appliqués à l'interface principale.",
                    parent=self.root
                )
                self.preview_window.destroy()
            elif response is False:  # No - just close
                self.preview_window.destroy()
            # If Cancel (None), do nothing - keep window open
            
        except Exception as e:
            # If there's an error getting settings, just close normally
            print(f"Error getting preview settings: {e}")
            self.preview_window.destroy()

    def _apply_preview_settings_to_main(self, show_confirmation=True):
        """Apply current preview settings to the main GUI."""
        try:
            # Apply DPI setting
            preview_dpi = self.preview_dpi_var.get().strip()
            if preview_dpi:
                self.dpi_var.set(preview_dpi)
            
            # Apply Quality setting
            preview_quality = self.preview_quality_var.get().strip()
            if preview_quality:
                self.quality_var.set(preview_quality)
            
            # Format is already shared via self.format_var, so no need to update
            
            # Show confirmation message if requested
            if show_confirmation:
                messagebox.showinfo(
                    "Paramètres appliqués",
                    f"Les paramètres de prévisualisation ont été appliqués à l'interface principale:\n\n"
                    f"• DPI: {preview_dpi}\n"
                    f"• Qualité: {preview_quality}\n"
                    f"• Format: {self.format_var.get().upper()}",
                    parent=self.preview_window if hasattr(self, 'preview_window') and self.preview_window.winfo_exists() else self.root
                )
            
        except Exception as e:
            messagebox.showerror(
                "Erreur",
                f"Erreur lors de l'application des paramètres: {e}",
                parent=self.preview_window if hasattr(self, 'preview_window') and self.preview_window.winfo_exists() else self.root
            )

    def _fix_zoom_area_size(self):
        """Force zoom areas to maintain their fixed size."""
        if hasattr(self, 'zoom_frame_orig') and hasattr(self, 'zoom_frame_conv'):
            self.zoom_frame_orig.config(width=280, height=140)
            self.zoom_frame_conv.config(width=280, height=140)
            self.zoom_frame_orig.grid_propagate(False)
            self.zoom_frame_conv.grid_propagate(False)


def main_cli():
    args = parse_args()
    setup_logging(args.logfile, debug=args.debug)

    inp = args.input
    if not inp.is_file():
        logging.error("Input file not found: %s", inp)
        sys.exit(1)
    if inp.suffix.lower() != ".pdf":
        logging.error("Input file is not a PDF: %s", inp)
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
        print(conv.analyse())
    else:
        conv.convert()


if __name__ == "__main__":
    # If any arguments are provided, run CLI mode; otherwise, launch GUI.
    if len(sys.argv) > 1:
        main_cli()
    else:
        root = tk.Tk()
        app = PDF2CBZGui(root)
        root.mainloop()
