# Rust Backend Implementation Guide

## Overview

This document provides detailed implementation guidelines for each Rust backend module. Code examples are provided with careful attention to:
- Error handling (using `Result<T, E>`)
- Serialization (for IPC communication)
- Performance (streaming, caching)
- Platform compatibility

---

## Module 1: PDF Analysis (`src-tauri/src/commands/pdf_analysis.rs`)

### Purpose
Analyze PDF structure without rendering - extract page counts, dimensions, and calculate optimal DPI values.

### Implementation

```rust
use crate::models::{PdfAnalysisResult, PageInfo};
use pdfium_render::prelude::*;
use std::path::Path;

const TARGET_PIXEL_WIDTH: f64 = 2000.0;
const MIN_DPI: u32 = 72;
const MAX_DPI: u32 = 600;

/// Calculate optimal DPI based on page width
/// Formula: desired_pixels / (width_inches)
/// where width_inches = width_pt / 72
pub fn calculate_optimal_dpi(width_pt: f64) -> u32 {
    let width_inches = width_pt / 72.0;
    let calculated_dpi = (TARGET_PIXEL_WIDTH / width_inches).round() as u32;
    calculated_dpi.max(MIN_DPI).min(MAX_DPI)
}

/// Calculate native DPI (DPI that would match original PDF file size)
///
/// Based on assumption that PDF already has optimal compression.
/// For JPEG @ 85% quality with comic book artwork:
/// ~0.18 bytes per pixel (comics compress well due to flat colors)
fn calculate_native_dpi(
    pdf_size_bytes: u64,
    page_count: u32,
    avg_width_pt: f64,
    avg_height_pt: f64,
) -> u32 {
    if page_count == 0 {
        return 150;
    }

    let bytes_per_page = pdf_size_bytes as f64 / page_count as f64;
    let bytes_per_pixel = 0.18; // For JPEG @ 85% quality

    let target_pixels_per_page = bytes_per_page / bytes_per_pixel;
    let aspect_ratio = avg_height_pt / avg_width_pt;

    let target_width_px = (target_pixels_per_page / aspect_ratio).sqrt();
    let native_dpi = ((target_width_px * 72.0) / avg_width_pt).round() as u32;

    native_dpi.max(MIN_DPI).min(MAX_DPI)
}

/// Analyze PDF structure
///
/// # Arguments
/// * `path` - Path to PDF file
///
/// # Returns
/// Result containing PdfAnalysisResult with page info and recommendations
#[tauri::command]
pub async fn analyze_pdf(path: String) -> Result<PdfAnalysisResult, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err("PDF file not found".to_string());
    }

    // Load PDF file
    let pdf_data = std::fs::read(path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    let pdf_size_bytes = pdf_data.len();
    let pdf_size_mb = (pdf_size_bytes as f64) / (1024.0 * 1024.0);

    // Load PDF using pdfium-render
    let pdfium = PdfiumLibraryBindings::new(PdfiumRenderLibraryBindings::instance());
    let document = PdfDocument::load_from_bytes(
        &pdf_data,
        None,
        None,
    ).map_err(|e| format!("Failed to load PDF: {}", e))?;

    let page_count = document.pages().len() as u32;
    let mut pages = Vec::new();
    let mut total_width_pt = 0.0;
    let mut total_height_pt = 0.0;
    let mut max_width_pt = 0.0;

    // Extract page dimensions
    for (page_index, page) in document.pages().iter().enumerate() {
        let width_pt = page.width().value;
        let height_pt = page.height().value;

        if width_pt > max_width_pt {
            max_width_pt = width_pt;
        }

        total_width_pt += width_pt;
        total_height_pt += height_pt;

        // Calculate pixel dimensions at recommended DPI
        let recommended_dpi = calculate_optimal_dpi(width_pt);
        let scale = recommended_dpi as f64 / 72.0;

        pages.push(PageInfo {
            page_number: (page_index + 1) as u32,
            width_pt,
            height_pt,
            width_px: (width_pt * scale).round() as u32,
            height_px: (height_pt * scale).round() as u32,
        });
    }

    // Calculate averages and recommendations
    let recommended_dpi = calculate_optimal_dpi(max_width_pt);
    let avg_width_pt = total_width_pt / page_count as f64;
    let avg_height_pt = total_height_pt / page_count as f64;
    let native_dpi = calculate_native_dpi(
        pdf_size_bytes as u64,
        page_count,
        avg_width_pt,
        avg_height_pt,
    );

    Ok(PdfAnalysisResult {
        page_count,
        pages,
        recommended_dpi,
        pdf_size_mb,
        native_dpi,
    })
}
```

