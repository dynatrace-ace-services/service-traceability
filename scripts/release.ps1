param(
    [string]$Message,
    [switch]$DryRun
)

if (-not $Message) {
    Write-Host ""
    Write-Host "Usage examples:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host '.\scripts\release.ps1 -Message "Fix logo URL in AppEngine" -DryRun'
    Write-Host '.\scripts\release.ps1 -Message "Fix logo URL in AppEngine"'
    Write-Host ""
    exit
}

# Read current version from package.json and increment patch
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$parts = $pkg.version -split '\.'
$newVersion = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"

Write-Host ""
Write-Host "=== Version Bump ===" -ForegroundColor Cyan
Write-Host "Current : $($pkg.version)"
Write-Host "New     : $newVersion"

Write-Host ""
Write-Host "=== Git Status ===" -ForegroundColor Cyan
git status --short

Write-Host ""
Write-Host "=== Release ===" -ForegroundColor Cyan
Write-Host "Tag     : v$newVersion"
Write-Host "Message : $Message"

if ($DryRun) {
    Write-Host ""
    Write-Host "=== DRY RUN ===" -ForegroundColor Yellow
    Write-Host "No changes will be made."
    Write-Host ""
    Write-Host "Commands that would be executed:"
    Write-Host "  Update package.json and app.config.json to v$newVersion"
    Write-Host "  git add package.json app.config.json"
    Write-Host "  git add ."
    Write-Host "  git commit -m `"chore: release v$newVersion — $Message`""
    Write-Host "  git tag -a v$newVersion -m `"$Message`""
    Write-Host "  git push origin main"
    Write-Host "  git push origin v$newVersion"
    exit
}

Write-Host ""
$Confirm = Read-Host "Create release v$newVersion and push? (y/N)"

if ($Confirm -ne "y") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit
}

# Bump version in package.json
$pkg.version = $newVersion
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding utf8

# Bump version in app.config.json
$cfg = Get-Content "app.config.json" -Raw | ConvertFrom-Json
$cfg.app.version = $newVersion
$cfg | ConvertTo-Json -Depth 10 | Set-Content "app.config.json" -Encoding utf8

git add package.json app.config.json
git add .
git commit -m "chore: release v$newVersion — $Message"
git tag -a "v$newVersion" -m $Message
git push origin main
git push origin "v$newVersion"

Write-Host ""
Write-Host "=== Released v$newVersion ===" -ForegroundColor Green
git show "v$newVersion" --no-patch
