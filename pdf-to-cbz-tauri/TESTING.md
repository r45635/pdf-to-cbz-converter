# Testing Guide - PDF to CBZ Converter Tauri

## Testing Strategy

This document describes comprehensive testing approach at all levels: unit tests (Rust), integration tests (frontend), and end-to-end tests (full app).

---

## Part 1: Unit Tests (Rust Backend)

### Setup

Tests run with: `cargo test`

### 1.1 PDF Analysis Module Tests

**src-tauri/src/commands/pdf_analysis.rs**:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_optimal_dpi() {
        // 8.5 inch width (letter)
        let dpi = calculate_optimal_dpi(8.5 * 72.0);
        assert!(dpi >= 150 && dpi <= 250);
    }

    #[test]
    fn test_calculate_native_dpi() {
        // 100 pages, 1 MB total
        let dpi = calculate_native_dpi(
            1_000_000,
            100,
            612.0,  // 8.5 inches at 72 DPI
            792.0,  // 11 inches at 72 DPI
        );
        assert!(dpi >= 72 && dpi <= 600);
    }

    #[tokio::test]
    async fn test_analyze_pdf_valid() {
        // Requires test PDF file
        let result = analyze_pdf("test_data/sample.pdf".to_string()).await;
        assert!(result.is_ok());

        let analysis = result.unwrap();
        assert!(analysis.page_count > 0);
        assert!(!analysis.pages.is_empty());
        assert!(analysis.recommended_dpi >= 72);
        assert!(analysis.native_dpi >= 72);
    }

    #[tokio::test]
    async fn test_analyze_pdf_not_found() {
        let result = analyze_pdf("nonexistent.pdf".to_string()).await;
        assert!(result.is_err());
    }
}
```

### 1.2 Image Processing Module Tests

**src-tauri/src/utils/image_processor.rs**:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_image_jpeg() {
        // Create simple test image
        let test_img = image::ImageBuffer::from_pixel(
            100, 100,
            image::Rgba([255, 0, 0, 255])
        );

        let mut buffer = Vec::new();
        image::ImageRgba8(test_img).write_to(
            &mut buffer,
            image::ImageOutputFormat::PNG
        ).unwrap();

        let result = convert_image(
            &buffer,
            ImageFormat::Jpeg,
            85
        );

        assert!(result.is_ok());
        assert!(!result.unwrap().is_empty());
    }

    #[test]
    fn test_resize_image() {
        let test_img = image::ImageBuffer::from_pixel(
            1000, 1000,
            image::Rgba([255, 0, 0, 255])
        );

        let mut buffer = Vec::new();
        image::ImageRgba8(test_img).write_to(
            &mut buffer,
            image::ImageOutputFormat::PNG
        ).unwrap();

        let result = resize_image(&buffer, 500, 500);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_image_info() {
        let test_img = image::ImageBuffer::from_pixel(
            200, 300,
            image::Rgba([255, 0, 0, 255])
        );

        let mut buffer = Vec::new();
        image::ImageRgba8(test_img).write_to(
            &mut buffer,
            image::ImageOutputFormat::PNG
        ).unwrap();

        let result = get_image_info(&buffer);
        assert!(result.is_ok());

        let info = result.unwrap();
        assert_eq!(info.width, 200);
        assert_eq!(info.height, 300);
    }
}
```

### 1.3 Archive Module Tests

**src-tauri/src/utils/archive.rs**:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_cbz() {
        // Create dummy image data
        let images = vec![
            ("page_001.jpg".to_string(), vec![0xFF, 0xD8, 0xFF]), // JPEG header
            ("page_002.jpg".to_string(), vec![0xFF, 0xD8, 0xFF]),
        ];

        let result = create_cbz(images);
        assert!(result.is_ok());

        let cbz_data = result.unwrap();
        assert!(!cbz_data.is_empty());

        // Verify it's a valid ZIP
        use zip::ZipArchive;
        use std::io::Cursor;

        let archive = ZipArchive::new(Cursor::new(&cbz_data));
        assert!(archive.is_ok());
    }

    #[tokio::test]
    async fn test_analyze_cbz() {
        // Create sample CBZ with test images
        let test_cbz = create_test_cbz();

        let result = analyze_cbz(&test_cbz).await;
        assert!(result.is_ok());

        let analysis = result.unwrap();
        assert!(analysis.page_count > 0);
        assert!(!analysis.pages.is_empty());
    }

    fn create_test_cbz() -> Vec<u8> {
        // Helper to create valid test CBZ
        use zip::ZipWriter;
        use std::io::Cursor;

        let mut cbz_data = Vec::new();
        let mut zip = ZipWriter::new(Cursor::new(&mut cbz_data));

        let options = zip::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // Add dummy images
        zip.start_file("page_001.jpg", options).ok();
        zip.write_all(&[0xFF, 0xD8, 0xFF]).ok();

        zip.finish().ok();
        cbz_data
    }
}
```

### Running Rust Tests

```bash
cd src-tauri

