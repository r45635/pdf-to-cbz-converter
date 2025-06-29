#!/usr/bin/env python3
"""
hints.py

Helpful hints and tips for using the PDF to CBZ converter.
"""


def print_usage_hints():
    """Print helpful hints and tips for using the converter."""
    hints = [
        "💡 PDF to CBZ Converter - Helpful Hints:",
        "",
        "🎯 DPI Recommendations:",
        "   • Use --analyse to see suggested DPI for your PDF",
        "   • For comics/manga: 150-200 DPI usually sufficient",
        "   • For text documents: 200-300 DPI for better readability",
        "   • High DPI = larger file size but better quality",
        "",
        "📁 Output Tips:",
        "   • CBZ files are just ZIP archives with images",
        "   • Use JPEG for smaller files, PNG for better quality",
        "   • Quality 85 is a good balance for JPEG",
        "",
        "⚡ Performance:",
        "   • More threads = faster conversion (up to CPU limit)",
        "   • Large PDFs may need more memory",
        "   • SSD storage helps with temp file operations",
        "",
        "🔧 Poppler Setup:",
        "   • Download from: https://github.com/oschwartz10612/poppler-windows/releases",
        "   • Extract and add bin/ folder to PATH",
        "   • Or use --poppler-path to specify location",
        "",
        "📋 Configuration:",
        "   • Use --create-config to create a sample config file",
        "   • Config file location: ~/.pdf2cbz_config.json",
        "   • Command line options override config file settings",
        "",
        "🔍 Troubleshooting:",
        "   • Use --logfile to capture detailed logs",
        "   • If pdftocairo fails, converter automatically falls back to pdf2image",
        "   • Check that input PDF is not password protected",
        "",
        "📖 Examples:",
        "   python pdf_to_cbz.py document.pdf                    # Basic conversion",
        "   python pdf_to_cbz.py document.pdf -d 200 -f png      # High quality PNG",
        "   python pdf_to_cbz.py document.pdf --analyse          # Analyze before converting",
        "   python pdf_to_cbz.py document.pdf -t 8 -q 90         # Fast, high quality",
        "   python pdf_to_cbz.py --create-config                 # Create sample config",
        "   python pdf_to_cbz.py document.pdf --save-config      # Save current settings"
    ]
    
    print("\n".join(hints))


def print_dpi_recommendations(pdf_path, analysis_data=None):
    """Print DPI recommendations based on PDF analysis."""
    print("\n🎯 DPI Recommendations for your PDF:")
    
    if analysis_data:
        print(f"   • Recommended DPI: {analysis_data.get('recommended_dpi', 'Unknown')}")
        print(f"   • Page count: {analysis_data.get('page_count', 'Unknown')}")
        
        if 'min_dpi' in analysis_data and 'max_dpi' in analysis_data:
            print(f"   • DPI range: {analysis_data['min_dpi']} - {analysis_data['max_dpi']}")
        
        print("\n💡 Quality vs Size Trade-offs:")
        if analysis_data.get('recommended_dpi', 0) > 250:
            print("   • Your PDF has small pages - consider 200-250 DPI for good quality")
        elif analysis_data.get('recommended_dpi', 0) < 150:
            print("   • Your PDF has large pages - 150 DPI might be sufficient")
        else:
            print("   • Your PDF has medium pages - the recommended DPI should work well")


def print_format_recommendations():
    """Print format and quality recommendations."""
    recommendations = [
        "\n📷 Format & Quality Recommendations:",
        "",
        "🖼️ JPEG Format:",
        "   • Best for: Photos, scanned documents, comics with complex images",
        "   • Quality 70-80: Small files, acceptable quality",
        "   • Quality 85-90: Good balance of quality and size",
        "   • Quality 95+: High quality, larger files",
        "",
        "🎨 PNG Format:",
        "   • Best for: Line art, simple graphics, when file size isn't critical",
        "   • Always lossless compression",
        "   • Larger files but perfect quality",
        "   • Good for black & white documents",
        "",
        "⚖️ When to choose what:",
        "   • Scanned books/comics: JPEG quality 85",
        "   • Digital comics with gradients: JPEG quality 90+",
        "   • Line art/manga: PNG or JPEG quality 95+",
        "   • Text documents: PNG for best readability"
    ]
    
    print("\n".join(recommendations))


def print_performance_tips():
    """Print performance optimization tips."""
    tips = [
        "\n⚡ Performance Optimization Tips:",
        "",
        "🧵 Threading:",
        "   • Use number of CPU cores or less",
        "   • More threads help with I/O-bound operations",
        "   • Don't exceed CPU count + 2",
        "",
        "💾 Memory Management:",
        "   • Large PDFs may use significant RAM",
        "   • Consider lower DPI for very large documents",
        "   • Close other applications if memory constrained",
        "",
        "💿 Storage:",
        "   • Use SSD for better temp file performance",
        "   • Ensure enough space for temp files (3x output size)",
        "   • Consider ramdisk for temp directory on systems with lots of RAM"
    ]
    
    print("\n".join(tips))


def print_troubleshooting_guide():
    """Print common troubleshooting solutions."""
    guide = [
        "\n🔧 Troubleshooting Guide:",
        "",
        "❌ 'pdftocairo not found':",
        "   • Install Poppler utilities",
        "   • Add Poppler bin/ to system PATH",
        "   • Use --poppler-path to specify location",
        "",
        "❌ 'Memory Error' or slow performance:",
        "   • Reduce DPI setting",
        "   • Use fewer threads",
        "   • Close other applications",
        "   • Process in smaller batches",
        "",
        "❌ Poor image quality:",
        "   • Increase DPI setting",
        "   • Use PNG format for line art",
        "   • Increase JPEG quality",
        "   • Check source PDF quality",
        "",
        "❌ Large output files:",
        "   • Reduce DPI setting",
        "   • Use JPEG format",
        "   • Lower JPEG quality",
        "   • Check if pages are unnecessarily large in source",
        "",
        "❌ Missing pages or conversion errors:",
        "   • Check PDF isn't password protected",
        "   • Try with --logfile to see detailed errors",
        "   • Some PDFs may have unusual encoding"
    ]
    
    print("\n".join(guide))


if __name__ == "__main__":
    print_usage_hints()
    print_format_recommendations()
    print_performance_tips()
    print_troubleshooting_guide()
