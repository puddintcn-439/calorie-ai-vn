Param(
  [Parameter(Mandatory=$true)]
  [string]$Repo
)

# Usage:
#   $env:GEMINI_API_KEY = '...'; ./scripts/rotate_github_secrets.ps1 -Repo 'myorg/myrepo'

$secrets = @(
  'GEMINI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_DB_URL',
  'JWT_SECRET',
  'SENTRY_DSN',
  'TAVILY_API_KEY'
)

foreach ($name in $secrets) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrEmpty($val)) {
    Write-Host "[skip] $name not set in environment"
    continue
  }
  Write-Host "Setting secret $name in $Repo"
  $val | gh secret set $name --repo $Repo --body - | Out-Null
}

Write-Host "Done. Verify secrets in GitHub repo settings and rotate provider-side keys as needed."
