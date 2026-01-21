use anyhow::Result;
use std::io::Cursor;

/// Create PDF from images (from CBZ/CBR archive)
/// progress_callback: optional callback with signature (current, total) for progress updates
pub fn create_pdf_from_images<F>(images: Vec<(String, Vec<u8>)>, mut progress_callback: F) -> Result<Vec<u8>>
where
    F: FnMut(usize, usize),
{
    if images.is_empty() {
        return Err(anyhow::anyhow!("No images to convert"));
    }

    eprintln!("[PROFILE] create_pdf_from_images: creating PDF for {} images", images.len());

    use printpdf::{Mm, PdfDocument};

    let (document, page1, layer1) =
        PdfDocument::new("CBZ to PDF", Mm(210.0), Mm(297.0), "Layer 1");

    eprintln!("[PROFILE] create_pdf_from_images: PDF document created");

    let total = images.len();

    // Process first image to create first page
    if let Some((name, image_data)) = images.first() {
        eprintln!("[PROFILE] create_pdf_from_images: adding first image: {}", name);
        match add_image_to_page(&document, page1, layer1, image_data) {
            Ok(_) => {
                eprintln!("[PROFILE] create_pdf_from_images: first image added successfully");
                progress_callback(1, total);
            },
            Err(e) => {
                eprintln!("[ERROR] create_pdf_from_images: failed to add first image: {}", e);
                return Err(e);
            }
        }
    }

    // Add remaining images as new pages
    for (idx, (name, image_data)) in images.iter().skip(1).enumerate() {
        let current = idx + 2;
        eprintln!("[PROFILE] create_pdf_from_images: adding image {} of {}: {}", current, total, name);
        let (page, layer) = document.add_page(Mm(210.0), Mm(297.0), "Page");
        match add_image_to_page(&document, page, layer, image_data) {
            Ok(_) => {
                eprintln!("[PROFILE] create_pdf_from_images: image {} added successfully", current);
                progress_callback(current, total);
            },
            Err(e) => {
                eprintln!("[ERROR] create_pdf_from_images: failed to add image {}: {}", current, e);
                return Err(e);
            }
        }
    }

    // Serialize to bytes
    eprintln!("[PROFILE] create_pdf_from_images: serializing PDF to bytes");
    let pdf_bytes = document.save_to_bytes()
        .map_err(|e| anyhow::anyhow!("Failed to serialize PDF: {:?}", e))?;
    eprintln!("[PROFILE] create_pdf_from_images: PDF serialized, size: {} bytes", pdf_bytes.len());
    Ok(pdf_bytes)
}

