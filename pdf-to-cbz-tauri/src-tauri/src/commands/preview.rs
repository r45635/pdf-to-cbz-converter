use crate::models::ImageFormat;
use crate::utils;

/// Generate a preview image for a specific PDF page
#[tauri::command]
pub async fn generate_preview(
    path: String,
    page: u32,
    dpi: u32,
    format: ImageFormat,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let start = std::time::Instant::now();
    eprintln!("[PROFILE] generate_preview start: page={}, dpi={}, format={:?}", page, dpi, format);

    // Render the page
    let render_start = std::time::Instant::now();
    let png_data = utils::render_pdf_page(&path, page, dpi)
        .await
        .map_err(|e| format!("Failed to render page: {}", e))?;
    eprintln!("[PROFILE] PDF render took {}ms, size: {} bytes", render_start.elapsed().as_millis(), png_data.len());

    // Convert to requested format if needed
    if matches!(format, ImageFormat::Png) {
        eprintln!("[PROFILE] PNG format, returning as-is. Total time: {}ms", start.elapsed().as_millis());
        return Ok(png_data);
    }

    let convert_start = std::time::Instant::now();
    let result = utils::convert_image(&png_data, &format, quality)
        .map_err(|e| format!("Failed to convert image: {}", e))?;
    eprintln!("[PROFILE] Image conversion took {}ms, output size: {} bytes", convert_start.elapsed().as_millis(), result.len());
    eprintln!("[PROFILE] Total generate_preview time: {}ms", start.elapsed().as_millis());

    Ok(result)
}

/// Generate a preview from CBZ file
#[tauri::command]
pub async fn generate_cbz_preview(
    path: String,
    page: u32,
    format: ImageFormat,
    quality: u8,
) -> Result<Vec<u8>, String> {
    use std::io::Read;
    use zip::ZipArchive;

    let cbz_data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read CBZ: {}", e))?;

    let cursor = std::io::Cursor::new(cbz_data);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to open CBZ: {}", e))?;

    // Get list of image files
    let mut image_files: Vec<String> = (0..archive.len())
        .filter_map(|i| {
            archive.by_index(i).ok().and_then(|f| {
                let name = f.name().to_string();
                if is_image_file(&name) {
                    Some(name)
                } else {
                    None
                }
            })
        })
        .collect();

    image_files.sort();

    if page == 0 || page > image_files.len() as u32 {
        return Err("Invalid page number".to_string());
    }

    let file_name = &image_files[(page - 1) as usize];
    let mut file = archive
        .by_name(file_name)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read file contents: {}", e))?;

    // Convert if needed
    utils::convert_image(&buffer, &format, quality)
        .map_err(|e| format!("Failed to convert image: {}", e))
}

fn is_image_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".jpg") ||
    lower.ends_with(".jpeg") ||
    lower.ends_with(".png") ||
    lower.ends_with(".webp") ||
    lower.ends_with(".gif")
}
