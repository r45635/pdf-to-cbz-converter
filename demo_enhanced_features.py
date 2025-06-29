#!/usr/bin/env python3
"""
demo_enhanced_features.py

Demonstration script for the enhanced PDF to CBZ converter features.
"""
import os
import sys
from pathlib import Path
from config_manager import ConfigManager
from hints import print_usage_hints, print_format_recommendations

def demo_config_management():
    """Demonstrate configuration management features."""
    print("=" * 60)
    print("🔧 Configuration Management Demo")
    print("=" * 60)
    
    # Create a config manager
    config_path = Path("demo_config.json")
    config_manager = ConfigManager(config_path)
    
    print(f"📁 Config file location: {config_path}")
    print(f"🔄 Default DPI: {config_manager.get('dpi')}")
    print(f"🖼️  Default format: {config_manager.get('format')}")
    print(f"⚡ Default threads: {config_manager.get('threads')}")
    
    # Set some custom values
    config_manager.set('dpi', 200)
    config_manager.set('format', 'png')
    config_manager.set('quality', 95)
    config_manager.set('threads', 6)
    
    print("\n📝 Setting custom values...")
    print(f"   DPI: {config_manager.get('dpi')}")
    print(f"   Format: {config_manager.get('format')}")
    print(f"   Quality: {config_manager.get('quality')}")
    print(f"   Threads: {config_manager.get('threads')}")
    
    # Save configuration
    config_manager.save_config()
    print(f"\n💾 Configuration saved to {config_path}")
    
    # Load configuration
    new_config = ConfigManager(config_path)
    print(f"\n📂 Loaded configuration:")
    print(f"   DPI: {new_config.get('dpi')}")
    print(f"   Format: {new_config.get('format')}")
    print(f"   Quality: {new_config.get('quality')}")
    print(f"   Threads: {new_config.get('threads')}")
    
    # Create sample config
    print(f"\n📋 Creating sample configuration...")
    config_manager.create_sample_config()
    
    # Cleanup
    if config_path.exists():
        config_path.unlink()
    if config_path.with_suffix('.sample.json').exists():
        config_path.with_suffix('.sample.json').unlink()

def demo_hints_system():
    """Demonstrate the hints and help system."""
    print("\n" + "=" * 60)
    print("💡 Hints and Help System Demo")
    print("=" * 60)
    
    print("\n🎯 Usage Hints:")
    print_usage_hints()
    
    print("\n📷 Format Recommendations:")
    print_format_recommendations()

def demo_smart_defaults():
    """Demonstrate smart defaults and validation."""
    print("\n" + "=" * 60)
    print("🤖 Smart Defaults Demo")
    print("=" * 60)
    
    config_manager = ConfigManager()
    
    # Simulate command line arguments
    class MockArgs:
        def __init__(self):
            self.dpi = None
            self.format = None
            self.quality = None
            self.threads = None
            self.poppler_path = None
    
    args = MockArgs()
    effective_config = config_manager.get_effective_config(args)
    
    print("🔧 Effective configuration (defaults + file + args):")
    for key, value in effective_config.items():
        if value is not None:
            print(f"   {key}: {value}")
        else:
            print(f"   {key}: auto-calculated")

def main():
    """Run all demonstrations."""
    print("🚀 Enhanced PDF to CBZ Converter - Feature Demo")
    print("="*60)
    
    try:
        demo_config_management()
        demo_hints_system()
        demo_smart_defaults()
        
        print("\n" + "=" * 60)
        print("✅ All demonstrations completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error during demonstration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
