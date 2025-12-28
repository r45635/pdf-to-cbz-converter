# Changelog

## [v2.1.1] - 2025-01-05

### 🐛 Bug Fixes

#### Windows GUI Executable
- **FIXED**: Eliminated flashing terminal/console windows when using the Windows GUI executable
- **TECHNICAL**: Added proper subprocess STARTUPINFO configuration with SW_HIDE flag for Windows
- **IMPACT**: GUI now runs completely silently without any console window interference
- **SCOPE**: Fix applied to both GUI and CLI code for consistency

## [v2.1.0] - 2025-01-05

### 🚀 Major GUI Enhancements

#### Enhanced Preview System
- **NEW**: Always-visible zoom controls with fixed-size zoom areas above images
- **NEW**: Selectable zoom levels: "Normal", "Puissant", "Ultra" with keyboard shortcuts (1/2/3)  
- **NEW**: Help button for zoom modes with detailed explanation dialog
- **NEW**: Auto-updating preview on page/DPI/quality changes and window resize
- **NEW**: Improved layout with compact controls and protected info bar

#### Smart Settings Transfer
- **NEW**: Protocol handler for preview window close with settings transfer prompt
- **NEW**: "Apply Settings to Main" button in preview window for instant transfer
- **NEW**: Automatic transfer of DPI, quality, format, and other preview settings to main GUI

#### Enhanced User Experience  
- **NEW**: Always-visible info bar with file size, per-page size, projected CBZ size, and original PDF size
- **NEW**: Improved image scaling and padding to prevent UI overlap
- **NEW**: Better error handling and user feedback throughout the application
- **IMPROVED**: More responsive and intuitive workflow for preview-to-conversion process

## [v2.0.0] - 2025-06-29

### 🚀 Major New Features

#### Configuration Management System
- **NEW**: `config_manager.py` - Complete configuration management
- **NEW**: JSON-based persistent settings with smart defaults
- **NEW**: Sample configuration generation with detailed comments
- **NEW**: Dot notation support for nested settings
- **NEW**: Command line arguments override config file values

#### Comprehensive Hints and Help System  
- **NEW**: `hints.py` - Extensive user guidance system
- **NEW**: DPI recommendations based on document type
- **NEW**: Format selection guidance (JPEG vs PNG)
- **NEW**: Performance optimization tips
- **NEW**: Comprehensive troubleshooting guide
- **NEW**: Poppler setup instructions

#### Enhanced GUI Experience
- **NEW**: Smart tooltips and contextual help
- **NEW**: Visual JPEG quality slider
- **NEW**: Auto-threading with CPU detection
- **NEW**: Format help button with guidance
- **NEW**: Configuration save/load buttons
- **NEW**: Dedicated hints window

#### New Command Line Options
- **NEW**: `--hints` - Show comprehensive usage guide
- **NEW**: `--create-config` - Generate sample configuration
- **NEW**: `--save-config` - Persist current settings
- **NEW**: `--config FILE` - Use custom configuration file

### ✨ Enhancements

#### User Experience Improvements
- **IMPROVED**: Better error messages and validation
- **IMPROVED**: Smart default value calculation
- **IMPROVED**: Progress feedback and logging
- **IMPROVED**: Input validation with helpful hints
- **IMPROVED**: Graceful fallback mechanisms

#### GUI Enhancements
- **IMPROVED**: Visual layout with better organization
- **IMPROVED**: Real-time parameter validation
- **IMPROVED**: Enhanced progress indicators
- **IMPROVED**: Better button layout and styling
- **IMPROVED**: Comprehensive built-in help system

#### Code Quality
- **IMPROVED**: Modular architecture with separate modules
- **IMPROVED**: Type hints and documentation
- **IMPROVED**: Error handling and robustness
- **IMPROVED**: Maintainable configuration system

### 🐛 Bug Fixes
- **FIXED**: French error messages replaced with English
- **FIXED**: Improved error handling for edge cases
- **FIXED**: Better validation of input parameters
- **FIXED**: More robust file path handling

### 📋 Dependencies
- **UPDATED**: requirements.txt with all necessary packages
- **MAINTAINED**: Backward compatibility with existing workflows

### 📁 New Files
- `config_manager.py` - Configuration management system
- `hints.py` - Comprehensive help and guidance
- `demo_enhanced_features.py` - Feature demonstration
- `ENHANCED_FEATURES.md` - Detailed feature documentation
- `QUICK_START.md` - Getting started guide
- `CHANGELOG.md` - This changelog

### 🎯 Breaking Changes
- **NONE**: Full backward compatibility maintained
- All existing command line options work as before
- Existing GUI functionality preserved and enhanced

### 🚀 Migration Guide
No migration required! The enhanced version:
1. Works with existing command line workflows
2. Preserves all original functionality  
3. Adds new features without breaking changes
4. Provides optional configuration for power users

---

## [v1.0.0] - 2024-05-18

### Initial Release
- Basic PDF to CBZ conversion
- CLI and GUI interfaces
- DPI analysis functionality
- Multi-threading support
- Poppler integration with pdf2image fallback