### Key Points
- **pdfium-render**: Fast PDF library for Rust (faster than pdfjs-dist)
- **No rendering**: Just extracts metadata (very fast, < 100ms for most PDFs)
- **Error handling**: File not found, corrupt PDFs
- **DPI calculation**: Same formulas as Next.js version

---

## Module 2: PDF Rendering (`src-tauri/src/utils/pdf_renderer.rs`)

### Purpose
Render PDF pages to images at specified DPI for preview generation and conversion.

### Challenge
**This is the most complex module** - PDF rendering requires either:
1. Using pdfium-render with custom rendering to bitmap
2. Using mupdocs (faster but larger dependency)
3. Using cairo bindings (system dependency)

### Recommended Approach: pdfium-render

```rust
use pdfium_render::prelude::*;
use image::{ImageBuffer, Rgba};
use std::path::Path;

/// Render single PDF page to image buffer
///
/// # Arguments
/// * `pdf_path` - Path to PDF file
/// * `page_num` - Page number (1-indexed)
/// * `dpi` - DPI for rendering
///
/// # Returns
/// Vec<u8> containing PNG image data
pub async fn render_pdf_page(
    pdf_path: &str,
    page_num: u32,
    dpi: u32,
) -> Result<Vec<u8>, String> {
    let pdf_data = std::fs::read(pdf_path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    let pdfium = PdfiumLibraryBindings::new(
        PdfiumRenderLibraryBindings::instance()
    );

    let document = PdfDocument::load_from_bytes(&pdf_data, None, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    // Get page (page_num is 1-indexed)
    let page = document.get_page(page_num as i32)
        .ok_or_else(|| format!("Page {} not found", page_num))?;

    // Calculate pixel dimensions
    let scale = dpi as f64 / 72.0;
    let width_pt = page.width().value;
    let height_pt = page.height().value;
    let width_px = (width_pt * scale).round() as u32;
    let height_px = (height_pt * scale).round() as u32;

    // Render to bitmap
    let bitmap = page.render_to_bitmap(
        PdfBitmapFormat::BGRA,
        (dpi as i32).into(),
        true,
    ).map_err(|e| format!("Render failed: {}", e))?;

    // Extract pixel data
    let pixels = bitmap.as_raw_bytes();

    // Convert to PNG using image crate
    let img_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(
        width_px,
        height_px,
        pixels.to_vec(),
    ).ok_or_else(|| "Failed to create image buffer".to_string())?;

    let mut png_data = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png_data)
        .encode(
            &img_buffer,
            width_px,
            height_px,
            image::ColorType::Rgba8,
        )
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    Ok(png_data)
}

/// Render all pages, returning async iterator
/// Useful for large PDFs to avoid memory issues
pub async fn render_all_pages(
    pdf_path: &str,
    dpi: u32,
) -> Result<Vec<Vec<u8>>, String> {
    let pdf_data = std::fs::read(pdf_path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    let pdfium = PdfiumLibraryBindings::new(
        PdfiumRenderLibraryBindings::instance()
    );

    let document = PdfDocument::load_from_bytes(&pdf_data, None, None)
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    let mut rendered_pages = Vec::new();

    for page_index in 0..document.pages().len() {
        let page = document.get_page(page_index as i32)
            .ok_or_else(|| format!("Page {} not found", page_index))?;

        // Render page... (same as above)
        let width_pt = page.width().value;
        let height_pt = page.height().value;
        let scale = dpi as f64 / 72.0;
        let width_px = (width_pt * scale).round() as u32;
        let height_px = (height_pt * scale).round() as u32;

        let bitmap = page.render_to_bitmap(
            PdfBitmapFormat::BGRA,
            (dpi as i32).into(),
            true,
        ).map_err(|e| format!("Render failed: {}", e))?;

        let pixels = bitmap.as_raw_bytes();
        let img_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(
            width_px,
            height_px,
            pixels.to_vec(),
        ).ok_or_else(|| "Failed to create image buffer".to_string())?;

        let mut png_data = Vec::new();
        image::codecs::png::PngEncoder::new(&mut png_data)
            .encode(
                &img_buffer,
                width_px,
                height_px,
                image::ColorType::Rgba8,
            )
            .map_err(|e| format!("PNG encoding failed: {}", e))?;

        rendered_pages.push(png_data);
    }

    Ok(rendered_pages)
}
```

