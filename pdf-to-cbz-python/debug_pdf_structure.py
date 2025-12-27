#!/usr/bin/env python3
import sys
import re
import io
from pathlib import Path
from PyPDF2 import PdfReader

SUSPICIOUS_KEYS = [
    "/JS", "/JavaScript", "/OpenAction", "/AA", "/Launch",
    "/EmbeddedFile", "/RichMedia", "/Annot", "/AcroForm"
]

def scan_raw_keywords(data: bytes, keywords):
    text = data.decode("latin-1", errors="ignore")
    return {kw: len(re.findall(re.escape(kw), text)) for kw in keywords}

def main(pdf_path):
    pdf_path = Path(pdf_path)
    if not pdf_path.is_file():
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    # Read raw bytes for low-level checks
    raw = pdf_path.read_bytes()

    # 1) Header/footer/xref
    header_line = raw[:20].split(b"\n",1)[0].decode(errors="ignore")
    eof_count = raw.count(b"%%EOF")
    startxref_count = len(re.findall(rb"startxref\s+\d+", raw))
    print("="*60)
    print(f"File: {pdf_path}")
    print(f"Header line: {header_line!r}")
    print(f"Derived PDF version: {header_line.lstrip('%PDF-')}")
    print(f"EOF markers: {eof_count}")
    print(f"startxref entries: {startxref_count}")
    print(f"Total size: {pdf_path.stat().st_size/1024**2:.2f} MiB")
    print("="*60)

    # 2) PyPDF2 structural info
    reader = PdfReader(str(pdf_path))
    print(f"Encrypted: {reader.is_encrypted}")
    print(f"Number of pages: {len(reader.pages)}")

    # Metadata
    if reader.metadata:
        print("\nMetadata:")
        for k, v in reader.metadata.items():
            print(f"  {k}: {v}")
    else:
        print("\nNo metadata found")

    # Count direct PDF objects
    obj_refs = re.findall(rb"\d+\s+\d+\s+obj", raw)
    print(f"\nDirect object definitions: {len(obj_refs)}")

    # 3) Raw keyword scan
    print("\nSuspicious keyword counts in raw stream:")
    for k, v in scan_raw_keywords(raw, SUSPICIOUS_KEYS).items():
        print(f"  {k}: {v}")

    # 4) Embedded files
    try:
        root = reader.trailer["/Root"]
        names = root["/Names"]["/EmbeddedFiles"]["/Names"]
        embeds = []
        for i in range(0, len(names), 2):
            fname = names[i]
            fs = names[i+1].get_object().get("/EF", {})
            embeds.append((fname, list(fs.keys())))
        print(f"\nEmbedded files ({len(embeds)}):")
        for fname, streams in embeds:
            print(f"  – {fname}: streams {streams}")
    except Exception:
        print("\nNo embedded-files dictionary found")

    # 5) OpenAction / JavaScript actions
    try:
        oa = root.get("/OpenAction")
        if oa:
            print(f"\n/OpenAction entry: {oa}")
    except Exception:
        pass

    # 6) Page annotations
    total_annots = 0
    for i, page in enumerate(reader.pages, start=1):
        ann = page.get("/Annots")
        if ann:
            total_annots += len(ann)
    print(f"\nTotal page-level annotations: {total_annots}")

    print("\nDone.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python debug_pdf_structure.py <file.pdf>")
        sys.exit(1)
    main(sys.argv[1])
