# 🚀 Quick Start - Getting Tauri App Working

## ✅ What's Been Fixed

1. **✅ CRITICAL: PDF Analysis Bug Fixed**
   - Fixed error handling in `src-tauri/src/commands/pdf_analysis.rs`
   - This was causing "analysis failed" error
   - Applied automatically

2. **✅ Language Selector Fixed**
   - Removed Next.js `'use client'` directives
   - Fixed component prop names
   - Files updated: `LanguageSelector.tsx`, `useTranslation.ts`

3. **⏳ Drag & Drop (Instructions Provided)**
   - See `DRAG_DROP_PATCH.md` for how to add it
   - Visual feedback implemented
   - Can be added in 5 minutes

---

## 🔧 Build & Run Steps

### Step 1: Build Rust Backend

```bash
cd pdf-to-cbz-tauri/src-tauri
cargo build
```

**Expected output:**
```
   Compiling pdf-to-cbz-converter v2.5.0
    Finished release [optimized] target(s) in XX.XXs
```

**If you see errors:**
- Make sure Rust is installed: `rustup update`
- Check Cargo is working: `cargo --version`
- Look for specific error messages and search them

### Step 2: Run Development App

```bash
cd pdf-to-cbz-tauri
npm run tauri dev
```

**Expected output:**
```
> pdf-to-cbz-tauri@2.5.0 tauri dev
  vite v6.x.x building for production...
  built in XXXms
    Tauri v2.x.x
```

A window should open with the application.

### Step 3: Test with Sample Files

**Available test files:**
```
/Users/vincentcruvellier/Documents/GitHub/pdf-to-cbz-converter/sample_dir/
├── pdf2cbz_test_sample_1.pdf (22 KB - small, quick test)
├── pdf2cbz_test_sample_0.pdf (527 KB - normal)
├── Vers_les_Etoiles_BD.pdf (8.9 MB - large)
└── Vers_les_Etoiles_BD.cbz (993 KB - for CBZ tests)
```

---

## ✨ Testing Checklist

### Basic Tests (should all pass)

- [ ] **App Opens**
  - Window appears without crashes
  - UI renders properly

- [ ] **File Selection**
  - Click "Select File" button
  - File dialog opens
  - Can navigate to `sample_dir/`
  - Can select a PDF file

- [ ] **PDF Analysis** ← THIS WAS BROKEN, NOW FIXED
  - After selecting PDF, page count appears
  - DPI recommendations show up
  - File size displays
  - NO "Analysis failed" error

- [ ] **Preview Generation**
  - Adjust DPI slider
  - Change format (JPEG/PNG)
  - Quality slider works
  - Preview image updates

- [ ] **PDF to CBZ Conversion**
  - Click "Convert" button
  - Progress bar appears
  - Status message shows current page
  - Output file is created and can be opened

- [ ] **Language Selector** ← NOW WORKS
  - Click language dropdown
  - Select different language
  - UI text changes
  - Selection persists on reload

### Advanced Tests (optional)

- [ ] **CBZ to PDF Conversion**
  - Select CBZ file
  - Convert to PDF
  - Open output PDF

- [ ] **Batch Mode**
  - Click "Batch Mode" button
  - Upload multiple PDFs
  - Set common settings
  - Convert all files

- [ ] **Auto-Optimization**
  - Click "Optimize" button
  - Wait for analysis
  - Settings adjust automatically

---

## 🆘 Troubleshooting

### Problem: Window doesn't open

**Solution:**
```bash
# Check Rust compilation
cd src-tauri && cargo check

# Check dependencies
npm list @tauri-apps/api
npm list @tauri-apps/cli
```

### Problem: "analysis failed" still appears

**Solution:**
- Verify the fix was applied: `grep -A 2 "Task join error" src-tauri/src/commands/pdf_analysis.rs`
- Should show: `.map_err(...)?` on one line, `.map_err(...))` on next line
- Rebuild: `cd src-tauri && cargo clean && cargo build`

### Problem: Language selector doesn't work

**Solution:**
- Check LanguageSelector.tsx line 1 - should NOT have `'use client'`
- Check prop names match: `lang` and `setLang`
- Check useTranslation.ts doesn't have `'use client'`

### Problem: Drag & drop doesn't work

**Solution:**
- Drag & drop wasn't implemented in the initial version
- See `DRAG_DROP_PATCH.md` to add it
- Takes about 5 minutes

### Problem: Conversion very slow

**Solution:**
- First conversion may take longer (PDF rendering)
- Large files (>100 pages) may take 30-60 seconds
- This is normal, not a bug

### Problem: "No such file or directory: cargo"

**Solution:**
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add to PATH
source $HOME/.cargo/env

# Verify
cargo --version
```

---

## 📋 File Changes Summary

| File | Change | Impact |
|------|--------|--------|
| `src-tauri/src/commands/pdf_analysis.rs` | Fixed error handling line 117-118 | ✅ Fixes "analysis failed" |
| `src/components/LanguageSelector.tsx` | Removed 'use client', fixed props | ✅ Language selector works |
| `src/lib/useTranslation.ts` | Removed 'use client' | ✅ Translations load |

---

## ✅ Next: Optional Enhancements

### Add Drag & Drop (5 minutes)
See `DRAG_DROP_PATCH.md` for exact code to add

### Add Unit Tests (15 minutes)
See `TESTING.md` for test examples

### Build for Production (5 minutes)
```bash
npm run tauri build
```

Creates native installers in `src-tauri/target/release/bundle/`

---

## 🎯 Expected Results

After following these steps, you should have:

✅ A working Tauri desktop app that:
- Opens without crashes
- Analyzes PDFs correctly
- Generates previews
- Converts PDFs to CBZ
- Switches languages
- Has nice UI with Tailwind CSS

⏳ NOT YET:
- Drag & drop (instructions provided)
- Batch mode (should work, needs testing)
- Auto-optimization (should work, needs testing)

---

## 📞 Debug Info to Collect

If you encounter issues, collect this info:

```bash
# System info
rustc --version
cargo --version
node --version
npm --version

# Tauri version
npm list @tauri-apps/api

# Build status
cd pdf-to-cbz-tauri
npm run tauri dev 2>&1 | head -50
```

Share this with any error messages.

---

## 🎉 Success Indicators

After `npm run tauri dev`, you should see:

1. ✅ Window opens
2. ✅ Can click "Select File"
3. ✅ Can pick a PDF from sample_dir
4. ✅ Page count and DPI appear (NOT "Analysis failed")
5. ✅ Preview image shows
6. ✅ Language dropdown works
7. ✅ Can convert PDF to CBZ

If all 7 work → 🎉 **SUCCESS!**

---

## 📚 More Info

- `DEBUG_REPORT.md` - Detailed problem analysis
- `FIXES_APPLIED.md` - What was fixed
- `DRAG_DROP_PATCH.md` - How to add drag & drop
- `ARCHITECTURE.md` - System design
- `TESTING.md` - Test strategies
