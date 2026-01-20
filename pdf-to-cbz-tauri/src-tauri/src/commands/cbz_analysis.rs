use crate::models::CbzAnalysisResult;

/// Analyze CBZ file
#[tauri::command]
pub async fn analyze_cbz(path: String) -> Result<CbzAnalysisResult, String> {
    crate::utils::analyze_cbz(&path)
        .await
        .map_err(|e| format!("Failed to analyze CBZ: {}", e))
}
