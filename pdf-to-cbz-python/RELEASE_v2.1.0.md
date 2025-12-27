# 🚀 PDF to CBZ Converter v2.1.0 Release

**Release Date**: January 5, 2025  
**Version**: v2.1.0  
**Build**: 20250105  

## 📋 Release Summary

This release focuses on significant user experience improvements, particularly in the preview/zoom functionality and workflow optimization. The GUI has been enhanced with better visual feedback, protected layouts, and intelligent settings transfer capabilities.

## ✨ New Features

### 🔍 Enhanced Preview System
- **Always-visible zoom controls** with fixed-size zoom areas positioned above images
- **Selectable zoom levels**: "Normal" (15%), "Puissant" (8%), "Ultra" (4%) 
- **Keyboard shortcuts**: Press 1, 2, or 3 to quickly switch zoom modes
- **Help button** with detailed explanation of zoom modes in French/English
- **Auto-updating preview** that refreshes on page/DPI/quality changes and window resize

### ⚙️ Smart Settings Transfer
- **Protocol handler** for preview window close with automatic prompt to apply settings
- **"Apply Settings to Main" button** in preview window for instant transfer
- **Intelligent settings sync** between preview and main GUI (DPI, quality, format)

### 📊 Improved Layout & Info Display
- **Protected info bar** that's always visible and never gets overlapped by images
- **Enhanced file size metrics** showing PDF size, per-page size, projected CBZ size
- **Improved image scaling** with proper padding and aspect ratio preservation
- **Compact control layout** maximizing space for image preview

### 🧹 Code Quality Improvements
- **Cleaned up duplicate imports** in main GUI file
- **Removed unused code** and temporary files
- **Better error handling** throughout the application
- **Improved code organization** and documentation

## 🔧 Technical Details

### Files Modified
- `pdf_to_cbz_gui.py`: Major refactoring of preview/zoom logic
- `README.md`: Updated feature documentation and version
- `CHANGELOG.md`: Added comprehensive v2.1.0 changelog
- `version_info.txt`: Updated version numbers for builds

### Key Methods Added
- `_apply_preview_settings_to_main()`: Transfer preview settings to main GUI
- `_on_preview_window_close()`: Handle window close with settings prompt
- `_fix_zoom_area_size()`: Maintain fixed zoom area dimensions
- `_show_zoom_help()`: Display zoom mode help dialog

## 🎯 User Benefits

1. **Better Workflow**: Seamless transition from preview to conversion with settings retention
2. **Enhanced Visibility**: Protected info bar ensures critical information is always visible
3. **Improved Usability**: Intuitive zoom controls with keyboard shortcuts and help
4. **Visual Consistency**: Fixed-size elements prevent UI jumping and layout issues
5. **Professional Polish**: Cleaner code, better error handling, and smoother experience

## 🔄 Upgrade Path

Users can upgrade by:
1. Downloading the new release binaries, or
2. Pulling the latest code and running with existing Python environment
3. No configuration changes required - all settings are backward compatible

## ✅ Testing Status

- ✅ Syntax validation passed
- ✅ Import cleanup verified  
- ✅ GUI layout tested
- ✅ Settings transfer functionality verified
- ✅ Zoom system operational
- ✅ Error handling improved

## 📦 Build Instructions

For developers wanting to build from source:

```powershell
# Clean build
.\build_v2.ps1

# Or manual build
pyinstaller pdf_to_cbz_v2.spec
```

---

**Note**: This release maintains full backward compatibility with v2.0.0 configurations and workflows while significantly enhancing the user experience.
