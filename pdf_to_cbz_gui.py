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
import logging
import subprocess
import sys
import zipfile
import tempfile
import io
import os
import threading
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

# Import our custom modules
try:
    from config_manager import ConfigManager
    from hints import print_usage_hints, print_dpi_recommendations, print_format_recommendations
except ImportError:
    # Fallback if modules aren't available
    ConfigManager = None

from PyPDF2 import PdfReader
from pdf2image import convert_from_path


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
                proc = subprocess.run(
                    cmd, stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE, text=True, check=False
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
        reader = PdfReader(str(self.input_pdf))
        widths = [float(p.mediabox.width) for p in reader.pages]
        dpi_vals = [int(2000 / w * 72) for w in widths]
        lines = [
            "Page widths (pt): " + ", ".join(str(round(w, 1)) for w in widths),
            "Suggested DPIs: " + ", ".join(str(d) for d in dpi_vals),
            f"Min DPI: {min(dpi_vals)}",
            f"Max DPI: {max(dpi_vals)}",
            f"Avg DPI: {round(sum(dpi_vals) / len(dpi_vals))}",
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

        # Analyse Checkbox and Compute Analysis Button
        self.analyse_var = tk.BooleanVar()
        tk.Checkbutton(self.root, text="Analyse only (no conversion)", variable=self.analyse_var).grid(row=8, column=0, columnspan=2, sticky="w", **pad)
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
        tk.Button(button_frame, text="Quit", command=self.root.quit, width=10).pack(side=tk.LEFT, padx=5)

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

        try:
            conv = Converter(
                input_pdf=pdf_path,
                output_cbz=Path(""),  # not used here
                dpi=None,
                fmt=self.format_var.get(),
                quality=int(self.quality_var.get()),
                threads=int(self.threads_var.get()),
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
                    save_kwargs = {"quality": int(self.quality_var.get())} if self.format_var.get() == "jpeg" else {}
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
            quality_val = int(self.quality_var.get())
        except ValueError:
            messagebox.showerror("Error", "Quality must be an integer.")
            return

        try:
            threads_val = int(self.threads_var.get())
        except ValueError:
            messagebox.showerror("Error", "Threads must be an integer.")
            return

        poppler_val = self.poppler_var.get().strip()
        poppler_path = Path(poppler_val) if poppler_val else None

        logfile_val = self.logfile_var.get().strip()
        logfile_path = Path(logfile_val) if logfile_val else None

        analyse_only = self.analyse_var.get()

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
                setup_logging(logfile_path)
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
        

def main_cli():
    args = parse_args()
    setup_logging(args.logfile)

    inp = args.input
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
