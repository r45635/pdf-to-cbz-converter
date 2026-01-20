# PDF to CBZ Converter - Tauri Rewrite Architecture

## Overview

This document describes the complete architectural design for rewriting the pdf-to-cbz-converter from Next.js web application to a Tauri desktop application that runs on Windows, macOS, and Linux.

## High-Level Architecture

### Current Stack (Next.js)
- **Frontend**: React 19 + Tailwind CSS
- **Backend**: Node.js API routes (Next.js API Router)
- **PDF Processing**: pdfjs-dist, pdf-lib
- **Image Processing**: Sharp (native bindings)
- **Archive**: Archiver
- **Deployment**: Vercel (serverless)

### Target Stack (Tauri)

```
┌─────────────────────────────────────────────────────┐
│         Tauri Desktop Application                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────────┐   ┌────────────────────┐ │
│  │   React Frontend     │   │  Tauri Window      │ │
│  │  (Same Codebase)     │───│  Management        │ │
│  │  + Tailwind CSS      │   │                    │ │
│  └──────────────────────┘   └────────────────────┘ │
│          │                                          │
│          ▼                                          │
│  ┌──────────────────────┐                          │
│  │  Tauri Invoke (IPC)  │                          │
│  └──────────────────────┘                          │
│          │                                          │
└──────────┼──────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────┐
│    Rust Backend (Tauri Commands)                    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  PDF Processing Module                        │ │
│  │  - pdfium-render (Rust PDF library)           │ │
│  │  - image analysis                             │ │
│  │  - page rendering                            │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Image Processing Module                      │ │
│  │  - image (Rust image crate)                   │ │
│  │  - optimization                               │ │
│  │  - format conversion (JPEG/PNG)               │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  Archive Module                               │ │
│  │  - zip (Rust zip crate)                       │ │
│  │  - CBZ creation                               │ │
│  │  - PDF creation                               │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │  File System Access                           │ │
│  │  - File dialog & selection                    │ │
│  │  - Save/Load operations                       │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Key Advantages of Tauri Approach

1. **Cross-Platform Native Binaries**
   - Single Rust backend compiled for Windows, macOS, Linux
   - Small installer size (~50-100MB per platform vs 500MB+ web app)

2. **Reuse Frontend Code**
   - React components are 100% reusable (no Next.js-specific code)
   - Tailwind CSS configuration remains the same
   - UI logic unchanged

3. **Better Performance**
   - Native Rust backend vs Node.js
   - Direct file system access (no web sandbox limitations)
   - Local processing (no internet required)

4. **Better UX**
   - Native window management
   - System tray integration
   - Direct file operations (faster, more reliable)
   - OS-level notifications

5. **Simplified Backend**
   - No HTTP layers (IPC instead)
   - Direct binary return values
   - Built-in progress streaming

## Project Structure

```
pdf-to-cbz-tauri/
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── lib.rs                 # Rust module exports
│   │   ├── commands/              # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   ├── pdf_analysis.rs    # PDF analysis logic
│   │   │   ├── conversion.rs      # PDF/CBZ conversion
│   │   │   ├── preview.rs         # Image preview generation
│   │   │   ├── extraction.rs      # Direct image extraction
│   │   │   └── optimization.rs    # Auto-optimization
│   │   ├── models/                # Data structures
│   │   │   ├── mod.rs
│   │   │   ├── pdf.rs             # PDF-related models
│   │   │   ├── cbz.rs             # CBZ-related models
│   │   │   └── conversion.rs      # Conversion options
│   │   ├── utils/                 # Utility functions
│   │   │   ├── mod.rs
│   │   │   ├── pdf_renderer.rs    # PDF rendering logic
│   │   │   ├── image_processor.rs # Image processing
│   │   │   ├── archive.rs         # Archive operations
│   │   │   └── estimation.rs      # Size estimation
│   │   └── main.rs                # Tauri app initialization
│   │
│   ├── Cargo.toml                 # Rust dependencies
│   ├── tauri.conf.json            # Tauri configuration
│   └── icons/                     # App icons (multiple sizes)
│
├── src/                            # React frontend (from Next.js)
│   ├── app/
│   │   ├── page.tsx               # Main converter page (REUSE)
│   │   ├── batch/page.tsx         # Batch mode (REUSE)
│   │   └── layout.tsx             # Layout (REUSE)
│   ├── components/                # React components (REUSE)
│   │   ├── BatchUploader.tsx
│   │   ├── BatchResults.tsx
│   │   ├── BatchSettings.tsx
│   │   └── LanguageSelector.tsx
│   ├── lib/                        # Utilities (mostly REUSE)
│   │   ├── translations.ts         # Localization (REUSE)
│   │   ├── useTranslation.ts       # Hook (REUSE)
│   │   ├── tauri-client.ts         # NEW: Tauri invocation wrapper
│   │   └── batch-types.ts          # Types (REUSE)
│   ├── hooks/                      # NEW
│   │   └── useTauriCommands.ts     # Tauri command hooks
│   ├── App.tsx                     # NEW: Root component for Tauri
│   ├── main.tsx                    # NEW: Vite entry point
│   └── styles/
│       └── globals.css             # Global styles (REUSE/ADAPT)
│
├── package.json                   # Frontend dependencies
├── tsconfig.json                  # TypeScript config
├── vite.config.ts                 # Vite configuration (NEW)
├── tailwind.config.js             # Tailwind config (REUSE)
├── postcss.config.js              # PostCSS config (REUSE)
│
└── [This project's docs]
    ├── ARCHITECTURE.md             # This file
    ├── IMPLEMENTATION_GUIDE.md     # Step-by-step implementation
    ├── MIGRATION_GUIDE.md          # Frontend code migration
    ├── RUST_IMPLEMENTATION.md      # Rust backend details
    └── TESTING.md                  # Testing strategy
```

## Core Modules Breakdown

### 1. PDF Analysis Module (`src-tauri/src/commands/pdf_analysis.rs`)

**Replaces**: `src/lib/pdf-converter.ts::analyzePdf()`

**Responsibilities**:
- Load PDF from file path using pdfium-render
- Extract page dimensions (points to pixels conversion)
- Calculate recommended DPI
- Calculate native DPI (matching PDF file size)
- Return analysis structure

**Key Functions**:
- `analyze_pdf(path: String) -> Result<PdfAnalysisResult>`
- `calculate_optimal_dpi(width_pt: f64) -> u32`
- `calculate_native_dpi(pdf_size: u64, page_count: u32, avg_width_pt: f64, avg_height_pt: f64) -> u32`

**Dependencies**:
- `pdfium-render`: PDF library for Rust
- `serde`: JSON serialization

---

### 2. PDF Rendering Module (`src-tauri/src/utils/pdf_renderer.rs`)

**Replaces**: `src/lib/pdf-renderer.ts`

**Responsibilities**:
- Render PDF pages to images at specific DPI
- Support streaming rendering for large PDFs
- Generate preview for single page
- Handle canvas setup (already working in Node.js with pdfjs)

**Key Functions**:
- `render_page(pdf_buffer: &[u8], page_num: u32, dpi: u32) -> Result<Vec<u8>>`
- `render_all_pages(pdf_buffer: &[u8], dpi: u32) -> Result<Vec<Vec<u8>>>`
- `render_page_preview(pdf_buffer: &[u8], page_num: u32, dpi: u32, format: ImageFormat, quality: u8) -> Result<Vec<u8>>`

**Dependencies**:
- `pdfium-render`: PDF rendering
- `image`: Image format conversions

**Note**: This is technically complex. Pdfium-render has backend options (pdfium-render-to-image or custom).

---

### 3. Image Processing Module (`src-tauri/src/utils/image_processor.rs`)

**Replaces**: Sharp (Node.js native module)

**Responsibilities**:
- Convert between image formats (JPEG, PNG)
- Apply quality/compression settings
- Resize images (for CBZ→PDF mode)
- Extract image metadata

**Key Functions**:
- `convert_image(input: &[u8], format: ImageFormat, quality: u8) -> Result<Vec<u8>>`
- `resize_image(input: &[u8], max_width: u32, max_height: u32) -> Result<Vec<u8>>`
- `get_image_info(input: &[u8]) -> Result<ImageInfo>`

**Dependencies**:
- `image`: Main image processing crate
- `jpeg`: JPEG encoding
- `png`: PNG encoding

---

### 4. Archive Module (`src-tauri/src/utils/archive.rs`)

**Replaces**: `archiver` (Node.js)

**Responsibilities**:
- Create ZIP archives (CBZ files)
- Extract files from ZIP archives (CBZ analysis)
- Add files to archives efficiently

**Key Functions**:
- `create_cbz(images: Vec<(String, Vec<u8>)>) -> Result<Vec<u8>>`
- `analyze_cbz(cbz_buffer: &[u8]) -> Result<CbzAnalysisResult>`

**Dependencies**:
- `zip`: ZIP file manipulation

---

### 5. PDF Creation Module (`src-tauri/src/utils/archive.rs` - same file)

**Replaces**: `pdf-lib` (Node.js)

**Responsibilities**:
- Create PDF documents
- Embed images in PDF
- Set page sizes based on image dimensions

**Key Functions**:
- `embed_images_as_pdf(images: Vec<(u32, Vec<u8>)>) -> Result<Vec<u8>>`

**Dependencies**:
- `printpdf`: PDF creation library for Rust

---

### 6. Tauri Commands Layer

**New**: All IPC endpoints between frontend and backend

**Tauri Commands** (in `src-tauri/src/commands/`):

```rust
// PDF Analysis
#[tauri::command]
async fn analyze_pdf(path: String) -> Result<PdfAnalysisResult, String>

// Preview Generation
#[tauri::command]
async fn generate_preview(path: String, page: u32, dpi: u32, format: String, quality: u8) -> Result<Vec<u8>, String>

// Direct Extraction
#[tauri::command]
async fn extract_images_from_pdf(path: String, callback: fn(current: u32, total: u32) -> void) -> Result<Vec<ExtractedImage>, String>

// PDF to CBZ Conversion
#[tauri::command]
async fn convert_pdf_to_cbz(
    path: String,
    dpi: u32,
    format: String,
    quality: u8,
    on_progress: impl Fn(ConversionProgress)
) -> Result<Vec<u8>, String>

// Auto-Optimization
#[tauri::command]
async fn optimize_conversion(path: String) -> Result<OptimizationResult, String>

// CBZ Analysis
#[tauri::command]
async fn analyze_cbz(path: String) -> Result<CbzAnalysisResult, String>

// CBZ to PDF Conversion
#[tauri::command]
async fn convert_cbz_to_pdf(
    path: String,
    quality: u8
) -> Result<Vec<u8>, String>

// File Operations (Tauri built-in)
#[tauri::command]
async fn save_file(buffer: Vec<u8>, filename: String) -> Result<String, String>

#[tauri::command]
async fn select_file(filters: Vec<String>) -> Result<String, String>
```

---

## Frontend-Backend Communication

### Request-Response Pattern

**Frontend (React)**:
```typescript
// Example: Analyze PDF
const result = await invoke('analyze_pdf', { path: filePath });

// Example: Convert with progress
const resultBuffer = await invoke('convert_pdf_to_cbz', {
  path: filePath,
  dpi: 150,
  format: 'jpeg',
  quality: 85
});
```

**Backend (Rust)**:
```rust
#[tauri::command]
async fn analyze_pdf(path: String) -> Result<PdfAnalysisResult, String> {
    // Load PDF
    // Analyze
    // Return result
}
```

### Event-Based Progress

For long-running operations, use Tauri events:

**Frontend**:
```typescript
const unlisten = await listen('conversion-progress', (event) => {
    console.log(event.payload); // { currentPage, totalPages, percentage }
});
```

**Backend**:
```rust
#[tauri::command]
async fn convert_pdf_to_cbz(
    path: String,
    app_handle: tauri::AppHandle,
    ...) -> Result<Vec<u8>, String> {

    for page_num in 1..=total_pages {
        app_handle.emit_all("conversion-progress", ConversionProgress {
            current_page: page_num,
            total_pages,
            percentage: (page_num as f64 / total_pages as f64 * 100.0) as u32,
        })?;
    }
}
```

---

## Data Models

### Rust Models (`src-tauri/src/models/`)

All models derive `Serialize, Deserialize` for IPC:

```rust
// PDF Analysis
#[derive(Serialize, Deserialize)]
pub struct PdfAnalysisResult {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
    pub recommended_dpi: u32,
    pub pdf_size_mb: f64,
    pub native_dpi: u32,
}

// Conversion Options
#[derive(Serialize, Deserialize)]
pub struct ConversionOptions {
    pub dpi: Option<u32>,
    pub format: ImageFormat, // "jpeg" | "png"
    pub quality: u8,
}

// Progress Events
#[derive(Serialize, Deserialize)]
pub struct ConversionProgress {
    pub current_page: u32,
    pub total_pages: u32,
    pub percentage: u32,
    pub message: String,
}

// ... others for CBZ, Optimization, etc.
```

### TypeScript Models (Frontend)

These match Rust models for type safety:

```typescript
// src/lib/models.ts (generated from Rust or hand-written)
interface PdfAnalysisResult {
    page_count: number;
    pages: PageInfo[];
    recommended_dpi: number;
    pdf_size_mb: number;
    native_dpi: number;
}
// ... others
```

---

## Dependencies Mapping

### Frontend Dependencies (Keep Most)

| Next.js Package | Tauri Equivalent | Status |
|---|---|---|
| `react` 19.2.3 | `react` 19.2.3 | ✅ SAME |
| `react-dom` 19.2.3 | `react-dom` 19.2.3 | ✅ SAME |
| `next` 16.1.1 | (removed) | ❌ REMOVE |
| `tailwindcss` 4 | `tailwindcss` 4 | ✅ SAME |
| `@tailwindcss/postcss` 4 | `@tailwindcss/postcss` 4 | ✅ SAME |
| `typescript` 5 | `typescript` 5 | ✅ SAME |
| `sharp` 0.34.5 | (removed) | ❌ REMOVE |
| `archiver` 7.0.1 | (removed) | ❌ REMOVE |
| `pdfjs-dist` 3.11.174 | (removed) | ❌ REMOVE |
| `pdf-lib` 1.17.1 | (removed) | ❌ REMOVE |
| `jszip` 3.10.1 | (removed) | ❌ REMOVE |
| `canvas` 3.2.0 | (removed) | ❌ REMOVE |
| `uuid` 13.0.0 | `uuid` 13.0.0 | ✅ SAME |

**New Frontend Dependencies**:
- `@tauri-apps/api`: Tauri IPC client
- `vite`: Build tool (replaces Next.js bundler)

### Rust Backend Dependencies (`Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2.0", features = ["all"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# PDF Processing
pdfium-render = "0.8"  # or pdfium-render-to-image

# Image Processing
image = "0.25"
jpeg = "0.3"  # Optional, if needed
png = "0.18"  # Optional, if needed

# Archive
zip = "0.7"

# PDF Creation
printpdf = "0.8"  # or lopdf for lower-level PDF creation

# Utilities
uuid = { version = "1", features = ["v4", "serde"] }
thiserror = "1"  # Error handling
anyhow = "1"     # Error handling
tracing = "0.1"  # Logging
tracing-subscriber = "0.3"
```

---

## Build & Deployment Strategy

### Development Build

```bash
# Install Tauri CLI
npm install -g @tauri-apps/cli

# Development server (hot reload)
npm run tauri dev

# This:
# 1. Starts Vite dev server (frontend)
# 2. Compiles Rust backend in debug mode
# 3. Opens Tauri window with hot reload
```

### Production Build

```bash
# Build command
npm run tauri build

# Creates:
# - Windows: .exe installer + portable
# - macOS: .dmg + .app bundle
# - Linux: .AppImage + .deb + .rpm
```

### Code Signing & Distribution

- **macOS**: Required for distribution. Use developer certificates.
- **Windows**: Optional but recommended (SmartScreen detection).
- **Linux**: Distribute via package managers or AppImage.

---

## Performance Considerations

### Backend Performance

1. **PDF Rendering**
   - Use pdfium-render (likely faster than pdfjs + node-canvas combo)
   - Cache rendered pages during optimization phase
   - Stream pages to avoid memory issues

2. **Image Processing**
   - Use Rust `image` crate (compiled, faster than Sharp)
   - Batch process where possible
   - Estimate vs. actual sizing: use sample pages (20%, 40%, 60% of document)

3. **File Operations**
   - Direct file I/O (no web layer overhead)
   - Stream large files instead of loading into memory

### Frontend Performance

1. **State Management**
   - React Context or Zustand for simpler state
   - Avoid unnecessary re-renders
   - Use React.memo for preview images

2. **Asset Loading**
   - Vite handles tree-shaking better than Next.js
   - Smaller bundle size expected (~2-3MB vs 5-10MB Next.js)

---

## Security Considerations

### IPC Security

- Validate all inputs in Rust backend
- Use TypeScript types on frontend for compile-time safety
- Limit file operations to user-selected files (use native file dialogs)

### File Operations

- Use Tauri's built-in file dialogs (sandboxed)
- No arbitrary file access (user must select files)
- Sanitize filenames in output

### Binary Distribution

- Code signing for macOS/Windows
- Use Tauri's secure update mechanism for future versions

---

## Next Steps

1. **Set up Tauri project structure** - Follow `IMPLEMENTATION_GUIDE.md`
2. **Implement Rust backend modules** - Follow `RUST_IMPLEMENTATION.md`
3. **Adapt frontend code** - Follow `MIGRATION_GUIDE.md`
4. **Integration & testing** - Follow `TESTING.md`
5. **Build & package** - Native installers for all platforms
