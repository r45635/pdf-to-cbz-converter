# Publishing GitHub Release - PowerShell Guide

This guide provides step-by-step PowerShell commands for publishing a new release of the PDF to CBZ Converter on GitHub.

## Prerequisites

1. **GitHub CLI installed**: Download from https://cli.github.com/
2. **Git configured**: Ensure you're authenticated with GitHub
3. **PowerShell 5.1+**: Available on Windows by default

## Step 1: Verify Current State

```powershell
# Check current directory
Get-Location

# Verify you're in the correct repository
git remote -v

# Check current tag
git tag --list | Select-Object -Last 5

# Verify latest commit
git log --oneline -5
```

## Step 2: Build Windows Executable

```powershell
# Run the build script
.\build_v2.ps1

# Verify the executable was created
Test-Path "dist\pdf_to_cbz.exe"
Get-ChildItem "dist\" -Name
```

## Step 3: Create Release Packages

```powershell
# Create release directory
$releaseDir = "release_packages"
New-Item -ItemType Directory -Path $releaseDir -Force

# Package Windows executable
$windowsZip = "$releaseDir\pdf-to-cbz-converter-v2.0.0-windows.zip"
Compress-Archive -Path "dist\pdf_to_cbz.exe" -DestinationPath $windowsZip -Force

# Create source package (excluding build artifacts)
$sourceZip = "$releaseDir\pdf-to-cbz-converter-v2.0.0-source.zip"
$excludePatterns = @("build\*", "dist\*", "__pycache__\*", "*.pyc", ".git\*", "release_packages\*")

# Get all files excluding patterns
$allFiles = Get-ChildItem -Recurse -File | Where-Object {
    $file = $_
    $exclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($file.FullName -like "*\$pattern") {
            $exclude = $true
            break
        }
    }
    -not $exclude
}

# Create source archive
$allFiles | Compress-Archive -DestinationPath $sourceZip -Force

# Verify packages were created
Get-ChildItem $releaseDir
```

## Step 4: Authenticate with GitHub CLI

```powershell
# Check if already authenticated
gh auth status

# If not authenticated, login
gh auth login --web
```

## Step 5: Create GitHub Release

```powershell
# Set version variable
$version = "v2.0.0"

# Create release with attachments
gh release create $version `
    --title "PDF to CBZ Converter $version" `
    --notes-file "RELEASE_NOTES.md" `
    --draft `
    "$releaseDir\pdf-to-cbz-converter-v2.0.0-windows.zip#Windows Executable (pdf_to_cbz.exe)" `
    "$releaseDir\pdf-to-cbz-converter-v2.0.0-source.zip#Source Code Package"

Write-Host "✅ Draft release created successfully!" -ForegroundColor Green
Write-Host "📝 Review the draft release on GitHub before publishing" -ForegroundColor Yellow
```

## Step 6: Review and Publish Release

```powershell
# Open the release page in browser for review
gh release view $version --web

# Once reviewed, publish the release
Read-Host "Press Enter after reviewing the draft release to publish it"
gh release edit $version --draft=false

Write-Host "🚀 Release $version published successfully!" -ForegroundColor Green
```

## Alternative: One-Command Release Creation

If you prefer a single command approach:

```powershell
# All-in-one release command
$version = "v2.0.0"
$releaseDir = "release_packages"

# Ensure packages exist
if (-not (Test-Path "$releaseDir\pdf-to-cbz-converter-v2.0.0-windows.zip")) {
    Write-Error "Windows package not found. Run build and packaging steps first."
    exit 1
}

if (-not (Test-Path "$releaseDir\pdf-to-cbz-converter-v2.0.0-source.zip")) {
    Write-Error "Source package not found. Run packaging steps first."
    exit 1
}

# Create and publish release
gh release create $version `
    --title "PDF to CBZ Converter $version - Enhanced Features" `
    --notes "## PDF to CBZ Converter v2.0.0

### 🎉 Major New Features
- **Configuration Management**: Save and load conversion settings
- **Comprehensive Help System**: Built-in hints and troubleshooting
- **Enhanced GUI**: Quality slider, format help, and analysis tools
- **Smart DPI Detection**: Automatic optimal DPI calculation
- **Size Estimation**: Preview output file sizes before conversion

### 📦 What's Included
- **Windows Executable**: Ready-to-run .exe file (no Python required)
- **Source Code**: Full source code for all platforms
- **Documentation**: Complete setup and usage guides

### 🔧 Technical Improvements
- Better error handling and logging
- Improved multiprocessing performance
- Enhanced PDF analysis capabilities
- Cross-platform compatibility

See CHANGELOG.md for detailed changes and QUICK_START.md for usage instructions." `
    "$releaseDir\pdf-to-cbz-converter-v2.0.0-windows.zip#Windows Executable" `
    "$releaseDir\pdf-to-cbz-converter-v2.0.0-source.zip#Source Code Package"
```

## Verification Commands

```powershell
# Verify release was created
gh release list

# View release details
gh release view $version

# Check release assets
gh release view $version --json assets --jq '.assets[].name'

# Download and test (optional)
$testDir = "test_download"
New-Item -ItemType Directory -Path $testDir -Force
gh release download $version --dir $testDir
Get-ChildItem $testDir
```

## Troubleshooting

### Common Issues and Solutions

```powershell
# Issue: GitHub CLI not found
# Solution: Install GitHub CLI
winget install GitHub.cli

# Issue: Authentication problems
# Solution: Re-authenticate
gh auth logout
gh auth login --web

# Issue: Release already exists
# Solution: Delete and recreate
gh release delete $version --yes
# Then recreate with the commands above

# Issue: File not found errors
# Solution: Check paths
Get-ChildItem $releaseDir -Recurse
Test-Path "dist\pdf_to_cbz.exe"

# Issue: PowerShell execution policy
# Solution: Allow script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Clean Up

```powershell
# Remove release packages after successful upload (optional)
Remove-Item -Path $releaseDir -Recurse -Force

# Clean build artifacts
Remove-Item -Path "build" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
```

## Notes

- The `--draft` flag creates a draft release that you can review before publishing
- Remove `--draft` or use `gh release edit $version --draft=false` to publish immediately
- Asset names after `#` symbol provide friendly display names on GitHub
- Use backticks (`) for line continuation in PowerShell
- The release notes can be customized by editing RELEASE_NOTES.md first

## Next Steps

After publishing:
1. Test the release by downloading and running the Windows executable
2. Update any documentation that references the version number
3. Consider creating a discussion post to announce the release
4. Monitor for any user feedback or issues
