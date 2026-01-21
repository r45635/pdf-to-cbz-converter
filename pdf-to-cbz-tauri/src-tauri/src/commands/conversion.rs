use tauri::{AppHandle, Emitter};
use crate::models::{ImageFormat, ConversionProgress};
use crate::utils;
use std::sync::Mutex;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

// Global storage for large PDF files
lazy_static::lazy_static! {
    static ref LAST_PDF: Mutex<Option<Vec<u8>>> = Mutex::new(None);
    static ref CANCEL_FLAG: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

/// Convert PDF to CBZ
#[tauri::command]
pub async fn convert_pdf_to_cbz(
    app: AppHandle,
    path: String,
    dpi: u32,
    format: ImageFormat,
    quality: u8,
    direct_extract: bool,  // New parameter for direct extraction
) -> Result<Vec<u8>, String> {
    let start_total = std::time::Instant::now();
    eprintln!("[PROFILE] convert_pdf_to_cbz START: path={}, dpi={}, format={:?}, direct_extract={}", 
             path, dpi, format, direct_extract);

    // If direct extraction is requested and format is JPEG, try to extract images directly
    if direct_extract && matches!(format, ImageFormat::Jpeg) {
        eprintln!("[PROFILE] Attempting direct image extraction...");
        match utils::extract_images_from_pdf(&path) {
            Ok(images) => {
                eprintln!("[PROFILE] Direct extraction successful, {} images extracted", images.len());
                
                // Emit progress
                let total_pages = images.len() as u32;
                let progress = ConversionProgress {
                    current_page: total_pages,
                    total_pages,
                    percentage: 100.0,
                    status: "processing".to_string(),
                    message: Some(format!("Extracted {} images directly", total_pages)),
                };
                let _ = app.emit("conversion-progress", &progress);
                
                // Create CBZ archive
                let progress = ConversionProgress {
                    current_page: total_pages,
                    total_pages,
                    percentage: 100.0,
                    status: "finalizing".to_string(),
                    message: Some("Creating CBZ archive...".to_string()),
                };
                let _ = app.emit("conversion-progress", &progress);
                
                let archive_start = std::time::Instant::now();
                let cbz_data = utils::create_cbz(images)
                    .map_err(|e| format!("Failed to create CBZ: {}", e))?;
                let archive_time = archive_start.elapsed().as_millis();
                eprintln!("[PROFILE] CBZ archive creation took {}ms, final size: {} bytes", archive_time, cbz_data.len());
                
                // Emit completion
                let progress = ConversionProgress {
                    current_page: total_pages,
                    total_pages,
                    percentage: 100.0,
                    status: "completed".to_string(),
                    message: Some("Conversion completed (direct extraction)".to_string()),
                };
                let _ = app.emit("conversion-progress", &progress);
                
                let total_time = start_total.elapsed().as_millis();
                eprintln!("[PROFILE] convert_pdf_to_cbz (DIRECT) TOTAL TIME: {}ms ({:.1}s)", 
                         total_time, total_time as f64 / 1000.0);
                
                return Ok(cbz_data);
            }
            Err(e) => {
                eprintln!("[WARN] Direct extraction failed: {}. Falling back to standard rendering.", e);
                // Fall through to standard rendering below
            }
        }
    }

    // Standard rendering path
    eprintln!("[PROFILE] Using standard rendering mode");
    
    // First, analyze the PDF to get page count
    let analysis = crate::commands::pdf_analysis::analyze_pdf_internal(&path)
        .await
        .map_err(|e| format!("Failed to analyze PDF: {}", e))?;

    let total_pages = analysis.page_count;

    // Load PDF data once
    let pdf_data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    // Reset cancellation flag at start
    CANCEL_FLAG.store(false, Ordering::Relaxed);
    
    // Process pages SEQUENTIALLY to allow cancellation between pages
    eprintln!("[PROFILE] Processing {} pages sequentially (allows cancellation)...", total_pages);
    let sequential_start = std::time::Instant::now();

    let mut page_results = Vec::new();
    
    for page_num in 1..=total_pages {
        // Check if cancelled before processing this page
        if CANCEL_FLAG.load(Ordering::Relaxed) {
            eprintln!("[DEBUG] Cancellation detected, stopping at page {}/{}", page_num, total_pages);
            return Err("Conversion cancelled by user".to_string());
        }
        
        let page_start = std::time::Instant::now();

        // Render page (synchronous)
        let render_start = std::time::Instant::now();
        let png_data = utils::render_pdf_page_sync(&pdf_data, page_num, dpi)
            .map_err(|e| format!("Failed to render page {}: {}", page_num, e))?;
        let render_time = render_start.elapsed().as_millis();
        eprintln!("[PROFILE] Page {}: PDF render took {}ms, size: {} bytes", page_num, render_time, png_data.len());

        // Check cancellation again after rendering (in case it's slow)
        if CANCEL_FLAG.load(Ordering::Relaxed) {
            eprintln!("[DEBUG] Cancellation detected after rendering page {}", page_num);
            return Err("Conversion cancelled by user".to_string());
        }

        // Convert to desired format
        let convert_start = std::time::Instant::now();
        let image_data = utils::convert_image(&png_data, &format, quality)
            .map_err(|e| format!("Failed to convert page {}: {}", page_num, e))?;
        let convert_time = convert_start.elapsed().as_millis();
        eprintln!("[PROFILE] Page {}: Image conversion took {}ms, output size: {} bytes", page_num, convert_time, image_data.len());

        let page_time = page_start.elapsed().as_millis();
        eprintln!("[PROFILE] Page {}: Total page time: {}ms", page_num, page_time);

        let filename = format!("page_{:04}.{}", page_num, format.extension());
        page_results.push((filename, image_data));
        
        // Emit progress update after each page
        let progress = ConversionProgress {
            current_page: page_num,
            total_pages,
            percentage: (page_num as f32 / total_pages as f32) * 100.0,
            status: "processing".to_string(),
            message: Some(format!("Processed {}/{} pages", page_num, total_pages)),
        };
        let _ = app.emit("conversion-progress", &progress);
    }

    let sequential_time = sequential_start.elapsed().as_millis();
    eprintln!("[PROFILE] Sequential processing took {}ms", sequential_time);

    // Collect results
    let images: Vec<(String, Vec<u8>)> = page_results;

    // Emit progress update
    let progress = ConversionProgress {
        current_page: total_pages,
        total_pages,
        percentage: 100.0,
        status: "processing".to_string(),
        message: Some(format!("Processed {}/{} pages", total_pages, total_pages)),
    };
    let _ = app.emit("conversion-progress", &progress);

    // Create CBZ archive
    let progress = ConversionProgress {
        current_page: total_pages,
        total_pages,
        percentage: 100.0,
        status: "finalizing".to_string(),
        message: Some("Creating CBZ archive...".to_string()),
    };
    let _ = app.emit("conversion-progress", &progress);

    let archive_start = std::time::Instant::now();
    let cbz_data = utils::create_cbz(images)
        .map_err(|e| format!("Failed to create CBZ: {}", e))?;
    let archive_time = archive_start.elapsed().as_millis();
    eprintln!("[PROFILE] CBZ archive creation took {}ms, final size: {} bytes", archive_time, cbz_data.len());

    // Emit completion
    let progress = ConversionProgress {
        current_page: total_pages,
        total_pages,
        percentage: 100.0,
        status: "completed".to_string(),
        message: Some("Conversion completed".to_string()),
    };
    let _ = app.emit("conversion-progress", &progress);

    let total_time = start_total.elapsed().as_millis();
    eprintln!("[PROFILE] convert_pdf_to_cbz TOTAL TIME: {}ms ({:.1}s)", total_time, total_time as f64 / 1000.0);

    Ok(cbz_data)
}

/// Convert CBZ/CBR to PDF
#[tauri::command]
pub async fn convert_cbz_to_pdf(
    app: AppHandle,
    path: String,
) -> Result<Vec<u8>, String> {
    let start_total = std::time::Instant::now();
    eprintln!("[PROFILE] convert_cbz_to_pdf START: path={}", path);

    // Read CBZ/CBR file
    let cbz_data = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read CBZ/CBR file: {}", e))?;

    // Extract images
    let extract_start = std::time::Instant::now();
    let images = utils::extract_images_from_cbz(&cbz_data)
        .map_err(|e| format!("Failed to extract images: {}", e))?;
    let extract_time = extract_start.elapsed().as_millis();
    eprintln!("[PROFILE] Extracted {} images in {}ms", images.len(), extract_time);

    // Emit progress
    let progress = ConversionProgress {
        current_page: 0,
        total_pages: images.len() as u32,
        percentage: 10.0,
        status: "processing".to_string(),
        message: Some(format!("Creating PDF from {} images...", images.len())),
    };
    let _ = app.emit("conversion-progress", &progress);

    // Create PDF (this blocks, so we'll emit periodic updates)
    let pdf_start = std::time::Instant::now();
    
    // Simple progress tracking without callbacks to avoid blocking
    let pdf_data = utils::create_pdf_from_images(images, |current, total| {
        // Only emit every 10 images to avoid flooding
        if current % 10 == 0 || current == total {
            eprintln!("[PROGRESS] Processing image {} of {}", current, total);
        }
    }).map_err(|e| format!("Failed to create PDF: {}", e))?;
    
    let pdf_time = pdf_start.elapsed().as_millis();
    eprintln!("[PROFILE] PDF creation took {}ms, size: {} bytes", pdf_time, pdf_data.len());

    // Emit completion
    let progress = ConversionProgress {
        current_page: 1,
        total_pages: 1,
        percentage: 100.0,
        status: "completed".to_string(),
        message: Some("Conversion completed".to_string()),
    };
    let _ = app.emit("conversion-progress", &progress);

    let total_time = start_total.elapsed().as_millis();
    eprintln!("[PROFILE] convert_cbz_to_pdf TOTAL TIME: {}ms ({:.1}s)", total_time, total_time as f64 / 1000.0);

    // Store PDF in memory and return just the size (IPC size limit workaround)
    let pdf_size = pdf_data.len();
    eprintln!("[STORAGE] Storing PDF in memory: {} bytes", pdf_size);
    *LAST_PDF.lock().unwrap() = Some(pdf_data);
    
    // Return just the size as a marker (4 bytes for size as u32)
    Ok(vec![0xFF, 0xFE, 0xFD, 0xFC]) // Magic marker
}

/// Save the last converted PDF to a file chosen by the user
#[tauri::command]
pub async fn save_last_pdf(path: String) -> Result<(), String> {
    eprintln!("[SAVE] Saving PDF to: {}", path);
    
    let pdf_data = LAST_PDF.lock().unwrap().clone();
    let pdf_data = pdf_data.ok_or("No PDF data available")?;
    
    std::fs::write(&path, &pdf_data)
        .map_err(|e| format!("Failed to write PDF: {}", e))?;
    
    eprintln!("[SAVE] PDF saved successfully: {} bytes", pdf_data.len());
    
    // Clear the stored PDF
    *LAST_PDF.lock().unwrap() = None;
    
    Ok(())
}

/// Optimize PDF (auto-detect best settings)
#[tauri::command]
pub async fn optimize_pdf(
    app: AppHandle,
    path: String,
) -> Result<Vec<u8>, String> {
    // Analyze PDF to determine optimal settings
    let analysis = crate::commands::pdf_analysis::analyze_pdf_internal(&path)
        .await
        .map_err(|e| format!("Failed to analyze PDF: {}", e))?;

    // Use native DPI as the optimal DPI
    let optimal_dpi = analysis.native_dpi;
    
    // Use JPEG with quality 85 for comics (good balance)
    let format = ImageFormat::Jpeg;
    let quality = 85;
    let direct_extract = true;  // Enable direct extraction for optimization

    convert_pdf_to_cbz(app, path, optimal_dpi, format, quality, direct_extract).await
}

/// Open a file with the default system application
#[tauri::command]
pub fn open_file_with_default_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    Ok(())
}

/// Get file size in bytes
#[tauri::command]
pub fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|metadata| metadata.len())
        .map_err(|e| format!("Failed to get file size: {}", e))
}

#[tauri::command]
pub fn cancel_conversion() -> Result<(), String> {
    eprintln!("[DEBUG] Conversion cancellation requested");
    CANCEL_FLAG.store(true, Ordering::Relaxed);
    Ok(())
}