# Run all tests
cargo test

# Run specific test
cargo test test_analyze_pdf_valid

# Run with output
cargo test -- --nocapture

# Run with specific thread count
cargo test -- --test-threads=1
```

---

## Part 2: Integration Tests (Frontend)

### Setup

Create `src/__tests__/` directory for React component tests.

### 2.1 Test Tauri Client Module

**src/__tests__/tauri-client.test.ts**:

```typescript
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { invoke, listen } from '@tauri-apps/api/core'
import * as tauriClient from '@/lib/tauri-client'

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}))

vi.mock('@tauri-apps/api/dialog', () => ({
  dialog: {
    open: vi.fn(),
    save: vi.fn(),
  },
}))

describe('tauri-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('analyzePdf', () => {
    it('should invoke analyze_pdf command', async () => {
      const mockResult = {
        pageCount: 10,
        pages: [],
        recommendedDpi: 150,
        pdfSizeMB: 5.0,
        nativeDpi: 120,
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockResult)

      const result = await tauriClient.analyzePdf('/path/to/file.pdf')

      expect(invoke).toHaveBeenCalledWith('analyze_pdf', {
        path: '/path/to/file.pdf',
      })
      expect(result).toEqual(mockResult)
    })

    it('should throw on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('PDF not found'))

      await expect(
        tauriClient.analyzePdf('/path/to/file.pdf')
      ).rejects.toThrow('PDF analysis failed')
    })
  })

  describe('generatePreview', () => {
    it('should generate preview image', async () => {
      const mockImageData = [255, 255, 255, ...Array(1000).fill(0)]
      vi.mocked(invoke).mockResolvedValueOnce(mockImageData)

      const buffer = await tauriClient.generatePreview(
        '/path/to/file.pdf',
        1,
        150,
        'jpeg',
        85
      )

      expect(invoke).toHaveBeenCalledWith('generate_preview', {
        path: '/path/to/file.pdf',
        page: 1,
        dpi: 150,
        format: 'jpeg',
        quality: 85,
      })
      expect(buffer).toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('convertPdfToCbz', () => {
    it('should convert PDF to CBZ', async () => {
      const mockCbzData = [80, 75, 3, 4, ...Array(1000).fill(0)] // ZIP header
      vi.mocked(invoke).mockResolvedValueOnce(mockCbzData)
      vi.mocked(listen).mockResolvedValueOnce(vi.fn())

      const buffer = await tauriClient.convertPdfToCbz(
        '/path/to/file.pdf',
        150,
        'jpeg',
        85
      )

      expect(invoke).toHaveBeenCalledWith('convert_pdf_to_cbz', {
        path: '/path/to/file.pdf',
        dpi: 150,
        format: 'jpeg',
        quality: 85,
      })
      expect(buffer).toBeInstanceOf(ArrayBuffer)
    })

    it('should handle progress events', async () => {
      const mockCbzData = [80, 75, 3, 4, ...Array(1000).fill(0)]
      vi.mocked(invoke).mockResolvedValueOnce(mockCbzData)

      const progressMock = vi.fn()
      const unlistenMock = vi.fn()

      vi.mocked(listen).mockResolvedValueOnce(unlistenMock)

      await tauriClient.convertPdfToCbz(
        '/path/to/file.pdf',
        150,
        'jpeg',
        85,
        progressMock
      )

      // Simulate progress event
      const eventCallback = vi.mocked(listen).mock.calls[0][1]
      eventCallback({
        payload: {
          currentPage: 5,
          totalPages: 10,
          percentage: 50,
          status: 'processing',
        },
      } as any)

      expect(progressMock).toHaveBeenCalledWith({
        currentPage: 5,
        totalPages: 10,
        percentage: 50,
        status: 'processing',
      })
    })
  })

  describe('selectFile', () => {
    it('should open file dialog', async () => {
      const mockPath = '/path/to/file.pdf'
      vi.mocked(dialog.open).mockResolvedValueOnce(mockPath)

      const path = await tauriClient.selectFile()

      expect(path).toBe(mockPath)
    })

    it('should return null on cancel', async () => {
      vi.mocked(dialog.open).mockResolvedValueOnce(null)

      const path = await tauriClient.selectFile()

      expect(path).toBeNull()
    })
  })

  describe('saveFile', () => {
    it('should save file with dialog', async () => {
      const mockPath = '/path/to/output.cbz'
      const mockBuffer = new ArrayBuffer(100)

      vi.mocked(dialog.save).mockResolvedValueOnce(mockPath)
      vi.mocked(invoke).mockResolvedValueOnce(mockPath)

      const path = await tauriClient.saveFile(mockBuffer, 'output.cbz')

      expect(dialog.save).toHaveBeenCalled()
      expect(invoke).toHaveBeenCalledWith('save_file', expect.any(Object))
      expect(path).toBe(mockPath)
    })
  })
})
```

### 2.2 Test React Components

**src/__tests__/Home.test.tsx** (partial):

```typescript
import { render, screen, userEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Home from '@/pages/page'
import * as tauriClient from '@/lib/tauri-client'

vi.mock('@/lib/tauri-client')
vi.mock('@/lib/useTranslation', () => ({
  useTranslation: () => ({
    lang: 'en',
    setLang: vi.fn(),
    t: (key: string) => key,
  }),
}))

describe('Home Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render file upload area', () => {
    render(<Home onBatchClick={vi.fn()} />)
    expect(screen.getByText(/select file/i)).toBeInTheDocument()
  })

  it('should call selectFile when upload clicked', async () => {
    const user = userEvent.setup()
    const mockSelectFile = vi.mocked(tauriClient.selectFile)
    mockSelectFile.mockResolvedValueOnce('/path/to/file.pdf')

    render(<Home onBatchClick={vi.fn()} />)

    const uploadButton = screen.getByText(/select file/i)
    await user.click(uploadButton)

    await waitFor(() => {
      expect(mockSelectFile).toHaveBeenCalled()
    })
  })

  it('should analyze PDF after selection', async () => {
    const mockAnalyze = vi.mocked(tauriClient.analyzePdf)
    mockAnalyze.mockResolvedValueOnce({
      pageCount: 10,
      pages: [],
      recommendedDpi: 150,
      pdfSizeMB: 5.0,
      nativeDpi: 120,
    })

    vi.mocked(tauriClient.selectFile).mockResolvedValueOnce(
      '/path/to/file.pdf'
    )

    render(<Home onBatchClick={vi.fn()} />)

    const uploadButton = screen.getByText(/select file/i)
    await userEvent.click(uploadButton)

    await waitFor(() => {
      expect(mockAnalyze).toHaveBeenCalledWith('/path/to/file.pdf')
    })
  })

  it('should display analysis results', async () => {
    mockAnalyze.mockResolvedValueOnce({
      pageCount: 10,
      pages: [],
      recommendedDpi: 150,
      pdfSizeMB: 5.0,
      nativeDpi: 120,
    })

    const { rerender } = render(<Home onBatchClick={vi.fn()} />)

    // Simulate state update after analysis
    await waitFor(() => {
      expect(screen.getByText(/pages/i)).toBeInTheDocument()
    })
  })
})
```

### Running Frontend Tests

```bash
# Install test dependencies
npm install --save-dev vitest @testing-library/react @testing-library/user-event

# Run tests
npm run test

# Run with watch mode
npm run test -- --watch

# Run with coverage
npm run test -- --coverage
```

---

## Part 3: End-to-End Tests

### Setup Manual Testing Checklist

Create **TESTING_CHECKLIST.md** in root:

```markdown
# E2E Testing Checklist

## PDF to CBZ Conversion

- [ ] Open app
- [ ] Select PDF file (sample.pdf)
- [ ] Verify analysis shows correct page count
- [ ] Verify file size is displayed
- [ ] Change DPI setting
- [ ] Verify preview updates
- [ ] Click "Convert"
- [ ] Verify progress bar appears
- [ ] Verify file saves
- [ ] Open saved CBZ in archive viewer
- [ ] Verify images are correct quality

## CBZ to PDF Conversion

- [ ] Select CBZ file
- [ ] Verify page count is correct
- [ ] Adjust quality slider
- [ ] Click "Convert"
- [ ] Verify PDF saves
- [ ] Open PDF in reader
- [ ] Verify pages are correct

## Batch Mode

- [ ] Click "Batch Mode"
- [ ] Upload multiple PDFs
- [ ] Set common settings
- [ ] Start batch conversion
- [ ] Verify progress updates
- [ ] Verify all files are created

## Edge Cases

- [ ] Very large PDF (>500MB)
- [ ] Very small PDF (1 page)
- [ ] CBZ with non-sequential filenames
- [ ] Corrupted PDF/CBZ (should error gracefully)
- [ ] Cancel during conversion
- [ ] File permissions issues
```

### Automated E2E Tests (Optional - with Tauri testing)

**tests/e2e.rs**:

```rust
#[tauri::test]
async fn test_full_conversion_workflow(app: tauri::AppHandle) {
    // 1. Select test PDF
    let pdf_path = "test_data/sample.pdf";

    // 2. Analyze
    let analysis: PdfAnalysisResult = app
        .invoke_command("analyze_pdf", serde_json::json!({"path": pdf_path}))
        .await
        .expect("Analysis failed");

    assert!(analysis.page_count > 0);

    // 3. Generate preview
    let preview: Vec<u8> = app
        .invoke_command(
            "generate_preview",
            serde_json::json!({
                "path": pdf_path,
                "page": 1,
                "dpi": 150,
                "format": "jpeg",
                "quality": 85
            }),
        )
        .await
        .expect("Preview failed");

    assert!(!preview.is_empty());

    // 4. Convert
    let cbz_data: Vec<u8> = app
        .invoke_command(
            "convert_pdf_to_cbz",
            serde_json::json!({
                "path": pdf_path,
                "dpi": 150,
                "format": "jpeg",
                "quality": 85
            }),
        )
        .await
        .expect("Conversion failed");

    assert!(!cbz_data.is_empty());

    // 5. Verify CBZ is valid ZIP
    use zip::ZipArchive;
    use std::io::Cursor;

    let archive = ZipArchive::new(Cursor::new(&cbz_data))
        .expect("Invalid ZIP");

    assert!(archive.len() > 0);
}
```

---

## Part 4: Performance Testing

### Benchmarks

Create **benches/performance.rs**:

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn benchmark_pdf_analysis(c: &mut Criterion) {
    c.bench_function("analyze_100_page_pdf", |b| {
        b.iter(|| {
            analyze_pdf(black_box("test_data/sample_100pages.pdf".to_string()))
        })
    });
}

fn benchmark_page_rendering(c: &mut Criterion) {
    c.bench_function("render_single_page_150dpi", |b| {
        b.iter(|| {
            render_pdf_page(
                black_box("test_data/sample.pdf"),
                black_box(1),
                black_box(150),
            )
        })
    });
}

fn benchmark_image_conversion(c: &mut Criterion) {
    c.bench_function("convert_image_jpeg_85", |b| {
        b.iter(|| {
            convert_image(
                black_box(&TEST_IMAGE_DATA),
                black_box(ImageFormat::Jpeg),
                black_box(85),
            )
        })
    });
}

criterion_group!(
    benches,
    benchmark_pdf_analysis,
    benchmark_page_rendering,
    benchmark_image_conversion
);
criterion_main!(benches);
```

Run benchmarks:
```bash
cargo bench --bench performance
```

---

## Part 5: Test Data

### Create Test Files

```bash
# Create test_data directory
mkdir -p test_data

# Use sample PDFs from the project
cp ../pdf-to-cbz-nextjs/sample_dir/*.pdf test_data/

# Or generate synthetic test PDFs (requires Python + reportlab)
python3 scripts/generate_test_pdfs.py
```

**scripts/generate_test_pdfs.py**:
```python
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import os

os.makedirs('test_data', exist_ok=True)

# Create simple PDF with 100 pages
c = canvas.Canvas("test_data/sample_100pages.pdf", pagesize=letter)
for i in range(100):
    c.drawString(100, 750, f"Page {i+1}")
    c.showPage()
c.save()
```

---

## Part 6: Continuous Integration

### GitHub Actions Workflow

Create **.github/workflows/test.yml**:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  rust-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: dtolnay/rust-toolchain@stable
      - run: cd src-tauri && cargo test

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test

  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - run: npm run tauri build
```

---

## Testing Summary

| Level | Tool | Command | Coverage |
|-------|------|---------|----------|
| **Unit** | Cargo | `cargo test` | Rust modules |
| **Integration** | Vitest | `npm run test` | Frontend + IPC |
| **E2E** | Manual | Checklist | Full workflow |
| **Performance** | Criterion | `cargo bench` | Speed/memory |
| **CI/CD** | GitHub Actions | Auto on push | All platforms |

---

## See Also

- `IMPLEMENTATION_GUIDE.md` - Setup instructions
- `RUST_IMPLEMENTATION.md` - Backend code details
- `MIGRATION_GUIDE.md` - Frontend changes
- `ARCHITECTURE.md` - Design overview
