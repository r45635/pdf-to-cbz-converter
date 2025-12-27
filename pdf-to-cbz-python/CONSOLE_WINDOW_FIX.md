# Windows GUI Console Window Fix - v2.1.1

## Problem Description

When running the Windows GUI executable (`pdf_to_cbz_gui.exe`), users were experiencing:
- Brief terminal/console windows flashing open and immediately closing
- This happened during PDF processing when calling external tools (pdftocairo)
- The issue occurred even though the executable was built with `console=False` in PyInstaller

## Root Cause

The issue was caused by `subprocess.run()` calls in the application code that didn't properly suppress console windows on Windows. Even when a PyInstaller executable is built with `console=False`, subprocess calls can still briefly show console windows unless explicitly configured to hide them.

## Solution Applied

### Code Changes

**Files Modified:**
- `pdf_to_cbz_gui.py` - Main GUI application
- `pdf_to_cbz.py` - CLI application (for consistency)

**Specific Fix:**
```python
# Before (causing console window flashes):
proc = subprocess.run(
    cmd, stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE, text=True, check=False
)

# After (properly hidden on Windows):
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
```

### Technical Details

**STARTUPINFO Configuration:**
- `STARTF_USESHOWWINDOW`: Tells Windows to use the `wShowWindow` parameter
- `SW_HIDE`: Specifically hides the console window completely
- Applied only on Windows (`os.name == 'nt'`) for platform compatibility

**PyInstaller Configuration:**
The existing `.spec` file already had the correct settings:
```python
exe_gui = EXE(
    # ... other settings ...
    console=False,  # ✅ This was already correct
    # ... other settings ...
)
```

## Version Updates

- Version bumped from 2.1.0 to 2.1.1
- Updated in:
  - `version_info.txt` (Windows executable metadata)
  - `build_v2.ps1` (PowerShell build script)
  - `build_v2.bat` (Batch build script)
  - `CHANGELOG.md` (Release notes)

## Testing

**Test Script Created:**
- `test_gui_no_console.py` - Demonstrates the difference between hidden and visible subprocess calls

**Expected Behavior After Fix:**
- GUI executable runs completely silently
- No console/terminal windows appear during operation
- Subprocess calls to pdftocairo are completely hidden
- User experience is seamless and professional

## Files Changed

1. **pdf_to_cbz_gui.py** - Added subprocess console hiding for GUI
2. **pdf_to_cbz.py** - Added subprocess console hiding for CLI (consistency)
3. **version_info.txt** - Updated version to 2.1.1
4. **build_v2.ps1** - Updated version references
5. **build_v2.bat** - Updated version references  
6. **CHANGELOG.md** - Added v2.1.1 release notes
7. **test_gui_no_console.py** - Created test script for verification

## Verification Steps

1. Build the executable using `build_v2.ps1` or `build_v2.bat`
2. Run the GUI executable: `dist/pdf_to_cbz_v2.0.0/pdf_to_cbz_gui.exe`
3. Open a PDF and run conversion - no console windows should appear
4. (Optional) Run the test script to see the difference

## Impact

✅ **Immediate Benefits:**
- Professional user experience without console window flashes
- Cleaner operation in Windows desktop environment
- No interruption to user workflow

✅ **Technical Benefits:**
- Proper Windows subprocess handling
- Consistent behavior across Windows versions
- Future-proof solution for subprocess calls

This fix ensures the Windows GUI executable behaves like a proper desktop application without any command-line artifacts.
