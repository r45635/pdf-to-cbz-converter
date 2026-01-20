use anyhow::{Context, Result};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use std::io::{Cursor, Read, Write};

use crate::models::{CbzAnalysisResult, CbzPageInfo};

/// Create a CBZ (ZIP) archive from images
pub fn create_cbz(images: Vec<(String, Vec<u8>)>) -> Result<Vec<u8>> {
    let buffer = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buffer);
    
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(9));

    for (filename, data) in images {
        zip.start_file(&filename, options)
            .context(format!("Failed to add file {}", filename))?;
        zip.write_all(&data)
            .context("Failed to write file data")?;
    }

    let buffer = zip.finish().context("Failed to finalize ZIP archive")?;
    Ok(buffer.into_inner())
}

/// Analyze a CBZ file
pub async fn analyze_cbz(cbz_path: &str) -> Result<CbzAnalysisResult> {
    let cbz_data = tokio::fs::read(cbz_path)
        .await
        .context("Failed to read CBZ file")?;

    let cbz_size_mb = cbz_data.len() as f64 / (1024.0 * 1024.0);

    let cursor = Cursor::new(cbz_data);
    let mut archive = ZipArchive::new(cursor)
        .context("Failed to open CBZ archive")?;

    let mut pages = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .context(format!("Failed to read file at index {}", i))?;

        let file_name = file.name().to_string();
        
        // Skip non-image files
        if !is_image_file(&file_name) {
            continue;
        }

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .context("Failed to read file contents")?;

        // Get image dimensions
        let (width, height) = crate::utils::get_image_dimensions(&buffer)
            .unwrap_or((0, 0));

        let format = detect_image_format(&file_name);
        let size_kb = buffer.len() as f64 / 1024.0;

        pages.push(CbzPageInfo {
            page_number: (pages.len() + 1) as u32,
            file_name,
            width,
            height,
            format,
            size_kb,
        });
    }

    // Sort pages by filename
    pages.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    
    // Update page numbers after sorting
    for (i, page) in pages.iter_mut().enumerate() {
        page.page_number = (i + 1) as u32;
    }

    Ok(CbzAnalysisResult {
        page_count: pages.len() as u32,
        pages,
        cbz_size_mb,
    })
}

/// Check if a filename is an image file
fn is_image_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".jpg") ||
    lower.ends_with(".jpeg") ||
    lower.ends_with(".png") ||
    lower.ends_with(".webp") ||
    lower.ends_with(".gif")
}

/// Detect image format from filename
fn detect_image_format(filename: &str) -> String {
    let lower = filename.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "jpeg".to_string()
    } else if lower.ends_with(".png") {
        "png".to_string()
    } else if lower.ends_with(".webp") {
        "webp".to_string()
    } else if lower.ends_with(".gif") {
        "gif".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Extract images from CBZ/CBR archive
pub fn extract_images_from_cbz(cbz_data: &[u8]) -> Result<Vec<(String, Vec<u8>)>> {
    let cursor = Cursor::new(cbz_data);
    let mut archive = ZipArchive::new(cursor)
        .context("Failed to open CBZ/CBR archive")?;

    let mut images: Vec<(String, Vec<u8>)> = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .context(format!("Failed to read file at index {}", i))?;

        let file_name = file.name().to_string();

        // Skip non-image files
        if !is_image_file(&file_name) {
            continue;
        }

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .context("Failed to read file contents")?;

        images.push((file_name, buffer));
    }

    // Sort by filename to maintain page order
    images.sort_by(|a, b| a.0.cmp(&b.0));

    Ok(images)
}
