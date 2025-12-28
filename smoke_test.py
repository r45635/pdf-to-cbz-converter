#!/usr/bin/env python3
"""
A simple smoke test for pdf-to-cbz-converter.

What it does:
- Uses a bundled sample PDF (sample_dir/pdf2cbz_test_sample_0.pdf)
- Runs CLI analyse mode to ensure the CLI path is working
- Attempts a one-page conversion to a temporary CBZ (fast) using the CLI
- Verifies the CBZ archive exists and contains at least one image
- Prints PASS/FAIL and exits non-zero on failures

Requirements:
- Python env with project requirements installed (PyPDF2, PyMuPDF, Pillow, tqdm)
- No Poppler required

Usage:
  python smoke_test.py
"""
from __future__ import annotations
import io
import os
import sys
import json
import time
import zipfile
import tempfile
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SAMPLE_PDF = ROOT / "sample_dir" / "pdf2cbz_test_sample_0.pdf"
CLI = ROOT / "pdf_to_cbz.py"


def run(cmd: list[str], timeout: int = 60) -> tuple[int, str, str]:
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
        return 124, out, err
    return proc.returncode, out, err


def assert_true(cond: bool, msg: str):
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)


def main():
    print("Smoke test starting…")

    # Preconditions
    assert_true(CLI.is_file(), f"CLI not found: {CLI}")
    assert_true(SAMPLE_PDF.is_file(), f"Sample PDF not found: {SAMPLE_PDF}")

    # 1) Analyse mode
    print("Running CLI analyse…")
    code, out, err = run([sys.executable, str(CLI), str(SAMPLE_PDF), "--analyse"]) 
    print(out)
    if err:
        print("[analyse stderr]", err)
    assert_true(code == 0, f"Analyse command failed with code {code}")
    assert_true(
        ("Page widths (pt)" in out) or ("Suggested DPIs" in out) or ("Average page size" in out) or ("Recommended DPI" in out),
        "Analyse output did not include expected text"
    )

    # 2) One-page conversion to temp CBZ
    #    We do this by copying the sample and trimming to first page via the CLI by supplying a small DPI for speed.
    #    The converter creates one image per page, so small PDFs are quick.
    tmpdir = Path(tempfile.mkdtemp(prefix="pdf2cbz_smoke_"))
    out_cbz = tmpdir / "out.cbz"
    print(f"Running one-page conversion to {out_cbz}…")
    # Use explicit DPI for speed and JPEG with medium quality
    code, out, err = run([
        sys.executable, str(CLI), str(SAMPLE_PDF),
        "-o", str(out_cbz),
        "-d", "150",
        "-f", "jpeg",
        "-q", "80",
        "-t", "2",
    ], timeout=180)
    print(out)
    if err:
        print("[convert stderr]", err)
    assert_true(code == 0, f"Conversion command failed with code {code}")
    assert_true(out_cbz.is_file(), f"CBZ file not created: {out_cbz}")

    # 3) Validate CBZ contents
    with zipfile.ZipFile(out_cbz, "r") as zf:
        names = zf.namelist()
        assert_true(len(names) >= 1, "CBZ archive contains no files")
        # Require jpeg or png image present
        assert_true(any(n.lower().endswith((".jpg", ".jpeg", ".png")) for n in names), "CBZ missing image files")

    print("PASS: Smoke test completed successfully.")


if __name__ == "__main__":
    main()
