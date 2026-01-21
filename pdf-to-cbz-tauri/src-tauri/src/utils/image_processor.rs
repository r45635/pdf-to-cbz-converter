use anyhow::{Context, Result};
use image::{DynamicImage, ImageReader, ImageEncoder, GenericImageView};
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

/// Get image dimensions without fully decoding the image (much faster)
pub fn get_image_dimensions(input: &[u8]) -> Result<(u32, u32)> {
    // Use imagesize crate for fast dimension reading without decoding
    match imagesize::blob_size(input) {
        Ok(size) => Ok((size.width as u32, size.height as u32)),
        Err(_) => {
            // Fallback to full decode if imagesize fails
            let img = ImageReader::new(Cursor::new(input))
                .with_guessed_format()
                .context("Failed to detect image format")?
                .decode()
                .context("Failed to decode image")?;
            Ok(img.dimensions())
        }
    }
}
