@echo off
echo =====================================================
echo   PDF to CBZ Converter v2.0.0 - Build Script
echo =====================================================
echo.

echo [1/5] Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    pause
    exit /b 1
)

echo [2/5] Installing/updating PyInstaller...
pip install pyinstaller
if errorlevel 1 (
    echo ERROR: Failed to install PyInstaller
    pause
    exit /b 1
)

echo [3/5] Cleaning previous builds...
if exist "dist" rmdir /s /q dist
if exist "build" rmdir /s /q build

echo [4/5] Building executable with PyInstaller...
pyinstaller pdf_to_cbz_v2.spec
if errorlevel 1 (
    echo ERROR: PyInstaller build failed
    pause
    exit /b 1
)

echo [5/5] Creating release package...
cd dist
if exist "pdf_to_cbz_v2.0.0.zip" del "pdf_to_cbz_v2.0.0.zip"

echo Creating ZIP package...
powershell -command "Compress-Archive -Path 'pdf_to_cbz_v2.0.0\*' -DestinationPath 'pdf_to_cbz_v2.0.0.zip'"
if errorlevel 1 (
    echo ERROR: Failed to create ZIP package
    pause
    exit /b 1
)

echo.
echo =====================================================
echo   Build completed successfully!
echo =====================================================
echo.
echo Executable files created:
echo   - dist\pdf_to_cbz_v2.0.0\pdf_to_cbz_cli.exe
echo   - dist\pdf_to_cbz_v2.0.0\pdf_to_cbz_gui.exe
echo.
echo Release package created:
echo   - dist\pdf_to_cbz_v2.0.0.zip
echo.
echo You can now distribute the contents of the dist folder
echo or the ZIP file to users without Python installed.
echo.
pause
cd ..
