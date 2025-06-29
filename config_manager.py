#!/usr/bin/env python3
"""
config_manager.py

Configuration management for PDF to CBZ converter.
Provides settings persistence and default value management.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional


class ConfigManager:
    """Manages configuration files for PDF to CBZ conversion settings."""
    
    DEFAULT_CONFIG = {
        "dpi": None,
        "format": "jpeg",
        "quality": 85,
        "threads": None,  # Will use CPU count if None
        "poppler_path": None,
        "output_directory": None,
        "auto_output_naming": True,
        "compression_level": 6,
        "preserve_metadata": True,
        "fallback_to_pdf2image": True,
        "temp_directory": None,
        "logging": {
            "level": "INFO",
            "file": None,
            "console": True
        }
    }
    
    def __init__(self, config_path: Optional[Path] = None):
        """Initialize config manager with optional config file path."""
        self.config_path = config_path or Path.home() / ".pdf2cbz_config.json"
        self.config = self.DEFAULT_CONFIG.copy()
        self.load_config()
    
    def load_config(self) -> Dict[str, Any]:
        """Load configuration from file if it exists."""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    user_config = json.load(f)
                # Filter out comment fields
                user_config = {k: v for k, v in user_config.items() if not k.startswith('_')}
                self.config.update(user_config)
                logging.debug(f"Loaded configuration from {self.config_path}")
            except (json.JSONDecodeError, IOError) as e:
                logging.warning(f"Failed to load config from {self.config_path}: {e}")
        return self.config
    
    def save_config(self) -> None:
        """Save current configuration to file."""
        try:
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, default=str)
            logging.info(f"Configuration saved to {self.config_path}")
        except IOError as e:
            logging.error(f"Failed to save config to {self.config_path}: {e}")
    
    def get(self, key: str, default=None):
        """Get configuration value with dot notation support."""
        keys = key.split('.')
        value = self.config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set configuration value with dot notation support."""
        keys = key.split('.')
        config = self.config
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        config[keys[-1]] = value
    
    def create_sample_config(self) -> None:
        """Create a sample configuration file with comments."""
        sample_config = {
            "_comment": "PDF to CBZ Converter Configuration File",
            "_description": {
                "dpi": "Target DPI for output images (null for auto-calculation)",
                "format": "Output image format: 'jpeg' or 'png'",
                "quality": "JPEG compression quality (1-100, only applies to JPEG)",
                "threads": "Number of worker threads (null for CPU count)",
                "poppler_path": "Path to Poppler bin directory (null for system PATH)",
                "output_directory": "Default output directory (null for same as input)",
                "auto_output_naming": "Automatically name output files based on input",
                "compression_level": "ZIP compression level (0-9)",
                "preserve_metadata": "Preserve PDF metadata in CBZ comments",
                "fallback_to_pdf2image": "Use pdf2image if pdftocairo fails",
                "temp_directory": "Custom temporary directory (null for system temp)",
                "logging": {
                    "level": "Logging level: DEBUG, INFO, WARNING, ERROR",
                    "file": "Log file path (null for no file logging)",
                    "console": "Enable console logging"
                }
            },
            **self.DEFAULT_CONFIG
        }
        
        sample_path = self.config_path.with_suffix('.sample.json')
        try:
            with open(sample_path, 'w', encoding='utf-8') as f:
                json.dump(sample_config, f, indent=2, default=str)
            print(f"Sample configuration created at: {sample_path}")
            print(f"Copy to {self.config_path} and modify as needed.")
        except IOError as e:
            logging.error(f"Failed to create sample config: {e}")
    
    def get_effective_config(self, args) -> Dict[str, Any]:
        """Get effective configuration merging file config with command line args."""
        effective = {}
        
        # Start with defaults, override with file config, then with command line args
        effective['dpi'] = getattr(args, 'dpi', None) or self.get('dpi')
        effective['format'] = getattr(args, 'format', None) or self.get('format', 'jpeg')
        effective['quality'] = getattr(args, 'quality', None) or self.get('quality', 85)
        effective['threads'] = getattr(args, 'threads', None) or self.get('threads')
        effective['poppler_path'] = getattr(args, 'poppler_path', None) or self.get('poppler_path')
        effective['output_directory'] = self.get('output_directory')
        
        return effective
