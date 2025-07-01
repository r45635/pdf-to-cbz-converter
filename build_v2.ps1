# PDF to CBZ Converter v2.1.0 - Build Script (PowerShell)

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "   PDF to CBZ Converter v2.1.0 - Build Script" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "[1/5] Activating virtual environment..." -ForegroundColor Yellow
    & ".\.venv\Scripts\Activate.ps1"
    
    Write-Host "[2/5] Installing/updating PyInstaller..." -ForegroundColor Yellow
    pip install pyinstaller
    if ($LASTEXITCODE -ne 0) { throw "Failed to install PyInstaller" }
    
    Write-Host "[3/5] Cleaning previous builds..." -ForegroundColor Yellow
    if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
    if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
    
    Write-Host "[4/5] Building executable with PyInstaller..." -ForegroundColor Yellow
    pyinstaller pdf_to_cbz_v2.spec
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }
    
    Write-Host "[5/5] Creating release package..." -ForegroundColor Yellow
    Set-Location "dist"
    
    if (Test-Path "pdf_to_cbz_v2.0.0.zip") { Remove-Item "pdf_to_cbz_v2.0.0.zip" }
    
    Write-Host "Creating ZIP package..." -ForegroundColor Yellow
    Compress-Archive -Path "pdf_to_cbz_v2.0.0\*" -DestinationPath "pdf_to_cbz_v2.0.0.zip"
    
    Set-Location ".."
    
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host "   Build completed successfully!" -ForegroundColor Green
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Executable files created:" -ForegroundColor White
    Write-Host "  - dist\pdf_to_cbz_v2.0.0\pdf_to_cbz_cli.exe" -ForegroundColor Cyan
    Write-Host "  - dist\pdf_to_cbz_v2.0.0\pdf_to_cbz_gui.exe" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Release package created:" -ForegroundColor White
    Write-Host "  - dist\pdf_to_cbz_v2.0.0.zip" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You can now distribute the contents of the dist folder" -ForegroundColor Green
    Write-Host "or the ZIP file to users without Python installed." -ForegroundColor Green
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
