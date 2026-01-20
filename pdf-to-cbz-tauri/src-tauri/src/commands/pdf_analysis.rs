use pdfium_render::prelude::*;
use std::path::Path;

use crate::models::{PdfAnalysisResult, PageInfo};

const TARGET_PIXEL_WIDTH: f64 = 2000.0;
const MIN_DPI: u32 = 72;
const MAX_DPI: u32 = 600;

/// Calculate optimal DPI based on page width
fn calculate_optimal_dpi(width_pt: f64) -> u32 {
    let width_inches = width_pt / 72.0;
    let calculated_dpi = (TARGET_PIXEL_WIDTH / width_inches).round() as u32;
    calculated_dpi.max(MIN_DPI).min(MAX_DPI)
}

/// Calculate native DPI (DPI that would match original PDF file size)
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

/// Internal function to analyze PDF (used by both the command and conversion)
pub async fn analyze_pdf_internal(path: &str) -> Result<PdfAnalysisResult, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err("PDF file not found".to_string());
    }

    // Load PDF file
    let pdf_data = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    let pdf_size_bytes = pdf_data.len() as u64;
    let pdf_size_mb = pdf_size_bytes as f64 / (1024.0 * 1024.0);

    // Load PDF using pdfium-render (blocking operation)
    let result = tokio::task::spawn_blocking(move || {
        let pdfium = Pdfium::default();

        let document = pdfium
            .load_pdf_from_byte_vec(pdf_data, None)
            .map_err(|e| format!("Failed to load PDF document: {}", e))?;

        let page_count = document.pages().len() as u32;
        let mut pages = Vec::new();
        let mut total_width_pt = 0.0;
        let mut total_height_pt = 0.0;
        let mut max_width_pt = 0.0;

        // Extract page dimensions
        for page in document.pages().iter() {
            let width_pt = page.width().value as f64;
            let height_pt = page.height().value as f64;

            if width_pt > max_width_pt {
                max_width_pt = width_pt;
            }

            total_width_pt += width_pt;
            total_height_pt += height_pt;

            // Calculate pixel dimensions at recommended DPI
            let recommended_dpi = calculate_optimal_dpi(width_pt);
            let scale = recommended_dpi as f64 / 72.0;

            pages.push(PageInfo {
                page_number: (pages.len() + 1) as u32,
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
            pdf_size_bytes,
            page_count,
            avg_width_pt,
            avg_height_pt,
        );

        Ok::<PdfAnalysisResult, String>(PdfAnalysisResult {
            page_count,
            pages,
            recommended_dpi,
            pdf_size_mb,
            native_dpi,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    result
}

/// Analyze PDF structure (Tauri command)
#[tauri::command]
pub async fn analyze_pdf(path: String) -> Result<PdfAnalysisResult, String> {
    analyze_pdf_internal(&path).await
}
