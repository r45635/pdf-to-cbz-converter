# Automated Release System

This repository now includes an automated release system using GitHub Actions that builds and publishes releases automatically when you push a version tag.

## How It Works

The automation consists of two parts:

1. **GitHub Actions Workflow** (`.github/workflows/release.yml`)
   - Triggers when you push a version tag (e.g., `v2.1.0`)
   - Builds Windows executables (CLI and GUI)
   - Creates source packages (ZIP and tar.gz)
   - Automatically creates a GitHub release with all artifacts

2. **Release Management Script** (`release.ps1`)
   - PowerShell script to simplify the release process
   - Handles version tagging and pushing to GitHub
   - Validates your changes and version format

## Quick Release Process

### Option 1: Using the Release Script (Recommended)

```powershell
# Make your changes and test them
# Then run the release script:

.\release.ps1 -Version "2.1.0" -Message "Add new features and bug fixes"
```

The script will:
- ✅ Validate version format
- ✅ Check for uncommitted changes
- ✅ Commit and tag your changes
- ✅ Push to GitHub
- ✅ Trigger automatic builds

### Option 2: Manual Process

```powershell
# Commit your changes
git add .
git commit -m "Release version v2.1.0"

# Create and push tag
git tag -a v2.1.0 -m "Release v2.1.0"
git push origin main
git push origin v2.1.0
```

## What Gets Built Automatically

When you push a version tag, GitHub Actions will create:

### Windows Package (`pdf_to_cbz_v2.1.0_windows.zip`)
- `pdf_to_cbz_cli.exe` - Command-line version
- `pdf_to_cbz_gui.exe` - GUI version (no console window)
- All documentation files (README, ENHANCED_FEATURES, etc.)
- Ready to distribute to Windows users

### Source Packages
- `pdf_to_cbz_v2.1.0_source.zip` - For Windows developers
- `pdf_to_cbz_v2.1.0_source.tar.gz` - For Linux/Mac developers
- Includes all source code, build scripts, and documentation

## Monitoring Builds

After pushing a tag, you can monitor the build progress at:
- GitHub → Your Repository → Actions tab
- Look for the "Build and Release" workflow

The build typically takes 5-10 minutes and will:
1. ✅ Build Windows executables
2. ✅ Create source packages  
3. ✅ Publish GitHub release
4. ✅ Upload all artifacts

## Release Script Options

```powershell
# Basic release
.\release.ps1 -Version "2.1.0"

# With custom commit message
.\release.ps1 -Version "2.1.0" -Message "Major update with new GUI features"

# Force release (overwrites existing tag)
.\release.ps1 -Version "2.1.0" -Force

# Version formats supported
.\release.ps1 -Version "2.1.0"     # Will become v2.1.0
.\release.ps1 -Version "v2.1.0"    # Already has v prefix
```

## Troubleshooting

### Build Fails
- Check GitHub Actions logs for detailed error messages
- Ensure all dependencies are listed in `requirements.txt`
- Verify PyInstaller spec files are valid

### Release Already Exists
- Use `-Force` flag to overwrite existing tag
- Or increment version number

### Permission Issues
- Ensure you have write access to the repository
- Check that GitHub Actions is enabled for your repository

## Benefits of Automated Releases

✅ **Consistent Builds**: Same environment every time  
✅ **Multiple Platforms**: Windows binaries + source packages  
✅ **Zero Manual Work**: Push tag → Get release  
✅ **Professional Distribution**: Proper GitHub releases  
✅ **Version Control**: Every release is tagged and traceable  

## Next Steps

1. **Test the System**: Try creating a test release with `v2.0.1`
2. **Customize**: Modify the workflow if you need different build options
3. **Share**: Users can now download ready-to-use executables from GitHub releases

The old manual PowerShell publishing process is no longer needed - everything is now automated! 🎉
