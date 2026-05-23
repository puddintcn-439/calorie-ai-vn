<#
remove-secret-history.ps1

Usage: run from repository root in PowerShell

This script will:
- create a mirror backup of the repository (one level up)
- rewrite history of a single branch to remove a file
- expire reflog and run git gc
- force-push the cleaned branch to origin

WARNING: This rewrites git history and performs a force-push. Notify collaborators.
Make sure you REVOKE/ROTATE the exposed Supabase token BEFORE running this script.

When ready, run: .\scripts\cleanup\remove-secret-history.ps1
Type YES when prompted to proceed.
#>

param(
    [string]$Branch = 'fix/ci-lockfile',
    [string]$FileToDelete = '.tmp/supabase_access_token.txt',
    [string]$BackupDir = '..\calorie-ai-vn-backup.git'
)

$ErrorActionPreference = 'Stop'
$originalLocation = Get-Location

function Assert-GitSuccess {
    param([string]$StepName)
    if ($LASTEXITCODE -ne 0) {
        throw "$StepName failed with exit code $LASTEXITCODE"
    }
}

$repoRootOutput = git rev-parse --show-toplevel
Assert-GitSuccess 'git rev-parse --show-toplevel'
$repoRoot = ($repoRootOutput | Select-Object -First 1).Trim()
$backupDirAbs = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $BackupDir))

Write-Host "WARNING: This will rewrite history and FORCE-PUSH branch '$Branch' to origin." -ForegroundColor Yellow
Write-Host "Ensure you have revoked/rotated the exposed token in Supabase BEFORE proceeding." -ForegroundColor Yellow
Write-Host "If you understand the consequences, type YES and press Enter. Otherwise Ctrl+C to abort." -ForegroundColor Yellow
$confirm = Read-Host 'Type YES to proceed'
if ($confirm -ne 'YES') { Write-Host 'Aborted by user.' -ForegroundColor Cyan; exit 1 }

Write-Host "Starting cleanup: removing '$FileToDelete' from branch '$Branch'..." -ForegroundColor Green

# normalize branch name (strip leading refs/heads/ or leading slash if present)
$branchName = $Branch -replace '^refs/heads/','' -replace '^/',''
Write-Host "Using branch name: $branchName" -ForegroundColor Cyan

try {
    # Step 1: create mirror backup
    if (Test-Path $backupDirAbs) {
        Write-Host "Removing existing backup at $backupDirAbs" -ForegroundColor Cyan
        Remove-Item -Recurse -Force $backupDirAbs
    }

    Write-Host "Cloning mirror into $backupDirAbs..." -ForegroundColor Cyan
    git clone --mirror $repoRoot $backupDirAbs
    Assert-GitSuccess 'git clone --mirror'

    Push-Location $backupDirAbs
    try {
        # Step 2: rewrite history for the single branch using git filter-branch
        Write-Host "Rewriting history (git filter-branch) for branch $branchName..." -ForegroundColor Cyan
        git filter-branch --force --index-filter "git rm --cached --ignore-unmatch $FileToDelete" --prune-empty --tag-name-filter cat -- $branchName
        Assert-GitSuccess 'git filter-branch'

        # Step 3: remove refs/original and garbage-collect
        if (Test-Path .\refs\original) {
            Write-Host "Removing refs/original..." -ForegroundColor Cyan
            Remove-Item -Recurse -Force .\refs\original
        }

        Write-Host "Expiring reflog and running git gc..." -ForegroundColor Cyan
        git reflog expire --expire=now --all
        Assert-GitSuccess 'git reflog expire'
        git gc --prune=now --aggressive
        Assert-GitSuccess 'git gc'

        # Step 4: force-push the cleaned branch
        Write-Host "Force-pushing cleaned branch to origin..." -ForegroundColor Cyan
        git push --force origin refs/heads/$branchName:refs/heads/$branchName
        Assert-GitSuccess 'git push --force'

        Write-Host "Done. Please verify on GitHub that the push succeeded and that secret push protection is cleared." -ForegroundColor Green
        Write-Host "If GitHub still blocks the push, open the Unblock link from the push error and follow the instructions." -ForegroundColor Yellow
    } finally {
        Pop-Location
    }
} finally {
    Set-Location $originalLocation
    Write-Host "Cleanup script finished." -ForegroundColor Green
}