### Alternative: Using mupdf Crate

If pdfium-render has issues, consider `mupdf`:

```toml
# Cargo.toml
mupdf = "0.1"
```

This is faster but may have platform support issues.

---

## Module 3: Image Processing (`src-tauri/src/utils/image_processor.rs`)

### Purpose
Convert images between formats (JPEG/PNG), apply quality settings, resize.

### Implementation

```rust
use image::{DynamicImage, ImageReader, ImageFormat};
use std::io::Cursor;

pub enum ImageFormat {
    Jpeg,
    Png,
}

impl std::fmt::Display for ImageFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ImageFormat::Jpeg => write!(f, "jpeg"),
            ImageFormat::Png => write!(f, "png"),
        }
    }
}

/// Convert image bytes to specified format with quality settings
pub fn convert_image(
    input: &[u8],
    format: ImageFormat,
    quality: u8,
) -> Result<Vec<u8>, String> {
    // Load input image
    let img = ImageReader::new(Cursor::new(input))
        .map_err(|e| format!("Failed to read image: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    // Convert to appropriate format
    let mut output = Vec::new();

    match format {
        ImageFormat::Jpeg => {
            image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut output,
                quality,
            )
            .encode(
                img.as_rgba8()
                    .ok_or("Failed to convert to RGBA")?,
                img.width(),
                img.height(),
                image::ColorType::Rgba8,
            )
            .map_err(|e| format!("JPEG encoding failed: {}", e))?;
        }
        ImageFormat::Png => {
            image::codecs::png::PngEncoder::new(&mut output)
                .encode(
                    img.as_rgba8()
                        .ok_or("Failed to convert to RGBA")?,
                    img.width(),
                    img.height(),
                    image::ColorType::Rgba8,
                )
                .map_err(|e| format!("PNG encoding failed: {}", e))?;
        }
    }

    Ok(output)
}

/// Resize image to max dimensions while preserving aspect ratio
pub fn resize_image(
    input: &[u8],
    max_width: u32,
    max_height: u32,
) -> Result<Vec<u8>, String> {
    let img = ImageReader::new(Cursor::new(input))
        .map_err(|e| format!("Failed to read image: {}", e))?
        .decode()
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let (width, height) = img.dimensions();

    // Calculate scale to fit within max dimensions
    let scale_x = max_width as f64 / width as f64;
    let scale_y = max_height as f64 / height as f64;
    let scale = scale_x.min(scale_y).min(1.0); // Don't upscale

    let new_width = (width as f64 * scale).round() as u32;
    let new_height = (height as f64 * scale).round() as u32;

    let resized = img.resize(
        new_width,
        new_height,
        image::imageops::FilterType::Lanczos3,
    );

    // Return as PNG
    let mut output = Vec::new();
    image::codecs::png::PngEncoder::new(&mut output)
        .encode(
            resized.as_rgba8()
                .ok_or("Failed to convert to RGBA")?,
            new_width,
            new_height,
            image::ColorType::Rgba8,
        )
        .map_err(|e| format!("PNG encoding failed: {}", e))?;

    Ok(output)
}

/// Get image metadata (dimensions, format)
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_bytes: u64,
}

pub fn get_image_info(input: &[u8]) -> Result<ImageInfo, String> {
    let reader = ImageReader::new(Cursor::new(input))
        .map_err(|e| format!("Failed to read image: {}", e))?;

    let format = reader.format()
        .ok_or("Could not determine format")?;

    let (width, height) = reader.into_dimensions()
        .map_err(|e| format!("Failed to get dimensions: {}", e))?;

    Ok(ImageInfo {
        width,
        height,
        format: format!(
            "{:?}",
            format
        ),
        size_bytes: input.len() as u64,
    })
}
```

---

## Module 4: Archive Operations (`src-tauri/src/utils/archive.rs`)

