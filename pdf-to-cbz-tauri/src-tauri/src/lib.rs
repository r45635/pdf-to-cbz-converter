mod commands;
mod models;
mod utils;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            analyze_pdf,
            analyze_cbz,
            generate_preview,
            generate_cbz_preview,
            convert_pdf_to_cbz,
            convert_cbz_to_pdf,
            save_last_pdf,
            optimize_pdf,
            open_file_with_default_app,
            get_file_size,
            cancel_conversion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
