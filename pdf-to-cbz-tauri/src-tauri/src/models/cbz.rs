use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CbzPageInfo {
    pub page_number: u32,
    pub file_name: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_kb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CbzAnalysisResult {
    pub page_count: u32,
    pub pages: Vec<CbzPageInfo>,
    pub cbz_size_mb: f64,
}
