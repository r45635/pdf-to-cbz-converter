# Changelog

All notable changes to this project will be documented in this file.

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
