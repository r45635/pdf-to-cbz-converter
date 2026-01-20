#!/bin/bash
cd "$(dirname "$0")"
export DYLD_LIBRARY_PATH=/usr/local/lib:$DYLD_LIBRARY_PATH
export RUST_BACKTRACE=1
npm run tauri:dev