### Purpose
Create CBZ (ZIP) archives from images, analyze CBZ files.

### Implementation

```rust
use zip::{ZipWriter, FileOptions};
use std::io::{Write, Cursor};
use crate::models::{CbzAnalysisResult, CbzPageInfo};

/// Create CBZ archive from image buffers
pub fn create_cbz(
    images: Vec<(String, Vec<u8>)>,
) -> Result<Vec<u8>, String> {
    let mut cbz_data = Vec::new();
    let mut zip = ZipWriter::new(Cursor::new(&mut cbz_data));

    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for (filename, image_data) in images {
        zip.start_file(filename, options)
            .map_err(|e| format!("Failed to add file to archive: {}", e))?;

        zip.write_all(&image_data)
            .map_err(|e| format!("Failed to write file to archive: {}", e))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize archive: {}", e))?;

    Ok(cbz_data)
}

/// Analyze CBZ archive structure
pub async fn analyze_cbz(cbz_data: &[u8]) -> Result<CbzAnalysisResult, String> {
    use zip::ZipArchive;
    use std::io::Cursor;

    let cursor = Cursor::new(cbz_data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to read CBZ: {}", e))?;

    let mut pages = Vec::new();
    let image_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

    // Collect image files
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read file in archive: {}", e))?;

        let name = file.name();

        // Check if it's an image file
        let is_image = image_extensions.iter()
            .any(|ext| name.to_lowercase().ends_with(ext));

        if !is_image || file.is_dir() {
            continue;
        }

        // Read image data
        let mut image_data = Vec::new();
        file.read_to_end(&mut image_data)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        // Get image dimensions
        let reader = image::ImageReader::new(Cursor::new(&image_data))
            .map_err(|e| format!("Failed to read image metadata: {}", e))?;

        let (width, height) = reader.into_dimensions()
            .map_err(|e| format!("Failed to get dimensions: {}", e))?;

        pages.push(CbzPageInfo {
            page_number: pages.len() as u32 + 1,
            file_name: name.to_string(),
            width,
            height,
            format: determine_image_format(name),
            size_kb: (image_data.len() / 1024) as u32,
        });
    }

    // Sort by filename for proper page ordering
    pages.sort_by(|a, b| {
        a.file_name.cmp(&b.file_name)
    });

    Ok(CbzAnalysisResult {
        page_count: pages.len() as u32,
        pages,
        cbz_size_mb: (cbz_data.len() as f64) / (1024.0 * 1024.0),
    })
}

fn determine_image_format(filename: &str) -> String {
    let lower = filename.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "jpeg".to_string()
    } else if lower.ends_with(".png") {
        "png".to_string()
    } else {
        "unknown".to_string()
    }
}

use std::io::Read;
```

---

## Module 5: Conversion Commands (`src-tauri/src/commands/conversion.rs`)

### Purpose
Orchestrate PDF→CBZ and CBZ→PDF conversions using utility modules.

### Implementation

