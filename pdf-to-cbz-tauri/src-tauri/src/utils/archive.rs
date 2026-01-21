use anyhow::{Context, Result};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use std::io::{Cursor, Read, Write};
use std::process::Command;
use uuid::Uuid;

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
    let start = std::time::Instant::now();
    eprintln!("[PROFILE] analyze_cbz start for: {}", cbz_path);

    // Get file size
    let metadata = tokio::fs::metadata(cbz_path)
        .await
        .context("Failed to read file metadata")?;
    let cbz_size_mb = metadata.len() as f64 / (1024.0 * 1024.0);
    eprintln!("[PROFILE] File size: {:.2} MB", cbz_size_mb);

    // Open file without reading everything into memory
    let file = std::fs::File::open(cbz_path)
        .context("Failed to open CBZ file")?;

    let mut archive = ZipArchive::new(file)
        .context("Failed to open CBZ archive")?;

    let mut pages = Vec::new();
    let list_start = std::time::Instant::now();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .context(format!("Failed to read file at index {}", i))?;

        let file_name = file.name().to_string();
        
        // Skip non-image files
        if !is_image_file(&file_name) {
            continue;
        }

        let size_kb = file.size() as f64 / 1024.0;

        // Read only enough data to get dimensions (header only, not full image)
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .context("Failed to read file contents")?;

        // Get image dimensions using fast method (just reads header)
        let (width, height) = crate::utils::get_image_dimensions(&buffer)
            .unwrap_or((0, 0));

        let format = detect_image_format(&file_name);

        pages.push(CbzPageInfo {
            page_number: (pages.len() + 1) as u32,
            file_name,
            width,
            height,
            format,
            size_kb,
        });
    }

    eprintln!("[PROFILE] Listed {} images in {}ms", pages.len(), list_start.elapsed().as_millis());

    // Sort pages by filename
    pages.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    
    // Update page numbers after sorting
    for (i, page) in pages.iter_mut().enumerate() {
        page.page_number = (i + 1) as u32;
    }

    eprintln!("[PROFILE] Total analyze_cbz time: {}ms", start.elapsed().as_millis());

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

/// Extract images from CBZ/CBR archive (supports both ZIP and RAR formats)
pub fn extract_images_from_cbz(cbz_data: &[u8]) -> Result<Vec<(String, Vec<u8>)>> {
    // Try to detect if it's a RAR file by checking the magic bytes
    let is_rar = cbz_data.len() >= 7 && &cbz_data[0..7] == b"Rar!\x1a\x07\x00";

    if is_rar {
        eprintln!("[PROFILE] extract_images_from_cbz: detected RAR format (CBR)");
        extract_images_from_rar(cbz_data)
    } else {
        eprintln!("[PROFILE] extract_images_from_cbz: detected ZIP format (CBZ)");
        extract_images_from_zip(cbz_data)
    }
}

/// Extract images from ZIP archive (CBZ format)
fn extract_images_from_zip(cbz_data: &[u8]) -> Result<Vec<(String, Vec<u8>)>> {
    let cursor = Cursor::new(cbz_data);
    let mut archive = ZipArchive::new(cursor)
        .context("Failed to open CBZ archive")?;

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

/// Extract images from RAR archive (CBR format)
fn extract_images_from_rar(cbr_data: &[u8]) -> Result<Vec<(String, Vec<u8>)>> {
    use std::io::Write;

    // Write RAR data to a temporary file
    let temp_dir = std::env::temp_dir();
    let temp_cbr = temp_dir.join(format!("temp_{}.cbr", Uuid::new_v4()));
    let temp_extract_dir = temp_dir.join(format!("cbr_extract_{}", Uuid::new_v4()));

    // Create temp CBR file
    let mut temp_file_handle = std::fs::File::create(&temp_cbr)
        .context("Failed to create temporary CBR file")?;
    temp_file_handle.write_all(cbr_data)
        .context("Failed to write CBR data to temporary file")?;
    drop(temp_file_handle);

    eprintln!("[PROFILE] extract_images_from_rar: created temp CBR file at {:?}", temp_cbr);

    // Create extraction directory
    std::fs::create_dir_all(&temp_extract_dir)
        .context("Failed to create extraction directory")?;

    eprintln!("[PROFILE] extract_images_from_rar: created extraction dir at {:?}", temp_extract_dir);

    // Extract using unar command
    let output = Command::new("unar")
        .arg("-o")
        .arg(&temp_extract_dir)
        .arg(&temp_cbr)
        .output()
        .context("Failed to execute unar command. Make sure unar is installed (brew install unar)")?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        eprintln!("[ERROR] extract_images_from_rar: unar command failed: {}", error_msg);
        return Err(anyhow::anyhow!("Failed to extract RAR archive: {}", error_msg));
    }

    eprintln!("[PROFILE] extract_images_from_rar: extraction completed");

    // Read extracted files
    let mut images: Vec<(String, Vec<u8>)> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&temp_extract_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    let file_name = path.file_name()
                        .ok_or_else(|| anyhow::anyhow!("Failed to get filename"))?
                        .to_string_lossy()
                        .to_string();

                    if is_image_file(&file_name) {
                        eprintln!("[PROFILE] extract_images_from_rar: found image: {}", file_name);
                        let buffer = std::fs::read(&path)
                            .context(format!("Failed to read extracted file: {}", file_name))?;
                        images.push((file_name, buffer));
                    }
                }
            }
        }
    }

    // Clean up temporary files
    let _ = std::fs::remove_file(&temp_cbr);
    let _ = std::fs::remove_dir_all(&temp_extract_dir);

    // Sort by filename to maintain page order
    images.sort_by(|a, b| a.0.cmp(&b.0));

    eprintln!("[PROFILE] extract_images_from_rar: extracted {} images from RAR", images.len());

    Ok(images)
}
