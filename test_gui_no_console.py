#!/usr/bin/env python3
"""
Test script to verify that the GUI subprocess calls don't show console windows.
This script simulates the subprocess calls made by the GUI to ensure they don't flash.
"""

import subprocess
import sys
import os
from pathlib import Path

def test_subprocess_with_hidden_console():
    """Test subprocess call with hidden console window (like in the fixed GUI)."""
    print("Testing subprocess call with hidden console...")
    
    # Test command that would normally show a console briefly
    cmd = ["echo", "test"]
    if os.name == 'nt':
        cmd = ["cmd", "/c", "echo", "test"]
    
    try:
        # On Windows, prevent subprocess from showing console windows
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = subprocess.SW_HIDE
        
        proc = subprocess.run(
            cmd, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE, text=True, check=False,
            startupinfo=startupinfo
        )
        
        print(f"✅ Subprocess completed successfully with return code: {proc.returncode}")
        print("✅ No console window should have appeared!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

def test_subprocess_without_hidden_console():
    """Test subprocess call without hidden console (for comparison)."""
    print("\nTesting subprocess call WITHOUT hidden console (for comparison)...")
    
    # Test command that would normally show a console briefly
    cmd = ["echo", "test"]
    if os.name == 'nt':
        cmd = ["cmd", "/c", "echo", "test"]
    
    try:
        proc = subprocess.run(
            cmd, stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE, text=True, check=False
        )
        
        print(f"✅ Subprocess completed successfully with return code: {proc.returncode}")
        print("⚠️  A console window may have briefly appeared!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("PDF to CBZ - Console Window Fix Test")
    print("=" * 40)
    
    test_subprocess_with_hidden_console()
    test_subprocess_without_hidden_console()
    
    print("\n" + "=" * 40)
    print("✅ Test completed!")
    print("If you saw console windows flash during the second test but not the first,")
    print("the fix is working correctly!")