```rust
use crate::models::*;
use crate::utils::*;
use std::path::Path;

/// Convert PDF to CBZ with specified parameters
#[tauri::command]
pub async fn convert_pdf_to_cbz(
    path: String,
    dpi: u32,
    format: String,
    quality: u8,
    app_handle: tauri::AppHandle,
) -> Result<Vec<u8>, String> {
    let path = Path::new(&path);

    // Validate inputs
    let img_format = match format.as_str() {
        "jpeg" => image_processor::ImageFormat::Jpeg,
        "png" => image_processor::ImageFormat::Png,
        _ => return Err("Invalid format".to_string()),
    };

    // Read PDF
    let pdf_data = std::fs::read(path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    // Analyze PDF to get page count
    let analysis = analyze_pdf(path.to_str().unwrap().to_string())
        .await?;

    // Render all pages
    let rendered_pages = pdf_renderer::render_all_pages(
        path.to_str().unwrap(),
        dpi,
    )
    .await?;

    // Process each page: convert format, apply quality
    let mut cbz_images = Vec::new();

    for (page_idx, page_data) in rendered_pages.iter().enumerate() {
        let page_num = page_idx + 1;

        // Emit progress
        app_handle.emit_all("conversion-progress", ConversionProgress {
            current_page: page_num as u32,
            total_pages: analysis.page_count,
            percentage: ((page_num as f64 / analysis.page_count as f64) * 100.0) as u32,
            status: "processing".to_string(),
            message: Some(format!("Processing page {}/{}", page_num, analysis.page_count)),
        }).ok();

        // Convert to target format
        let converted = image_processor::convert_image(
            page_data,
            img_format.clone(),
            quality,
        )?;

        // Add to CBZ
        let filename = format!(
            "page_{:03}.{}",
            page_num,
            match img_format {
                image_processor::ImageFormat::Jpeg => "jpg",
                image_processor::ImageFormat::Png => "png",
            }
        );

        cbz_images.push((filename, converted));
    }

    // Create CBZ archive
    let cbz_data = archive::create_cbz(cbz_images)?;

    // Emit completion
    app_handle.emit_all("conversion-progress", ConversionProgress {
        current_page: analysis.page_count,
        total_pages: analysis.page_count,
        percentage: 100,
        status: "completed".to_string(),
        message: Some("Conversion completed".to_string()),
    }).ok();

    Ok(cbz_data)
}

/// Convert CBZ to PDF
#[tauri::command]
pub async fn convert_cbz_to_pdf(
    path: String,
    quality: u8,
    app_handle: tauri::AppHandle,
) -> Result<Vec<u8>, String> {
    let path = Path::new(&path);

    // Read CBZ file
    let cbz_data = std::fs::read(path)
        .map_err(|e| format!("Failed to read CBZ: {}", e))?;

    // Analyze CBZ
    let analysis = archive::analyze_cbz(&cbz_data).await?;

    // Create PDF document
    let mut document = printpdf::PdfDocument::new("PDF to CBZ Converter");
    let pages_id = document.get_pages();
    let fonts = document.get_fonts();
    let font = fonts.get_font_id(printpdf::BuiltinFont::Helvetica);

    // Extract and embed images
    for (idx, page_info) in analysis.pages.iter().enumerate() {
        // Emit progress
        app_handle.emit_all("conversion-progress", ConversionProgress {
            current_page: (idx + 1) as u32,
            total_pages: analysis.page_count,
            percentage: (((idx + 1) as f64 / analysis.page_count as f64) * 100.0) as u32,
            status: "processing".to_string(),
            message: Some(format!("Processing page {}/{}", idx + 1, analysis.page_count)),
        }).ok();

        // TODO: Extract image from CBZ and embed in PDF
        // This requires implementing image extraction from ZIP
    }

    // Convert to bytes
    let pdf_bytes = document.finish()
        .map_err(|e| format!("Failed to create PDF: {}", e))?;

    Ok(pdf_bytes)
}

// Import from pdf_analysis module
use super::pdf_analysis::analyze_pdf;
```

---

## Module 6: Preview Generation (`src-tauri/src/commands/preview.rs`)

### Purpose
Generate preview images for specific pages with specified settings.

```rust
use crate::utils::*;
use std::path::Path;

#[tauri::command]
pub async fn generate_preview(
    path: String,
    page: u32,
    dpi: u32,
    format: String,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let path = Path::new(&path);

    // Parse format
    let img_format = match format.as_str() {
        "jpeg" => image_processor::ImageFormat::Jpeg,
        "png" => image_processor::ImageFormat::Png,
        _ => return Err("Invalid format".to_string()),
    };

    // Render page at specified DPI
    let rendered = pdf_renderer::render_pdf_page(
        path.to_str().unwrap(),
        page,
        dpi,
    )
    .await?;

    // Convert to target format with quality
    let preview = image_processor::convert_image(
        &rendered,
        img_format,
        quality,
    )?;

    Ok(preview)
}
```

---

## Module 7: File Operations (`src-tauri/src/commands/file_ops.rs`)

### Purpose
Handle file selection and saving (Tauri built-in + wrappers).

