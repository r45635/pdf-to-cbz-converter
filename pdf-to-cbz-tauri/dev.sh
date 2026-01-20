#!/bin/bash
# Script to run Tauri dev with PDFium library path configured

export DYLD_LIBRARY_PATH="/usr/local/lib:$DYLD_LIBRARY_PATH"
export DYLD_FALLBACK_LIBRARY_PATH="/usr/local/lib:/usr/lib"

echo "🚀 Starting Tauri dev with PDFium library path configured..."
echo "   DYLD_LIBRARY_PATH=$DYLD_LIBRARY_PATH"

npm run tauri:dev
