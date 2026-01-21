use anyhow::{Context, Result};
use lopdf::Document;

/// Extract images directly from PDF without rendering
/// Returns Vec<(filename, image_data)>
pub fn extract_images_from_pdf(pdf_path: &str) -> Result<Vec<(String, Vec<u8>)>> {
    let start = std::time::Instant::now();
    eprintln!("[PROFILE] extract_images_from_pdf START: {}", pdf_path);
    
    let doc = Document::load(pdf_path)
        .context("Failed to load PDF document")?;
    
    let mut images = Vec::new();
    let mut image_counter = 1;
    
    // Iterate through all pages
    let pages = doc.get_pages();
    eprintln!("[PROFILE] Found {} pages", pages.len());
    
    for (_page_num, page_id) in pages.iter() {
        // Get page resources
        if let Ok((resources_dict_opt, _)) = doc.get_page_resources(*page_id) {
            if let Some(resources_dict) = resources_dict_opt {
                // Look for XObject in resources
                if let Ok(xobjects) = resources_dict.get(b"XObject") {
                    if let Ok(xobjects_dict) = xobjects.as_dict() {
                        for (_name, object_ref) in xobjects_dict.iter() {
                            if let Ok(object_id) = object_ref.as_reference() {
                                if let Ok(stream) = doc.get_object(object_id) {
                                    if let Ok(stream_dict) = stream.as_stream() {
                                        let dict = &stream_dict.dict;
                                        
                                        // Check if this is an image
                                        if let Ok(subtype) = dict.get(b"Subtype") {
                                            if let Ok(subtype_name) = subtype.as_name_str() {
                                                if subtype_name == "Image" {
                                                    // Try to extract the image
                                                    if let Some(image_data) = extract_image_from_stream(stream_dict) {
                                                        let filename = format!("page_{:04}.jpg", image_counter);
                                                        eprintln!("[PROFILE] Extracted image {}, size: {} bytes", 
                                                                 image_counter, image_data.len());
                                                        images.push((filename, image_data));
                                                        image_counter += 1;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    let total_time = start.elapsed().as_millis();
    eprintln!("[PROFILE] extract_images_from_pdf TOTAL TIME: {}ms ({:.1}s), extracted {} images", 
             total_time, total_time as f64 / 1000.0, images.len());
    
    if images.is_empty() {
        return Err(anyhow::anyhow!("No images found in PDF. The PDF may contain rendered content instead of embedded images. Use standard conversion mode."));
    }
    
    Ok(images)
}

fn extract_image_from_stream(stream: &lopdf::Stream) -> Option<Vec<u8>> {
    let dict = &stream.dict;
    
    // Check if it's a JPEG (DCTDecode filter)
    if let Ok(filter) = dict.get(b"Filter") {
        let filter_name = match filter {
            lopdf::Object::Name(name) => Some(name.as_slice()),
            lopdf::Object::Array(arr) => {
                if let Some(lopdf::Object::Name(name)) = arr.first() {
                    Some(name.as_slice())
                } else {
                    None
                }
            }
            _ => None,
        };
        
        if let Some(filter_name) = filter_name {
            if filter_name == b"DCTDecode" {
                // This is a JPEG - return the raw stream data
                eprintln!("[PROFILE] Found DCTDecode (JPEG) image");
                return Some(stream.content.clone());
            } else {
                eprintln!("[PROFILE] Found image with filter: {:?}", String::from_utf8_lossy(filter_name));
            }
        }
    }
    
    // For non-JPEG images, we could try to decode them, but for now we skip them
    // This would require handling FlateDecode, LZWDecode, etc.
    None
}
