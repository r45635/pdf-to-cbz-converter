# Implementation Guide - PDF to CBZ Converter Tauri

## Phase 1: Project Setup

### 1.1 Initialize Tauri Project

```bash
# Navigate to parent directory
cd /path/to/pdf-to-cbz-converter

# Create new Tauri project
npm create tauri-app@latest pdf-to-cbz-tauri -- \
  --manager npm \
  --ui react \
  --typescript \
  --template react-ts \
  --ci skip

cd pdf-to-cbz-tauri
```

This creates the standard Tauri + React + TypeScript structure:
```
pdf-to-cbz-tauri/
├── src/                 # React frontend
├── src-tauri/          # Rust backend
├── package.json        # Frontend + Tauri CLI
├── vite.config.ts      # Vite config
└── ...
```

### 1.2 Update package.json

**Current state** (after `npm create tauri-app`):
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.x",
    "@tauri-apps/plugin-shell": "^2.x",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.x",
    "typescript": "^5",
    "vite": "^6"
  }
}
```

**Modify to**:
```bash
# Remove unnecessary default packages (if any)
npm uninstall @tauri-apps/plugin-shell

# Add needed packages
npm install \
  @tauri-apps/api \
  tailwindcss \
  postcss \
  autoprefixer \
  uuid

npm install --save-dev \
  @tailwindcss/postcss \
  eslint \
  eslint-config-next \
  @types/uuid
```

**Final package.json**:
```json
{
  "name": "pdf-to-cbz-tauri",
  "version": "2.5.0",
  "type": "module",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "build:ui": "vite build",
    "lint": "eslint"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/uuid": "^10.0.0",
    "@vite/plugin-react": "^4",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vite": "^6",
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

### 1.3 Setup Build Configuration

**vite.config.ts** (should be pre-generated, verify):
```typescript
import { defineConfig } from 'vite'
import react from '@vite/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'ES2020',
    minify: 'terser',
  },
})
```

**tsconfig.json** (verify/update):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "jsx": "react-jsx",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "./tsconfig.node.json" }
  ]
}
```

**tailwind.config.js** (from original Next.js project):
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**postcss.config.js**:
```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

### 1.4 Setup Tauri Configuration

**src-tauri/tauri.conf.json** (update from template):

```json
{
  "productName": "PDF to CBZ Converter",
  "version": "2.5.0",
  "identifier": "com.pdf-to-cbz.converter",
  "build": {
    "beforeDevCommand": "npm run build:ui",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "PDF to CBZ Converter",
        "width": 1400,
        "height": 900,
        "minWidth": 1000,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": [
      "msi",
      "nsis",
      "dmg",
      "app",
      "appimage",
      "deb",
      "rpm"
    ],
    "macOS": {
      "signingIdentity": null,
      "entitlements": null
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "signingIdentity": null,
      "timestampUrl": ""
    }
  }
}
```

### 1.5 Setup Cargo Configuration

**src-tauri/Cargo.toml**:

```toml
[package]
name = "pdf-to-cbz-converter"
version = "2.5.0"
description = "PDF to CBZ Converter"
authors = ["Your Name"]
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["all"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# PDF Processing
pdfium-render = "0.8"

# Image Processing
image = "0.25"

# Archive
zip = "0.7"

# PDF Creation
printpdf = "0.8"
lopdf = "28"

# Utilities
uuid = { version = "1", features = ["v4", "serde"] }
thiserror = "1"
anyhow = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
rayon = "1"  # For parallel processing

[build-dependencies]
tauri-build = "2"
```

---

## Phase 2: Frontend Migration

### 2.1 Copy Components from Next.js

Copy all files from `../pdf-to-cbz-nextjs/src/` to `src/`:

```bash
# From pdf-to-cbz-tauri directory
cp -r ../pdf-to-cbz-nextjs/src/components src/components
cp -r ../pdf-to-cbz-nextjs/src/lib src/lib
cp ../pdf-to-cbz-nextjs/src/app/layout.tsx src/
cp ../pdf-to-cbz-nextjs/src/app/page.tsx src/pages/
cp ../pdf-to-cbz-nextjs/src/app/batch/page.tsx src/pages/batch.tsx
cp ../pdf-to-cbz-nextjs/src/app/globals.css src/styles/
```

### 2.2 Create New Entry Point for Tauri

**src/main.tsx** (NEW - replaces Next.js):
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**src/App.tsx** (NEW):
```typescript
import { useEffect, useState } from 'react'
import { appWindow } from '@tauri-apps/api/window'
import Home from './pages/page'
import Batch from './pages/batch'

function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'batch'>('home')

  useEffect(() => {
    // Initialize app
    appWindow.show()
  }, [])

  return (
    <div>
      {currentPage === 'home' ? (
        <Home onBatchClick={() => setCurrentPage('batch')} />
      ) : (
        <Batch onBackClick={() => setCurrentPage('home')} />
      )}
    </div>
  )
}

export default App
```

### 2.3 Create Tauri IPC Wrapper

