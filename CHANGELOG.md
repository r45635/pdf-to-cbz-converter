# Changelog

All notable changes to this project will be documented in this file.

## [2.4.0] - 2025-12-30

### Added
- **Bidirectional Conversion (Desktop App)**: Convert CBZ/CBR/CB7/CBT back to PDF
  - New `cbz_to_pdf.py` CLI tool with full feature parity
  - GUI mode selector for PDF→CBZ or CBZ→PDF conversion
  - Support for CBZ, CBR (with rarfile), CB7 (with py7zr), and CBT formats
  - Lossless quality preservation with img2pdf library
  - Archive analysis mode with page count and size estimates
- **Bidirectional Conversion (Web App)**: Convert CBZ back to PDF in Next.js app
  - Single file and batch conversion modes for CBZ→PDF
  - Direct extraction option (no recompression, preserves original quality)
  - Mode toggle in UI header for switching between PDF→CBZ and CBZ→PDF
  - New API endpoints:
    - `POST /api/analyze-cbz` - Analyze CBZ file structure
    - `POST /api/convert-cbz` - Convert CBZ to PDF with quality settings
    - `POST /api/extract-cbz` - Direct CBZ to PDF (SSE streaming)
    - `POST /api/batch-convert-cbz` - Batch CBZ to PDF conversion

### Changed
- Desktop app version bumped to 2.4.0
- GUI title updated to "PDF ↔ CBZ Converter"
- Default theme changed to Auto (system detection)
- Web app now supports both conversion directions

### Fixed
- Fixed preview loading error when selecting CBZ file in web app
- Fixed batch validation to accept .cbz files for CBZ→PDF conversion

### Removed
- Cleaned up obsolete documentation files (release notes, build scripts, test files)
- Removed ~13MB of test assets from repository

## [2.3.0] - 2025-12-29

### Added
- **Batch Mode**: Convert multiple PDF files simultaneously
  - Upload up to 50 PDFs at once (configurable)
  - Real-time progress tracking with SSE streaming
  - Individual file download or bulk ZIP download
  - Configurable results expiration (default 1 hour)
  - Copy download links to clipboard
- **New API Endpoints**:
  - `POST /api/batch-convert` - Batch conversion with SSE progress
  - `GET /api/batch-results/{jobId}` - Job status and download links
  - `GET /api/download/{jobId}/{fileId}` - Individual file download
  - `GET /api/download-all/{jobId}` - Download all as ZIP
  - `GET/POST /api/batch-admin` - Admin operations
- **Configurable Limits** via environment variables:
  - `BATCH_MAX_FILES` (default: 50)
  - `BATCH_MAX_FILE_SIZE_MB` (default: 500)
  - `BATCH_DEFAULT_EXPIRE_MINUTES` (default: 60)
- **UI Improvements**:
  - New batch page with drag & drop multiple files
  - Advanced settings panel for batch limits
  - Navigation between single and batch modes
  - Screenshots added to README

## [2.2.3] - 2025-12-28

### Fixed
- **Docker**: Fixed canvas rendering issues causing "Failed to generate preview" error
  - Use pdfjs-dist legacy build for better node-canvas compatibility
  - Added NodeCanvasFactory for proper pdfjs-dist integration
  - Added canvas-setup.ts for DOMMatrix and Path2D polyfills
  - Externalized canvas and sharp in next.config.ts for Docker standalone mode
  - Copy full node_modules in Dockerfile for native module support
  - Added Image polyfill for pdfjs in Node environment

## [2.2.2] - 2025-12-28

### Added
- Docker support with multi-platform builds (amd64 + arm64)
- Docker Hub auto-push in release workflow
- Docker instructions in main README

## [2.2.1] - 2025-12-28

### Fixed
- GitHub Actions workflow fixes
- Release automation improvements

## [2.2.0] - 2025-09-14

### Added
- Web application (Next.js) with live preview
- Auto-optimization for optimal file size
- Direct image extraction from PDF
- Side-by-side comparison view
- Real-time streaming progress
- Vercel deployment

## [2.1.1] - 2025-07-01

### Fixed
- Minor bug fixes and improvements

## [2.1.0] - 2025

### Added
- Enhanced PDF to CBZ Converter with Configuration Management
- Full-featured GUI with real-time preview
- CLI for scripting and batch processing
- Auto DPI detection with smart recommendations
- Multi-threaded conversion
- Pre-built executables

## [2.0.0] - 2024

### Added
- Initial release with Python desktop application
- Cross-platform support (Windows, macOS, Linux)
- Basic PDF to CBZ conversion
