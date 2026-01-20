# Frontend Migration Guide - Next.js to Tauri

## Overview

The frontend (React components) requires minimal changes when migrating from Next.js to Tauri. This guide covers the adaptation layer between web APIs and Tauri desktop APIs.

---

## Key Differences

| Aspect | Next.js | Tauri |
|--------|---------|-------|
| **API Calls** | `fetch('/api/...')` | `invoke('command_name', {...})` |
| **File Access** | Form submission | Tauri file dialog API |
| **File Download** | Browser download | Direct file save with dialog |
| **Routing** | Next.js App Router | Manual page state management |
| **Build Tool** | Next.js Server | Vite |
| **Server** | Node.js backend | Rust backend |
| **Environment** | Web browser | Native desktop window |

---

## Step 1: Update API Call Patterns

### Converting fetch() to invoke()

**Original (Next.js)**:
```typescript
// src/app/page.tsx
const response = await fetch('/api/analyze', {
  method: 'POST',
  body: formData,
})

const data = await response.json()
if (!response.ok) {
  throw new Error(data.error || 'Analysis failed')
}
```

**New (Tauri)**:
```typescript
// src/pages/page.tsx
import { analyzePdf } from '@/lib/tauri-client'

const data = await analyzePdf(filePath)
// Error is already thrown if failed
```

### File Selection Pattern

**Original (Next.js)**:
```typescript
// Uses HTML input[type="file"]
const fileInputRef = useRef<HTMLInputElement>(null)

const handleClick = () => {
  fileInputRef.current?.click()
}

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  // Process file (already in memory as Blob)
}

return (
  <>
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf"
      onChange={handleFileChange}
    />
    <button onClick={handleClick}>Upload</button>
  </>
)
```

**New (Tauri)**:
```typescript
// Uses Tauri file dialog
import { selectFile } from '@/lib/tauri-client'

const handleClick = async () => {
  const filePath = await selectFile()
  if (filePath) {
    // filePath is a string (full path)
    handleFileSelect(filePath)
  }
}

// Remove the input element entirely
return (
  <button onClick={handleClick}>Upload</button>
)
```

### File Download/Save Pattern

**Original (Next.js)**:
```typescript
// Browser handles download
const blob = await response.blob()
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'output.cbz'
document.body.appendChild(a)
a.click()
document.body.removeChild(a)
URL.revokeObjectURL(url)
```

**New (Tauri)**:
```typescript
// Direct save with Tauri dialog
import { saveFile } from '@/lib/tauri-client'

const buffer = await convertPdfToCbz(filePath, options)
const saved = await saveFile(buffer, 'output.cbz')
if (saved) {
  console.log(`Saved to: ${saved}`)
}
```

---

## Step 2: Create Tauri Client Wrapper

