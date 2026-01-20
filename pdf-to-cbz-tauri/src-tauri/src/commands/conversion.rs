use tauri::{AppHandle, Emitter};
use crate::models::{ImageFormat, ConversionProgress};
use crate::utils;
use rayon::prelude::*;

/// Convert PDF to CBZ
#[tauri::command]
pub async fn convert_pdf_to_cbz(
    app: AppHandle,
    path: String,
    dpi: u32,
    format: ImageFormat,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let start_total = std::time::Instant::now();
    eprintln!("[PROFILE] convert_pdf_to_cbz START: path={}, dpi={}, format={:?}", path, dpi, format);

    // First, analyze the PDF to get page count
    let analysis = crate::commands::pdf_analysis::analyze_pdf_internal(&path)
        .await
        .map_err(|e| format!("Failed to analyze PDF: {}", e))?;

    let total_pages = analysis.page_count;

    // Load PDF data once
    let pdf_data = std::fs::read(&path)
        .map_err(|e| format!("Failed to read PDF: {}", e))?;

    // Process pages in parallel using rayon
    eprintln!("[PROFILE] Processing {} pages in parallel (rayon)...", total_pages);
    let parallel_start = std::time::Instant::now();

    let page_results: Result<Vec<_>, String> = (1..=total_pages)
        .into_par_iter()
        .map(|page_num| {
            let page_start = std::time::Instant::now();

            // Render page (synchronous, safe for rayon threads)
            let render_start = std::time::Instant::now();
            let png_data = utils::render_pdf_page_sync(&pdf_data, page_num, dpi)
                .map_err(|e| format!("Failed to render page {}: {}", page_num, e))?;
            let render_time = render_start.elapsed().as_millis();
            eprintln!("[PROFILE] Page {}: PDF render took {}ms, size: {} bytes", page_num, render_time, png_data.len());

            // Convert to desired format
            let convert_start = std::time::Instant::now();
            let image_data = utils::convert_image(&png_data, &format, quality)
                .map_err(|e| format!("Failed to convert page {}: {}", page_num, e))?;
            let convert_time = convert_start.elapsed().as_millis();
            eprintln!("[PROFILE] Page {}: Image conversion took {}ms, output size: {} bytes", page_num, convert_time, image_data.len());

            let page_time = page_start.elapsed().as_millis();
            eprintln!("[PROFILE] Page {}: Total page time: {}ms (parallel)", page_num, page_time);

            let filename = format!("page_{:04}.{}", page_num, format.extension());
            Ok((page_num, filename, image_data))
        })
        .collect();

    let parallel_time = parallel_start.elapsed().as_millis();
    eprintln!("[PROFILE] Parallel processing took {}ms", parallel_time);

    // Collect results - order is maintained by page_num in filename
    let images: Vec<(String, Vec<u8>)> = page_results?
        .into_iter()
        .map(|(_, filename, data)| (filename, data))
        .collect();

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

    convert_pdf_to_cbz(app, path, optimal_dpi, format, quality).await
}
