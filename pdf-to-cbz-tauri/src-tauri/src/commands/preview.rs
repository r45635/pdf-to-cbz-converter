use crate::models::ImageFormat;
use crate::utils;
use std::collections::HashMap;
use std::sync::Mutex;

// Cache for CBZ file lists to avoid re-scanning on every preview
lazy_static::lazy_static! {
    static ref CBZ_FILE_CACHE: Mutex<HashMap<String, Vec<String>>> = Mutex::new(HashMap::new());
}

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
    let start = std::time::Instant::now();
    eprintln!("[PROFILE] generate_cbz_preview start: page={}, format={:?}", page, format);

    use std::io::Read;
    use zip::ZipArchive;

    // Open file without reading everything into memory
    let open_start = std::time::Instant::now();
    
    // Check cache first
    let image_files = {
        let cache = CBZ_FILE_CACHE.lock().unwrap();
        cache.get(&path).cloned()
    };

    let image_files = if let Some(cached) = image_files {
        eprintln!("[PROFILE] Using cached file list ({} files)", cached.len());
        cached
    } else {
        let file = std::fs::File::open(&path)
            .map_err(|e| format!("Failed to open CBZ: {}", e))?;
        eprintln!("[PROFILE] File open took {}ms", open_start.elapsed().as_millis());

        let list_start = std::time::Instant::now();
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("Failed to open CBZ archive: {}", e))?;

        // Get list of image files (just names, no reading)
        let mut files: Vec<String> = (0..archive.len())
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

        files.sort();
        eprintln!("[PROFILE] Listing and sorting {} image files took {}ms", files.len(), list_start.elapsed().as_millis());

        // Cache the list
        {
            let mut cache = CBZ_FILE_CACHE.lock().unwrap();
            cache.insert(path.clone(), files.clone());
        }

        files
    };

    if page == 0 || page > image_files.len() as u32 {
        return Err(format!("Invalid page number: {} (total: {})", page, image_files.len()));
    }

    // Now extract just the requested image
    let extract_start = std::time::Instant::now();
    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Failed to reopen CBZ: {}", e))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to open CBZ archive: {}", e))?;
    let file_name = &image_files[(page - 1) as usize];
    let mut file = archive
        .by_name(file_name)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read file contents: {}", e))?;
    eprintln!("[PROFILE] Extract image took {}ms, size: {} bytes", extract_start.elapsed().as_millis(), buffer.len());

    // Check if image is already in the requested format - if so, return it directly!
    let image_already_correct_format = match format {
        ImageFormat::Jpeg => file_name.to_lowercase().ends_with(".jpg") || file_name.to_lowercase().ends_with(".jpeg"),
        ImageFormat::Png => file_name.to_lowercase().ends_with(".png"),
    };

    if image_already_correct_format {
        eprintln!("[PROFILE] Image already in correct format, returning directly. Total time: {}ms", start.elapsed().as_millis());
        return Ok(buffer);
    }

    // Convert if needed
    let convert_start = std::time::Instant::now();
    let result = utils::convert_image(&buffer, &format, quality)
        .map_err(|e| format!("Failed to convert image: {}", e))?;
    eprintln!("[PROFILE] Image conversion took {}ms, output size: {} bytes", convert_start.elapsed().as_millis(), result.len());
    eprintln!("[PROFILE] Total generate_cbz_preview time: {}ms", start.elapsed().as_millis());

    Ok(result)
}

fn is_image_file(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".jpg") ||
    lower.ends_with(".jpeg") ||
    lower.ends_with(".png") ||
    lower.ends_with(".webp") ||
    lower.ends_with(".gif")
}
