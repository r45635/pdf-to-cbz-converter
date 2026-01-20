use crate::models::EstimatedSize;

/// Estimate the output size of a conversion
pub fn estimate_conversion_size(
    page_count: u32,
    avg_width_px: u32,
    avg_height_px: u32,
    format: &crate::models::ImageFormat,
    quality: u8,
) -> EstimatedSize {
    let pixels_per_page = (avg_width_px * avg_height_px) as f64;
    
    // Bytes per pixel based on format and quality
    let bytes_per_pixel = match format {
        crate::models::ImageFormat::Jpeg => {
            // JPEG compression varies with quality
            // At quality 85: ~0.15-0.25 bytes/pixel for comics
            // At quality 100: ~0.5-0.8 bytes/pixel
            let base = 0.15;
            let quality_factor = quality as f64 / 85.0;
            base * quality_factor
        }
        crate::models::ImageFormat::Png => {
            // PNG is lossless but compresses well for comics
            // ~0.3-0.5 bytes/pixel for comic artwork
            0.4
        }
    };

    let estimated_bytes_per_page = pixels_per_page * bytes_per_pixel;
    let total_bytes = estimated_bytes_per_page * page_count as f64;
    let estimated_size_mb = total_bytes / (1024.0 * 1024.0);

    // Compression ratio is a placeholder
    // In practice, we'd compare to original PDF size
    let compression_ratio = 1.0;

    EstimatedSize {
        estimated_size_mb,
        compression_ratio,
    }
}
