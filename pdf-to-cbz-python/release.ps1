# PDF to CBZ Converter - Release Management Script
# This script helps you create and publish releases automatically

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$Message = "Release version $Version",
    
    [Parameter(Mandatory=$false)]
    [switch]$Force
)

Write-Host "==================================================" -ForegroundColor Green
Write-Host "  PDF to CBZ Converter - Release Manager v1.0" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green

# Validate version format
if ($Version -notmatch '^v?\d+\.\d+\.\d+$') {
    Write-Host "❌ Error: Version must be in format 'v1.0.0' or '1.0.0'" -ForegroundColor Red
    exit 1
}

# Ensure version starts with 'v'
if (-not $Version.StartsWith('v')) {
    $Version = "v$Version"
}

Write-Host "🚀 Preparing release $Version..." -ForegroundColor Yellow

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Host "❌ Error: This is not a git repository" -ForegroundColor Red
    exit 1
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status -and -not $Force) {
    Write-Host "❌ Error: You have uncommitted changes:" -ForegroundColor Red
    git status --short
    Write-Host "Please commit your changes or use -Force to ignore" -ForegroundColor Yellow
    exit 1
}

# Check if tag already exists
$existingTag = git tag -l $Version
if ($existingTag -and -not $Force) {
    Write-Host "❌ Error: Tag $Version already exists" -ForegroundColor Red
    Write-Host "Use -Force to delete and recreate the tag" -ForegroundColor Yellow
    exit 1
}

# If force is used and tag exists, delete it
if ($existingTag -and $Force) {
    Write-Host "🗑️  Deleting existing tag $Version..." -ForegroundColor Yellow
    git tag -d $Version
    git push origin :refs/tags/$Version 2>$null
}

Write-Host "📝 Creating commit and tag..." -ForegroundColor Cyan

# Add all changes
git add .

# Check if there are any changes to commit
$staged = git diff --cached --name-only
if ($staged) {
    # Commit changes
    git commit -m $Message
    Write-Host "✅ Changes committed" -ForegroundColor Green
} else {
    Write-Host "ℹ️  No changes to commit" -ForegroundColor Blue
}

# Create the tag
git tag -a $Version -m "Release $Version"
Write-Host "✅ Tag $Version created" -ForegroundColor Green

# Push to remote
Write-Host "🌐 Pushing to GitHub..." -ForegroundColor Cyan
git push origin main
git push origin $Version

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🤖 GitHub Actions will now:" -ForegroundColor Yellow
    Write-Host "   1. Build Windows executables (CLI and GUI)" -ForegroundColor White
    Write-Host "   2. Create source packages (ZIP and tar.gz)" -ForegroundColor White
    Write-Host "   3. Create a GitHub release with all artifacts" -ForegroundColor White
    Write-Host ""
    Write-Host "📁 You can monitor the build progress at:" -ForegroundColor Cyan
    $repoUrl = git config --get remote.origin.url
    if ($repoUrl -match 'github\.com[/:](.+?)\.git$') {
        $repoPath = $matches[1]
        Write-Host "   https://github.com/$repoPath/actions" -ForegroundColor Blue
    }
    Write-Host ""
    Write-Host "🎉 Release $Version will be available shortly!" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to push to GitHub" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "           Release process initiated!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
