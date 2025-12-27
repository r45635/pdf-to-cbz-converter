# 🚀 How to Trigger GitHub Actions Build

## Method 1: Create and Push a Git Tag (Recommended)

This is the standard way to trigger a release build:

```bash
# Make sure all changes are committed
git add .
git commit -m "Release v2.1.0: Enhanced preview system and GUI improvements"

# Create a tag for v2.1.0
git tag -a v2.1.0 -m "Release v2.1.0: Enhanced preview system with zoom controls, settings transfer, and improved UX"

# Push the tag to GitHub (this will trigger the workflow)
git push origin v2.1.0

# Also push your main branch
git push origin main
```

## Method 2: Manual Trigger from GitHub UI

1. Go to your repository on GitHub
2. Click on the **"Actions"** tab
3. Click on **"Build and Release"** workflow
4. Click **"Run workflow"** button (top right)
5. Enter version: `v2.1.0`
6. Check "Create GitHub release" if you want a release created
7. Click **"Run workflow"**

## Method 3: Using GitHub CLI (if installed)

```bash
# Trigger the workflow manually
gh workflow run release.yml -f version=v2.1.0 -f create_release=true
```

## 📋 What the Workflow Does

The updated workflow will:

1. ✅ **Build Windows Executables**:
   - `pdf_to_cbz_cli.exe` (command-line version)
   - `pdf_to_cbz_gui.exe` (GUI version)
   - Both with version information embedded

2. ✅ **Create Source Packages**:
   - ZIP format for Windows
   - TAR.GZ format for Linux/macOS

3. ✅ **Package Everything**:
   - Executables
   - Documentation (README, CHANGELOG, etc.)
   - License
   - Sample files

4. ✅ **Create GitHub Release**:
   - Automatic release notes from `RELEASE_v2.1.0.md`
   - Upload all packages as release assets
   - Tag the release properly

## 🔧 Troubleshooting

### If the workflow doesn't trigger:

1. **Check the tag format**: Must be `v*` (e.g., `v2.1.0`, not `2.1.0`)
2. **Verify repository permissions**: Make sure Actions are enabled
3. **Check workflow file**: Ensure `.github/workflows/release.yml` exists
4. **Look at Actions tab**: Check for any error messages

### If build fails:

1. **Check dependencies**: Ensure `requirements.txt` is up to date
2. **Verify Python version**: Workflow uses Python 3.11
3. **Check paths**: Ensure all referenced files exist
4. **Review logs**: Check the Actions tab for detailed error messages

## 📅 Next Steps

After pushing the tag, you should see:

1. **Actions tab** showing the workflow running
2. **Build progress** for Windows and source packages
3. **New release** created with downloadable assets
4. **Release notes** automatically generated

The whole process typically takes 5-10 minutes to complete.

---

**Note**: The workflow has been updated to support both automatic (tag-based) and manual triggers, making it more flexible for development and release management.