```rust
use tauri::api::dialog::{FileDialogBuilder, MessageDialogBuilder};
use tauri::AppHandle;
use std::path::Path;

#[tauri::command]
pub async fn select_file(
    app_handle: AppHandle,
    default_path: Option<String>,
) -> Result<String, String> {
    let result = FileDialogBuilder::new()
        .add_filter("PDF files", &["pdf"])
        .add_filter("CBZ files", &["cbz"])
        .set_directory(&default_path.unwrap_or_else(|| "~".to_string()))
        .pick_file(&app_handle.clone())
        .await;

    result.ok_or_else(|| "File selection cancelled".to_string())
        .and_then(|path| path.ok_or_else(|| "Invalid path".to_string()))
        .and_then(|path| path.to_str()
            .ok_or("Invalid path encoding".to_string())
            .map(|s| s.to_string()))
}

#[tauri::command]
pub async fn save_file(
    app_handle: AppHandle,
    data: Vec<u8>,
    file_name: String,
) -> Result<String, String> {
    let result = FileDialogBuilder::new()
        .set_file_name(&file_name)
        .save_file(&app_handle.clone())
        .await;

    if let Ok(Some(path)) = result {
        std::fs::write(&path, data)
            .map_err(|e| format!("Failed to save file: {}", e))?;

        path.to_str()
            .ok_or("Invalid path encoding".to_string())
            .map(|s| s.to_string())
    } else {
        Err("Save cancelled or invalid path".to_string())
    }
}
```

---

## Critical Implementation Notes

### 1. PDF Rendering Complexity

**Challenge**: pdfium-render can be finicky. It requires either:
- Pre-compiled bindings via `pdfium-render-prebuilt` feature
- System PDFium library

**Solution**:
```toml
# Cargo.toml
pdfium-render = { version = "0.8", features = ["pdfium-render-prebuilt"] }
```

If this fails, alternatives:
- `mupdf`: Faster, but needs Rust bindings
- `pdf`: Pure Rust, slower
- System call to `pdftoppm` (very fast but requires dependency)

### 2. Error Handling Patterns

Always use `Result<T, String>` for Tauri commands (serializable):

```rust
// ✓ Good
#[tauri::command]
pub async fn my_command() -> Result<MyData, String> {
    do_something().map_err(|e| e.to_string())?;
    Ok(result)
}

// ✗ Bad
#[tauri::command]
pub async fn my_command() -> Result<MyData, Box<dyn Error>> {
    // Box<dyn Error> is not serializable
}
```

### 3. Progress Events

For long operations, emit progress via Tauri events:

```rust
app_handle.emit_all("event-name", payload).ok();
```

Don't block with progress - use async/await with tokio:

```rust
#[tauri::command]
pub async fn long_operation(app_handle: AppHandle) -> Result<Data, String> {
    for i in 0..100 {
        // Do work

        // Emit progress
        app_handle.emit_all("progress", ProgressData {
            current: i,
            total: 100,
        }).ok();

        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    Ok(result)
}
```

### 4. Memory Management for Large Files

Stream processing for large PDFs:

```rust
// ✗ Bad - loads entire PDF into memory
let pages = render_all_pages(path, dpi).await?;

// ✓ Good - process one page at a time
for page_num in 1..=page_count {
    let page = render_pdf_page(path, page_num, dpi).await?;
    process_page(page)?;
}
```

### 5. Parallel Processing

Use `rayon` for CPU-bound image processing:

```rust
use rayon::prelude::*;

let processed_images: Vec<_> = images
    .par_iter()
    .map(|img| convert_image(img, format, quality))
    .collect::<Result<_, _>>()?;
```

---

## Testing Individual Modules

### Test PDF Analysis

```bash
# In Rust code
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_analyze_pdf() {
        let result = analyze_pdf("test.pdf".to_string()).await;
        assert!(result.is_ok());
        let analysis = result.unwrap();
        assert!(analysis.page_count > 0);
    }
}
```

Run tests:
```bash
cd src-tauri
cargo test
```

---

## Performance Benchmarks (Expected)

| Operation | Time |
|-----------|------|
| Analyze 100-page PDF | < 100ms |
| Render single page @ 150 DPI | 100-300ms |
| Convert 100-page PDF → CBZ | 10-30 seconds |
| Create CBZ archive | < 1 second |
| Analyze CBZ | < 200ms |

These times are for typical comic book PDFs on modern hardware (M1 Mac or Ryzen 5).

---

## See Also

- `ARCHITECTURE.md` - Design overview
- `IMPLEMENTATION_GUIDE.md` - Project setup
- `MIGRATION_GUIDE.md` - Frontend adaptation
- `TESTING.md` - Integration testing
