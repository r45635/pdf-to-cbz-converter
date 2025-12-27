# 🔧 GitHub Actions Release Fix

## 🚨 Issue Identified
The GitHub Actions workflow was failing with a **403 Forbidden** error when trying to create releases. This is a common permissions issue.

## ✅ Solutions Applied

### 1. **Added Required Permissions**
Added explicit permissions to the workflow:
```yaml
permissions:
  contents: write
  pull-requests: read
```

### 2. **Updated Release Action**
- Upgraded from `softprops/action-gh-release@v1` to `@v2`
- Added `make_latest: true` to properly mark the release
- Added cleanup step to handle existing releases

### 3. **Created Alternative Simple Workflow**
Created `simple-release.yml` that uses GitHub CLI directly, which is often more reliable for release creation.

## 🛠️ How to Trigger the Fixed Workflow

### Option 1: Use the Simple Workflow (Recommended)
1. Go to GitHub → Actions tab
2. Click "Simple Build and Release"
3. Click "Run workflow"
4. Enter version: `v2.1.0`
5. Click "Run workflow"

### Option 2: Re-trigger the Original Workflow
Since we added permissions, you can try pushing the tag again:

```bash
# Delete the existing tag locally and remotely
git tag -d v2.1.0
git push --delete origin v2.1.0

# Re-create and push the tag
git tag -a v2.1.0 -m "Release v2.1.0: Enhanced preview system"
git push origin v2.1.0
```

## 🔍 Common GitHub Actions Release Issues

### 403 Forbidden Error
- **Cause**: Insufficient permissions for GITHUB_TOKEN
- **Solution**: Add `permissions: contents: write` to workflow

### Release Already Exists
- **Cause**: Trying to create a release for an existing tag
- **Solution**: Delete existing release first or use a different tag

### Token Scope Issues
- **Cause**: Repository settings restricting token permissions
- **Solution**: Check Settings → Actions → General → Workflow permissions

## 🎯 Expected Results

After the fix, the workflow should:
1. ✅ Build Windows executables successfully
2. ✅ Create release packages
3. ✅ Create GitHub release with proper notes
4. ✅ Upload assets to the release

## 📋 Verification Steps

1. **Check Actions Tab**: Look for green checkmark on workflow run
2. **Check Releases Page**: Verify v2.1.0 release appears
3. **Download Test**: Try downloading the Windows package
4. **File Check**: Ensure both CLI and GUI executables are included

---

**Note**: The simple workflow is designed to be more reliable and easier to debug if issues persist.