/// Add image to PDF page
fn add_image_to_page(
    document: &printpdf::PdfDocumentReference,
    page_id: printpdf::PdfPageIndex,
    layer_id: printpdf::PdfLayerIndex,
    image_data: &[u8],
) -> Result<()> {
    use image::{ImageReader, GenericImageView, ImageFormat};
    use printpdf::{Image, ImageTransform, Mm};

    eprintln!("[PROFILE] add_image_to_page: starting, data size: {} bytes", image_data.len());

    // Detect image format without decoding
    let reader = ImageReader::new(Cursor::new(image_data));
    let reader_with_format = reader
        .with_guessed_format()
        .map_err(|e| anyhow::anyhow!("Failed to guess image format: {}", e))?;
    
    let format = reader_with_format.format();
    eprintln!("[PROFILE] add_image_to_page: detected format: {:?}", format);

    // For JPEG images, try to insert directly without decoding
    if matches!(format, Some(ImageFormat::Jpeg)) {
        eprintln!("[PROFILE] add_image_to_page: JPEG detected, attempting direct insertion");
        
        // Get dimensions using imagesize (fast, no decode)
        match imagesize::blob_size(image_data) {
            Ok(size) => {
                eprintln!("[PROFILE] add_image_to_page: got dimensions {}x{} without decoding", size.width, size.height);
                
                // Get layer
                let layer = document.get_page(page_id).get_layer(layer_id);
                
                // Create image directly from JPEG bytes
                let image_xobject = printpdf::ImageXObject {
                    width: printpdf::Px(size.width),
                    height: printpdf::Px(size.height),
                    color_space: printpdf::ColorSpace::Rgb,
                    bits_per_component: printpdf::ColorBits::Bit8,
                    image_data: image_data.to_vec(),
                    image_filter: Some(printpdf::ImageFilter::DCT), // JPEG compression
                    interpolate: true,
                    smask: None,
                    clipping_bbox: None,
                };
                
                let image = Image::from(image_xobject);
                
                // Calculate DPI to fit image on A4 page (210mm x 297mm)
                // A4 = 210mm x 297mm = 8.27" x 11.69" at 25.4mm per inch
                let page_width_inch = 210.0 / 25.4;
                let page_height_inch = 297.0 / 25.4;
                
                let img_w = size.width as f32;
                let img_h = size.height as f32;
                
                // Calculate DPI needed to fit the image on the page
                let dpi_w = img_w / page_width_inch;
                let dpi_h = img_h / page_height_inch;
                let dpi = dpi_w.max(dpi_h); // Use max to ensure image fits
                
                eprintln!("[PROFILE] add_image_to_page: direct JPEG insertion, img={}x{}, dpi={}", size.width, size.height, dpi);
                
                let transform = ImageTransform {
                    translate_x: Some(Mm(0.0)),
                    translate_y: Some(Mm(0.0)),
                    dpi: Some(dpi),
                    rotate: None,
                    ..Default::default()
                };
                
                image.add_to_layer(layer, transform);
                eprintln!("[PROFILE] add_image_to_page: JPEG added directly without decode!");
                return Ok(());
            }
            Err(e) => {
                eprintln!("[WARN] add_image_to_page: imagesize failed: {}, falling back to decode", e);
            }
        }
    }

    // Fallback: decode image (for non-JPEG or if direct insertion failed)
    eprintln!("[PROFILE] add_image_to_page: falling back to decode method");
    
    let img = reader_with_format
        .decode()
        .map_err(|e| anyhow::anyhow!("Failed to decode image: {}", e))?;

    eprintln!("[PROFILE] add_image_to_page: image decoded successfully");

    // Get layer
    let layer = document.get_page(page_id).get_layer(layer_id);
    eprintln!("[PROFILE] add_image_to_page: got layer reference");

    // Convert DynamicImage to RGB8 and create ImageXObject
    let rgb_img = img.to_rgb8();
    let (img_width, img_height) = img.dimensions();
    eprintln!("[PROFILE] add_image_to_page: converted to RGB8, dimensions: {}x{}", img_width, img_height);

    // Create image from bytes using printpdf's ImageXObject
    let image_xobject = printpdf::ImageXObject {
        width: printpdf::Px(img_width as usize),
        height: printpdf::Px(img_height as usize),
        color_space: printpdf::ColorSpace::Rgb,
        bits_per_component: printpdf::ColorBits::Bit8,
        image_data: rgb_img.to_vec(),
        image_filter: None,
        interpolate: true,
        smask: None,
        clipping_bbox: None,
    };
    eprintln!("[PROFILE] add_image_to_page: ImageXObject created");

    let image = Image::from(image_xobject);
    eprintln!("[PROFILE] add_image_to_page: Image created from ImageXObject");

    // Add image with explicit transform (fit to A4 page)
    // A4 = 210mm x 297mm = 8.27" x 11.69" at 25.4mm per inch
    let page_width_inch = 210.0 / 25.4;
    let page_height_inch = 297.0 / 25.4;
    
    let img_w = img_width as f32;
    let img_h = img_height as f32;

    // Calculate DPI needed to fit the image on the page
    let dpi_w = img_w / page_width_inch;
    let dpi_h = img_h / page_height_inch;
    let dpi = dpi_w.max(dpi_h); // Use max to ensure image fits

    eprintln!("[PROFILE] add_image_to_page: img={}x{}, dpi={}, dpi_w={}, dpi_h={}", img_width, img_height, dpi, dpi_w, dpi_h);

    let transform = ImageTransform {
        translate_x: Some(Mm(0.0)),
        translate_y: Some(Mm(0.0)),
        dpi: Some(dpi),
        rotate: None,
        ..Default::default()
    };

    eprintln!("[PROFILE] add_image_to_page: ImageTransform created with dpi={}", dpi);

    image.add_to_layer(layer, transform);
    eprintln!("[PROFILE] add_image_to_page: image added to layer successfully");

    Ok(())
}