**Complete implementation** of `src/lib/tauri-client.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { dialog } from '@tauri-apps/api'

// ============================================================================
// Type Definitions (matching Rust backend)
// ============================================================================

export interface ConversionProgress {
  currentPage: number
  totalPages: number
  percentage: number
  status: 'processing' | 'completed' | 'error'
  message?: string
}

export interface PageInfo {
  pageNumber: number
  widthPt: number
  heightPt: number
  widthPx: number
  heightPx: number
}

export interface PdfAnalysisResult {
  pageCount: number
  pages: PageInfo[]
  recommendedDpi: number
  pdfSizeMB: number
  nativeDpi: number
}

export interface CbzPageInfo {
  pageNumber: number
  fileName: string
  width: number
  height: number
  format: string
  sizeKB: number
}

export interface CbzAnalysisResult {
  pageCount: number
  pages: CbzPageInfo[]
  cbzSizeMB: number
}

export interface ExtractedImage {
  pageNum: number
  width: number
  height: number
  format: 'jpeg' | 'png'
  data: number[] // Serialized Uint8Array
  sizeKB: number
}

export interface OptimalParams {
  dpi: number
  format: 'jpeg' | 'png'
  quality: number
  estimatedSizeMB: number
  sizeRatio: number
  qualityScore: number
  reason: string
}

// ============================================================================
// File Operations
// ============================================================================

export async function selectFile(
  title: string = 'Select a file',
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<string | null> {
  try {
    const result = await dialog.open({
      title,
      multiple: false,
      filters: filters || [
        { name: 'PDF files', extensions: ['pdf'] },
        { name: 'CBZ files', extensions: ['cbz'] },
      ],
    })

    return Array.isArray(result) ? result[0] || null : result
  } catch (error) {
    console.error('File selection error:', error)
    return null
  }
}

export async function saveFile(
  buffer: ArrayBuffer,
  defaultFileName: string
): Promise<string | null> {
  try {
    const path = await dialog.save({
      defaultPath: defaultFileName,
      filters: [
        defaultFileName.endsWith('.cbz')
          ? { name: 'CBZ files', extensions: ['cbz'] }
          : { name: 'PDF files', extensions: ['pdf'] },
      ],
    })

    if (!path) return null

    // Convert ArrayBuffer to byte array for Tauri
    const uint8Array = new Uint8Array(buffer)
    const data = Array.from(uint8Array)

    // Invoke Rust command to save file
    await invoke('save_file', {
      data,
      fileName: path,
    })

    return path
  } catch (error) {
    console.error('File save error:', error)
    return null
  }
}

// ============================================================================
// PDF Operations
// ============================================================================

export async function analyzePdf(path: string): Promise<PdfAnalysisResult> {
  try {
    const result = await invoke<PdfAnalysisResult>('analyze_pdf', {
      path,
    })
    return result
  } catch (error) {
    throw new Error(
      `PDF analysis failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function generatePreview(
  path: string,
  page: number,
  dpi: number,
  format: 'jpeg' | 'png',
  quality: number
): Promise<ArrayBuffer> {
  try {
    // Rust returns Vec<u8>, convert to ArrayBuffer
    const result = await invoke<number[]>('generate_preview', {
      path,
      page,
      dpi,
      format,
      quality,
    })

    return new Uint8Array(result).buffer
  } catch (error) {
    throw new Error(
      `Preview generation failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function extractImagesFromPdf(
  path: string
): Promise<ExtractedImage[]> {
  try {
    const result = await invoke<ExtractedImage[]>('extract_images_from_pdf', {
      path,
    })
    return result
  } catch (error) {
    throw new Error(
      `Image extraction failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function convertPdfToCbz(
  path: string,
  dpi: number,
  format: 'jpeg' | 'png',
  quality: number,
  onProgress?: (progress: ConversionProgress) => void
): Promise<ArrayBuffer> {
  try {
    let unlistener: UnlistenFn | null = null

    // Listen for progress events
    if (onProgress) {
      unlistener = await listen<ConversionProgress>(
        'conversion-progress',
        (event) => {
          onProgress(event.payload)
        }
      )
    }

    try {
      const result = await invoke<number[]>('convert_pdf_to_cbz', {
        path,
        dpi,
        format,
        quality,
      })

      return new Uint8Array(result).buffer
    } finally {
      if (unlistener) {
        unlistener()
      }
    }
  } catch (error) {
    throw new Error(
      `PDF to CBZ conversion failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function optimizeConversion(
  path: string
): Promise<OptimalParams> {
  try {
    const result = await invoke<OptimalParams>('optimize_conversion', {
      path,
    })
    return result
  } catch (error) {
    throw new Error(
      `Optimization failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// ============================================================================
// CBZ Operations
// ============================================================================

export async function analyzeCbz(path: string): Promise<CbzAnalysisResult> {
  try {
    const result = await invoke<CbzAnalysisResult>('analyze_cbz', {
      path,
    })
    return result
  } catch (error) {
    throw new Error(
      `CBZ analysis failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function convertCbzToPdf(
  path: string,
  quality: number,
  onProgress?: (progress: ConversionProgress) => void
): Promise<ArrayBuffer> {
  try {
    let unlistener: UnlistenFn | null = null

    if (onProgress) {
      unlistener = await listen<ConversionProgress>(
        'conversion-progress',
        (event) => {
          onProgress(event.payload)
        }
      )
    }

    try {
      const result = await invoke<number[]>('convert_cbz_to_pdf', {
        path,
        quality,
      })

      return new Uint8Array(result).buffer
    } finally {
      if (unlistener) {
        unlistener()
      }
    }
  } catch (error) {
    throw new Error(
      `CBZ to PDF conversion failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
```

---

## Step 3: Update Main Page Component

**Key changes to `src/pages/page.tsx`** (from `../pdf-to-cbz-nextjs/src/app/page.tsx`):

### 1. Remove Next.js imports

```typescript
// ✗ Remove
import Link from 'next/link'  // Next.js routing
import { useRouter } from 'next/navigation'  // Next.js routing

// ✓ Keep
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from '@/lib/useTranslation'
import LanguageSelector from '@/components/LanguageSelector'
```

### 2. Replace file upload handling

```typescript
// ✗ Before (HTML file input)
const fileInputRef = useRef<HTMLInputElement>(null)

const handleFileSelect = useCallback(async (selectedFile: File) => {
  // selectedFile is already in memory as Blob
}, [])

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (file) handleFileSelect(file)
}

return (
  <input
    ref={fileInputRef}
    type="file"
    accept=".pdf"
    onChange={handleChange}
    className="hidden"
  />
)

// ✓ After (Tauri file dialog)
const handleSelectFile = useCallback(async () => {
  const filePath = await selectFile(
    'Select PDF or CBZ file',
    [
      { name: 'PDF files', extensions: ['pdf'] },
      { name: 'CBZ files', extensions: ['cbz'] },
    ]
  )

  if (filePath) {
    handleFileSelect(filePath)  // Now filePath is a string
  }
}, [])

return (
  <button
    onClick={handleSelectFile}
    className="border-2 border-dashed rounded-lg p-4"
  >
    Select File
  </button>
)
```

### 3. Update file handling logic

```typescript
// ✗ Before
const handleFileSelect = useCallback(async (selectedFile: File) => {
  const fileName = selectedFile.name.toLowerCase()
  const isPdf = fileName.endsWith('.pdf')
  const isCbz = fileName.endsWith('.cbz')

  setFile(selectedFile)  // Store File object

  try {
    const formData = new FormData()
    formData.append('file', selectedFile)
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    })
    // ...
  } catch (err) {
    setError(err.message)
  }
}, [])

// ✓ After
interface FileInfo {
  path: string
  name: string
}

const [file, setFile] = useState<FileInfo | null>(null)

const handleFileSelect = useCallback(async (filePath: string) => {
  const fileName = filePath.split('/').pop() || ''
  const isPdf = fileName.toLowerCase().endsWith('.pdf')
  const isCbz = fileName.toLowerCase().endsWith('.cbz')

  if (!isPdf && !isCbz) {
    setError('Please select a PDF or CBZ file')
    return
  }

  setFile({ path: filePath, name: fileName })
  setAnalysis(null)
  setError(null)

  setIsAnalyzing(true)
  try {
    const endpoint = isPdf ? 'analyzePdf' : 'analyzeCbz'
    const data = isPdf
      ? await analyzePdf(filePath)
      : await analyzeCbz(filePath)

    setAnalysis(data)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Analysis failed')
  } finally {
    setIsAnalyzing(false)
  }
}, [])
```

### 4. Update conversion logic

```typescript
// ✗ Before
const handleConvert = useCallback(async () => {
  if (!file || !analysis) return

  setIsConverting(true)
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dpi', effectiveDpi.toString())
    formData.append('format', format)
    formData.append('quality', quality.toString())

    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData,
    })

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    // Download blob using browser API
  } catch (err) {
    setError(err.message)
  }
}, [file, analysis, effectiveDpi, format, quality])

// ✓ After
const handleConvert = useCallback(async () => {
  if (!file || !analysis) return

  setIsConverting(true)
  setConversionProgress(0)
  setConversionStatus('Starting conversion...')

  try {
    const buffer = await convertPdfToCbz(
      file.path,
      effectiveDpi,
      format,
      quality,
      (progress) => {
        setConversionProgress(progress.percentage)
        setConversionStatus(progress.message || '')
      }
    )

    // Save using Tauri dialog
    const baseName = file.name.replace(/\.(pdf|cbz)$/i, '')
    const outputName = `${baseName}.cbz`

    const savedPath = await saveFile(buffer, outputName)
    if (savedPath) {
      setConversionProgress(100)
      setConversionStatus(`Saved to: ${savedPath}`)
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Conversion failed')
    setConversionProgress(0)
  } finally {
    setIsConverting(false)
  }
}, [file, analysis, effectiveDpi, format, quality])
```

### 5. Update preview generation

```typescript
// ✗ Before
const loadPreview = useCallback(async (pdfFile: File, page: number, ...) => {
  const formData = new FormData()
  formData.append('file', pdfFile)
  formData.append('page', page.toString())

  const response = await fetch('/api/preview', {
    method: 'POST',
    body: formData,
  })

  const blob = await response.blob()
  setPreviewUrl(URL.createObjectURL(blob))
}, [])

// ✓ After
const loadPreview = useCallback(
  async (filePath: string, page: number, dpi: number, fmt: 'jpeg' | 'png', q: number) => {
    setIsPreviewLoading(true)
    try {
      const buffer = await generatePreview(filePath, page, dpi, fmt, q)
      const blob = new Blob([buffer], {
        type: fmt === 'jpeg' ? 'image/jpeg' : 'image/png',
      })
      setPreviewUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setIsPreviewLoading(false)
    }
  },
  []
)
```

### 6. Update batch mode navigation

```typescript
// ✗ Before (Next.js Link)
import Link from 'next/link'

return (
  <Link href="/batch" className="...">
    {t('batchMode')}
  </Link>
)

// ✓ After (State-based routing in Tauri)
// In App.tsx
export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'batch'>('home')

  return (
    <div>
      {currentPage === 'home' ? (
        <Home
          onBatchClick={() => setCurrentPage('batch')}
        />
      ) : (
        <Batch
          onBackClick={() => setCurrentPage('home')}
        />
      )}
    </div>
  )
}

// In page.tsx
export default function Home({ onBatchClick }: { onBatchClick: () => void }) {
  return (
    <>
      {/* ... */}
      <button onClick={onBatchClick} className="...">
        {t('batchMode')}
      </button>
    </>
  )
}
```

---

## Step 4: Update Batch Component

Similar changes to `src/pages/batch.tsx` (from `../pdf-to-cbz-nextjs/src/app/batch/page.tsx`):

1. Replace file upload with Tauri dialogs
2. Replace API calls with Tauri invocations
3. Replace Next.js Link with callback functions
4. Remove server-side components (`'use server'`)

---

## Step 5: Create Adapter Components (Optional)

For complex state management, create custom hooks:

**src/hooks/useTauriApi.ts**:
```typescript
import { useState, useCallback } from 'react'
import * as tauriClient from '@/lib/tauri-client'

export function usePdfAnalysis() {
  const [analysis, setAnalysis] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async (path: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await tauriClient.analyzePdf(path)
      setAnalysis(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { analysis, isLoading, error, analyze }
}

export function useFileSelect() {
  const [file, setFile] = useState<string | null>(null)

  const selectFile = useCallback(async () => {
    try {
      const path = await tauriClient.selectFile()
      setFile(path)
      return path
    } catch (err) {
      console.error('File selection error:', err)
      return null
    }
  }, [])

  return { file, selectFile }
}
```

---

## Step 6: Update TypeScript Configuration

**tsconfig.json** - ensure paths are configured:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## Common Pitfalls & Solutions

| Issue | Solution |
|-------|----------|
| `invoke()` is not defined | Ensure `@tauri-apps/api` is installed: `npm install @tauri-apps/api` |
| File paths are null | Check user didn't cancel dialog; dialog returns `null` on cancel |
| Binary data not serializable | Use `Array.from(uint8Array)` when sending to Rust; Rust returns `Vec<u8>` |
| ArrayBuffer issues | Convert: `new Uint8Array(arrayBuffer)` for processing |
| Component props mismatch | Add `onBatchClick` callback prop to Home component |
| Styles not loading | Ensure `globals.css` is imported in `main.tsx` |

---

## Testing Migration

### Before Running Full App

1. **Test Tauri setup**:
```bash
npm run tauri dev
# Verify window opens
```

2. **Test file dialog**:
```typescript
const path = await selectFile()
console.log('Selected:', path)
```

3. **Test API calls**:
```typescript
const analysis = await analyzePdf(filePath)
console.log('Analysis:', analysis)
```

4. **Test conversion**:
```typescript
const buffer = await convertPdfToCbz(...)
// Verify buffer is not empty
```

---

## See Also

- `IMPLEMENTATION_GUIDE.md` - Project setup steps
- `ARCHITECTURE.md` - Overall design
- `RUST_IMPLEMENTATION.md` - Backend details
- `TESTING.md` - Integration testing guide