**src/lib/tauri-client.ts** (NEW):
```typescript
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface ConversionProgress {
  currentPage: number
  totalPages: number
  percentage: number
  status: 'processing' | 'completed' | 'error'
  message?: string
}

export interface PdfAnalysisResult {
  pageCount: number
  pages: Array<{
    pageNumber: number
    widthPt: number
    heightPt: number
    widthPx: number
    heightPx: number
  }>
  recommendedDpi: number
  pdfSizeMB: number
  nativeDpi: number
}

export interface CbzAnalysisResult {
  pageCount: number
  pages: Array<{
    pageNumber: number
    fileName: string
    width: number
    height: number
    format: string
    sizeKB: number
  }>
  cbzSizeMB: number
}

// PDF Operations
export async function analyzePdf(path: string): Promise<PdfAnalysisResult> {
  return invoke('analyze_pdf', { path })
}

export async function generatePreview(
  path: string,
  page: number,
  dpi: number,
  format: 'jpeg' | 'png',
  quality: number
): Promise<ArrayBuffer> {
  const result = await invoke<number[]>('generate_preview', {
    path,
    page,
    dpi,
    format,
    quality,
  })
  return new Uint8Array(result).buffer
}

export async function convertPdfToCbz(
  path: string,
  dpi: number,
  format: 'jpeg' | 'png',
  quality: number,
  onProgress?: (progress: ConversionProgress) => void
): Promise<ArrayBuffer> {
  if (onProgress) {
    const unlisten = await listen('conversion-progress', (event) => {
      onProgress(event.payload as ConversionProgress)
    })
    // Note: You need to unlisten after conversion completes
  }

  const result = await invoke<number[]>('convert_pdf_to_cbz', {
    path,
    dpi,
    format,
    quality,
  })
  return new Uint8Array(result).buffer
}

// CBZ Operations
export async function analyzeCbz(path: string): Promise<CbzAnalysisResult> {
  return invoke('analyze_cbz', { path })
}

export async function convertCbzToPdf(
  path: string,
  quality: number
): Promise<ArrayBuffer> {
  const result = await invoke<number[]>('convert_cbz_to_pdf', { path, quality })
  return new Uint8Array(result).buffer
}

// File Operations
export async function selectFile(
  defaultPath?: string
): Promise<string | null> {
  try {
    return await invoke('select_file', { defaultPath })
  } catch {
    return null
  }
}

export async function saveFile(
  buffer: ArrayBuffer,
  defaultFileName: string
): Promise<string | null> {
  try {
    const uint8Array = new Uint8Array(buffer)
    return await invoke('save_file', {
      data: Array.from(uint8Array),
      fileName: defaultFileName
    })
  } catch {
    return null
  }
}
```

### 2.4 Adapt Frontend Components

**Update `src/pages/page.tsx`** (from `app/page.tsx`):

Key changes:
1. Remove Next.js specific imports
2. Replace API calls with Tauri invocations
3. Update file dialogs to use Tauri

```typescript
// Before (Next.js)
const response = await fetch('/api/analyze', {
  method: 'POST',
  body: formData,
})

// After (Tauri)
import { analyzePdf } from '@/lib/tauri-client'
const analysis = await analyzePdf(filePath)
```

### 2.5 Add Platform Detection Hook

**src/hooks/usePlatform.ts** (NEW):
```typescript
import { useEffect, useState } from 'react'
import { platform } from '@tauri-apps/plugin-os'

export function usePlatform() {
  const [os, setOs] = useState<string>('')
  const [arch, setArch] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      setOs(await platform())
      // setArch(await arch()) if available
    })()
  }, [])

  return { os, arch }
}
```

---

## Phase 3: Rust Backend Implementation

### 3.1 Create Module Structure

**src-tauri/src/lib.rs**:
```rust
pub mod commands;
pub mod models;
pub mod utils;

pub use commands::*;
pub use models::*;
pub use utils::*;
```

### 3.2 Create Models Module

**src-tauri/src/models/mod.rs**:
```rust
pub mod pdf;
pub mod cbz;
pub mod conversion;

pub use pdf::*;
pub use cbz::*;
pub use conversion::*;
```

