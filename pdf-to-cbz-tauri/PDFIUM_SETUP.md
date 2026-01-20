# 📦 PDFium Library Setup Guide

## Issue

When running `npm run tauri dev`, the application crashes with:
```
panicked at: called `Result::unwrap()` on an `Err` value: LoadLibraryError(DlOpen {...}):
tried: 'libpdfium.dylib' (no such file)...
```

This happens because **pdfium is a C++ library that must be installed separately** on your system. The Rust crate `pdfium-render` is just a wrapper around it.

---

## Solution: Install PDFium on macOS

### Method 1: Build from Source (Recommended)

PDFium has official build instructions. Since it's not in Homebrew, you'll need to build it:

```bash
# 1. Install build dependencies
brew install ninja cmake python3

# 2. Clone PDFium source
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
git clone https://pdfium.googlesource.com/pdfium

# 3. Navigate to pdfium directory
cd pdfium
mkdir out/Release
cd out/Release

# 4. Configure build
gn gen --args='is_debug=false' .

# 5. Build
ninja

# 6. Install to system library path
# The built library will be in: out/Release/libpdfium.dylib
sudo cp out/Release/libpdfium.dylib /usr/local/lib/
sudo chmod 755 /usr/local/lib/libpdfium.dylib
```

### Method 2: Use Prebuilt Binaries

If building from source is too complex, you can download prebuilt binaries:

```bash
# 1. Download prebuilt pdfium for macOS
# From: https://github.com/bblanchon/pdfium-binaries/releases
# Or: https://pdfium.googlesource.com/pdfium/+/refs/heads/main/README.md

# 2. Extract and install
tar -xzf pdfium-mac.tar.gz
sudo cp libpdfium.dylib /usr/local/lib/
sudo chmod 755 /usr/local/lib/libpdfium.dylib
```

### Method 3: Set Library Path (Temporary)

If you just want to test without permanent installation:

```bash
# Set environment variable to point to pdfium location
export DYLD_LIBRARY_PATH="/path/to/pdfium/lib:$DYLD_LIBRARY_PATH"
npm run tauri dev
```

---

## Verify Installation

After installing pdfium, verify it works:

```bash
# Should show the library
ls -la /usr/local/lib/libpdfium.dylib

# Test that it loads
otool -L /usr/local/lib/libpdfium.dylib

# Then try running Tauri dev again
npm run tauri dev
```

---

## Common Issues

### "libpdfium.dylib not found in /usr/local/lib"

Try one of these:

```bash
# Find where dyld expects libraries
echo $DYLD_LIBRARY_PATH

# Or check system library paths
/usr/libexec/dyld --help

# Add to PATH if needed
sudo mkdir -p /usr/local/lib
sudo cp libpdfium.dylib /usr/local/lib/
```

### "DlOpen error" after installation

Make sure the library is readable:

```bash
sudo chmod 755 /usr/local/lib/libpdfium.dylib
otool -L /usr/local/lib/libpdfium.dylib  # Should show dependencies
```

### Architecture mismatch (ARM64 vs Intel)

Your system is ARM64 (Apple Silicon). Make sure you download/build the correct architecture:

```bash
# Check file architecture
file /usr/local/lib/libpdfium.dylib
# Should output: Mach-O 64-bit dynamically linked shared library arm64
```

---

## Once PDFium is Installed

Run the Tauri app:

```bash
cd /Users/vincentcruvellier/Documents/GitHub/pdf-to-cbz-converter/pdf-to-cbz-tauri
export PATH="$HOME/.cargo/bin:$PATH"
npm run tauri dev
```

The window should open successfully!

---

## Alternative: Use Docker

If you don't want to install pdfium directly, you can use Docker:

```bash
# Dockerfile setup with pdfium pre-installed
# Then develop inside the container
docker run -it -v $(pwd):/app myimage npm run tauri dev
```

---

## References

- **PDFium Official**: https://pdfium.googlesource.com/pdfium
- **Prebuilt Binaries**: https://github.com/bblanchon/pdfium-binaries
- **pdfium-render Rust crate**: https://crates.io/crates/pdfium-render
- **Build Instructions**: https://pdfium.googlesource.com/pdfium/+/main/docs/getting-started.md

---

## Status

✅ **Application Code**: All compiled and ready
❌ **Runtime Dependency**: PDFium library needs installation
⏳ **Next Step**: Install pdfium using one of the methods above

Once pdfium is installed, the app will run perfectly with all features:
- PDF analysis
- Preview generation
- Drag & drop
- Format conversion
- CBZ creation
- Language support
