use anyhow::{Context, Result};
use image::ImageReader;
use printpdf::prelude::*;
use std::io::Cursor;

/// Create PDF from images (from CBZ/CBR archive)
pub fn create_pdf_from_images(images: Vec<(String, Vec<u8>)>) -> Result<Vec<u8>> {
    if images.is_empty() {
        return Err(anyhow::anyhow!("No images to convert"));
    }

    let (document, page1, layer1) = PdfDocument::new("CBZ to PDF", Mm(210.0), Mm(297.0), "Layer 1");
    let font = document.add_builtin_font(BuiltinFont::Helvetica)?;

    // Process first image to create first page
    if let Some((_, image_data)) = images.first() {
        add_image_to_page(&document, page1, layer1, image_data)?;
    }

    // Add remaining images as new pages
    for (_, image_data) in images.iter().skip(1) {
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        add_image_to_page(&document, page, layer, image_data)?;
    }

    // Serialize to bytes
    let mut output = Vec::new();
    document.save_to_bytes(&mut output)
        .context("Failed to save PDF")?;

    Ok(output)
}

/// Add image to PDF page, scaling to fit the page
fn add_image_to_page(
    document: &PdfDocumentReference,
    page_id: PdfPageIndex,
    layer_id: PdfLayerId,
    image_data: &[u8],
) -> Result<()> {
    // Decode image
    let img = ImageReader::new(Cursor::new(image_data))
        .context("Failed to create image reader")?
        .decode()
        .context("Failed to decode image")?;

    let (img_width, img_height) = img.dimensions();
    let img_width_mm = img_width as f32;
    let img_height_mm = img_height as f32;

    // Page dimensions (A4)
    let page_width_mm = 210.0f32;
    let page_height_mm = 297.0f32;

    // Calculate scaling to fit image on page while maintaining aspect ratio
    let scale_w = page_width_mm / img_width_mm;
    let scale_h = page_height_mm / img_height_mm;
    let scale = scale_w.min(scale_h).min(1.0); // Don't upscale

    let final_width = Mm(img_width_mm * scale);
    let final_height = Mm(img_height_mm * scale);

    // Center on page
    let x_offset = Mm((page_width_mm - (img_width_mm * scale)) / 2.0);
    let y_offset = Mm((page_height_mm - (img_height_mm * scale)) / 2.0);

    // Add image to PDF
    let image = Image::from_dynamic_image(&img);
    let layer = document.get_page(page_id).get_layer(layer_id);

    image.add_to_layer(
        layer,
        ImageTransform {
            translate_x: x_offset,
            translate_y: y_offset,
            scale_x: Some(scale),
            scale_y: Some(scale),
            ..Default::default()
        },
    );

    Ok(())
}