**src-tauri/src/models/pdf.rs**:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct PageInfo {
    pub page_number: u32,
    pub width_pt: f64,
    pub height_pt: f64,
    pub width_px: u32,
    pub height_px: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct PdfAnalysisResult {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
    pub recommended_dpi: u32,
    pub pdf_size_mb: f64,
    pub native_dpi: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ConversionProgress {
    pub current_page: u32,
    pub total_pages: u32,
    pub percentage: u32,
    pub status: String, // "processing" | "completed" | "error"
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ExtractedImage {
    pub page_num: u32,
    pub width: u32,
    pub height: u32,
    pub format: String, // "jpeg" | "png"
    pub data: Vec<u8>,
    pub size_kb: u32,
}
```

**src-tauri/src/models/cbz.rs**:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct CbzPageInfo {
    pub page_number: u32,
    pub file_name: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_kb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct CbzAnalysisResult {
    pub page_count: u32,
    pub pages: Vec<CbzPageInfo>,
    pub cbz_size_mb: f64,
}
```

**src-tauri/src/models/conversion.rs**:
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct ConversionOptions {
    pub dpi: Option<u32>,
    pub format: String, // "jpeg" | "png"
    pub quality: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde")]
pub struct OptimalParams {
    pub dpi: u32,
    pub format: String,
    pub quality: u8,
    pub estimated_size_mb: f64,
    pub size_ratio: f64,
    pub quality_score: u8,
    pub reason: String,
}
```

### 3.3 Create Commands Module

**src-tauri/src/commands/mod.rs**:
```rust
pub mod pdf_analysis;
pub mod conversion;
pub mod preview;
pub mod extraction;
pub mod optimization;

pub use pdf_analysis::*;
pub use conversion::*;
pub use preview::*;
pub use extraction::*;
pub use optimization::*;
```

See `RUST_IMPLEMENTATION.md` for detailed implementations of each command module.

### 3.4 Create Utils Module

**src-tauri/src/utils/mod.rs**:
```rust
pub mod pdf_renderer;
pub mod image_processor;
pub mod archive;
pub mod estimation;

pub use pdf_renderer::*;
pub use image_processor::*;
pub use archive::*;
pub use estimation::*;
```

See `RUST_IMPLEMENTATION.md` for detailed implementations.

### 3.5 Update Main.rs

**src-tauri/src/main.rs**:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod utils;

use tauri::{Manager, RunEvent, Runtime};

fn main() {
    tauri::Builder::default()
        // Register all commands
        .invoke_handler(tauri::generate_handler![
            commands::analyze_pdf,
            commands::generate_preview,
            commands::convert_pdf_to_cbz,
            commands::extract_images_from_pdf,
            commands::analyze_cbz,
            commands::convert_cbz_to_pdf,
            commands::select_file,
            commands::save_file,
            // ... others
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.get_webview_window("main").unwrap().open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## Phase 4: Integration Testing

### 4.1 Test File Selection

```bash
npm run tauri dev
# 1. Click "Upload PDF"
# 2. Verify file dialog opens
# 3. Select a test PDF
# 4. Verify file path is captured
```

### 4.2 Test PDF Analysis

```bash
# After selecting file, verify:
# 1. Page count matches actual PDF
# 2. File size displayed correctly
# 3. DPI recommendations appear
```

### 4.3 Test Preview Generation

```bash
# 1. Adjust settings (DPI, format, quality)
# 2. Verify preview updates
# 3. Check preview quality matches settings
```

### 4.4 Test Conversion

```bash
# 1. Click "Convert" button
# 2. Verify progress updates
# 3. Verify output file is saved
# 4. Open output and verify content
```

---

## Phase 5: Building & Packaging

### 5.1 Development Build

```bash
npm run tauri dev
```

### 5.2 Production Build

```bash
# Build for current platform
npm run tauri build

# Output locations:
# - Windows: src-tauri/target/release/bundle/msi/ + nsis/
# - macOS: src-tauri/target/release/bundle/dmg/ + app/
# - Linux: src-tauri/target/release/bundle/appimage/ + deb/
```

### 5.3 Cross-Platform Building

Use GitHub Actions or local setup to build for all platforms:

**For macOS on Apple Silicon**:
```bash
# Ensure rust is updated
rustup update
# Target x86_64 (Intel):
rustup target add x86_64-apple-darwin
npm run tauri build -- --target x86_64-apple-darwin
# Target aarch64 (Apple Silicon):
rustup target add aarch64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin
```

---

## Phase 6: Performance Optimization

### 6.1 Rust Backend Optimization

- Use `release` build (not debug)
- Enable LTO (Link Time Optimization)
- Parallel processing with `rayon`

**src-tauri/Cargo.toml**:
```toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

### 6.2 Frontend Optimization

- Tree-shaking enabled in Vite
- Image caching for previews
- Lazy load batch components

### 6.3 Memory Management

- Stream large file processing
- Clear image buffers after use
- Limit concurrent conversions

---

## Troubleshooting Common Issues

| Issue | Solution |
|-------|----------|
| Tauri CLI not found | `npm install -g @tauri-apps/cli@next` |
| Rust compilation errors | `rustup update` then clean build `cargo clean` |
| File dialog doesn't work | Ensure Tauri permission for file dialogs is granted |
| Progress events not received | Check event name matches between Rust emitter and TypeScript listener |
| PDF rendering fails | Verify pdfium-render backend is properly initialized |
| Large PDFs cause OOM | Implement chunked/streaming processing |

---

## Next Steps

1. Follow `RUST_IMPLEMENTATION.md` for detailed backend coding
2. Follow `MIGRATION_GUIDE.md` for frontend adapter patterns
3. Follow `TESTING.md` for comprehensive testing strategy
4. Refer to `ARCHITECTURE.md` for design decisions
