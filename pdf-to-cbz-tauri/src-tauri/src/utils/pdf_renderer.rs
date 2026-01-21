use anyhow::{Context, Result};
use pdfium_render::prelude::*;

/// Render a single PDF page to an image buffer
pub async fn render_pdf_page(
    pdf_path: &str,
    page_num: u32,
    dpi: u32,
) -> Result<Vec<u8>> {
    let pdf_data = tokio::fs::read(pdf_path)
        .await
        .context("Failed to read PDF file")?;

    render_page_from_bytes(&pdf_data, page_num, dpi).await
}

/// Render a PDF page from bytes
pub async fn render_page_from_bytes(
    pdf_data: &[u8],
    page_num: u32,
    dpi: u32,
) -> Result<Vec<u8>> {
    // pdfium-render is synchronous, so we use spawn_blocking
    let pdf_data = pdf_data.to_vec();
    
    tokio::task::spawn_blocking(move || {
        let pdfium = Pdfium::default();
        
        let document = pdfium
            .load_pdf_from_byte_vec(pdf_data, None)
            .context("Failed to load PDF document")?;

        // Get page (page_num is 1-indexed, but pdfium uses 0-indexed)
        let page = document
            .pages()
            .get((page_num - 1) as u16)
            .context(format!("Page {} not found", page_num))?;

        // Calculate pixel dimensions
        let scale = dpi as f64 / 72.0;
        let width_pt = page.width().value as f64;
        let height_pt = page.height().value as f64;
        let width_px = (width_pt * scale).round() as i32;
        let height_px = (height_pt * scale).round() as i32;

        // Render to bitmap
        let config = PdfRenderConfig::new()
            .set_target_width(width_px)
            .set_target_height(height_px)
            .rotate_if_landscape(PdfPageRenderRotation::None, true);

        let bitmap = page
            .render_with_config(&config)
            .context("Failed to render page")?;

        // Convert bitmap to PNG
        let image = bitmap.as_image();
        let mut png_data = Vec::new();
        image
            .write_to(&mut std::io::Cursor::new(&mut png_data), image::ImageFormat::Png)
            .context("Failed to encode PNG")?;

        Ok::<Vec<u8>, anyhow::Error>(png_data)
    })
    .await
    .context("Task join error")?
}

/// Synchronous PDF page rendering for parallel processing
pub fn render_pdf_page_sync(
    pdf_data: &[u8],
    page_num: u32,
    dpi: u32,
) -> Result<Vec<u8>> {
    let pdfium = Pdfium::default();

    let document = pdfium
        .load_pdf_from_byte_vec(pdf_data.to_vec(), None)
        .context("Failed to load PDF document")?;

    // Get page (page_num is 1-indexed, but pdfium uses 0-indexed)
    let page = document
        .pages()
        .get((page_num - 1) as u16)
        .context(format!("Page {} not found", page_num))?;

    // Calculate pixel dimensions
    let scale = dpi as f64 / 72.0;
    let width_pt = page.width().value as f64;
    let height_pt = page.height().value as f64;
    let width_px = (width_pt * scale).round() as i32;
    let height_px = (height_pt * scale).round() as i32;

    // Render to bitmap
    let config = PdfRenderConfig::new()
        .set_target_width(width_px)
        .set_target_height(height_px)
        .rotate_if_landscape(PdfPageRenderRotation::None, true);

    let bitmap = page
        .render_with_config(&config)
        .context("Failed to render page")?;

    // Convert bitmap to PNG
    let image = bitmap.as_image();
    let mut png_data = Vec::new();
    image
        .write_to(&mut std::io::Cursor::new(&mut png_data), image::ImageFormat::Png)
        .context("Failed to encode PNG")?;

    Ok(png_data)
}
