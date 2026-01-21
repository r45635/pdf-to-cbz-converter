use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub page_number: u32,
    pub width_pt: f64,
    pub height_pt: f64,
    pub width_px: u32,
    pub height_px: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnalysisResult {
    pub page_count: u32,
    pub pages: Vec<PageInfo>,
    pub recommended_dpi: u32,
    pub pdf_size_mb: f64,
    pub native_dpi: u32,
}
