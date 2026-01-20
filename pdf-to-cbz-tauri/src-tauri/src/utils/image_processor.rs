use anyhow::{Context, Result};
use image::{DynamicImage, ImageReader, ImageFormat as ImgFormat, ImageEncoder, GenericImageView};
use std::io::Cursor;

use crate::models::ImageFormat;

/// Convert image bytes to specified format with quality settings
pub fn convert_image(
    input: &[u8],
    format: &ImageFormat,
    quality: u8,
) -> Result<Vec<u8>> {
    // Load input image
    let img = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .context("Failed to detect image format")?
        .decode()
        .context("Failed to decode image")?;

    encode_image(&img, format, quality)
}

/// Encode a DynamicImage to the specified format
pub fn encode_image(
    img: &DynamicImage,
    format: &ImageFormat,
    quality: u8,
) -> Result<Vec<u8>> {
    let mut output = Vec::new();

    match format {
        ImageFormat::Jpeg => {
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut output,
                quality,
            );

            // Convert to RGB8 (JPEG doesn't support alpha channel)
            let rgb = img.to_rgb8();
            encoder
                .encode(
                    rgb.as_raw(),
                    img.width(),
                    img.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .context("JPEG encoding failed")?;
        }
        ImageFormat::Png => {
            let encoder = image::codecs::png::PngEncoder::new(&mut output);
            let rgba = img.to_rgba8();

            encoder
                .write_image(
                    rgba.as_raw(),
                    img.width(),
                    img.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .context("PNG encoding failed")?;
        }
    }

    Ok(output)
}

/// Resize image to max dimensions while preserving aspect ratio
pub fn resize_image(
    input: &[u8],
    max_width: u32,
    max_height: u32,
) -> Result<Vec<u8>> {
    let img = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .context("Failed to detect image format")?
        .decode()
        .context("Failed to decode image")?;

    let (width, height) = img.dimensions();

    // Calculate scale to fit within max dimensions
    let scale_x = max_width as f64 / width as f64;
    let scale_y = max_height as f64 / height as f64;
    let scale = scale_x.min(scale_y).min(1.0); // Don't upscale

    if scale >= 1.0 {
        // No resizing needed, return as PNG
        let mut output = Vec::new();
        img.write_to(&mut Cursor::new(&mut output), ImgFormat::Png)
            .context("Failed to encode image")?;
        return Ok(output);
    }

    let new_width = (width as f64 * scale).round() as u32;
    let new_height = (height as f64 * scale).round() as u32;

    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Lanczos3);

    let mut output = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut output), ImgFormat::Png)
        .context("Failed to encode resized image")?;

    Ok(output)
}

/// Get image dimensions
pub fn get_image_dimensions(input: &[u8]) -> Result<(u32, u32)> {
    let img = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .context("Failed to detect image format")?
        .decode()
        .context("Failed to decode image")?;

    Ok(img.dimensions())
}
