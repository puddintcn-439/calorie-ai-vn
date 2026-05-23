param(
  [switch]$CheckSecrets
)

$root = Resolve-Path "$PSScriptRoot\.."
$backendEnv = Join-Path $root 'apps\backend\.env'
$mobileEnv = Join-Path $root 'apps\mobile\.env'

function Test-HealthyPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Label
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    Write-Output "Port $Port is occupied by healthy $Label ($($response.StatusCode))"
    return $true
  } catch {
    Write-Output "Port $Port is occupied but $Label health check failed: $($_.Exception.Message)"
    return $false
  }
}

$ok = $true

if (-not (Test-Path $backendEnv)) {
  Write-Output 'Missing apps/backend/.env'
  $ok = $false
} else {
  Write-Output 'Found apps/backend/.env'
}

if (-not (Test-Path $mobileEnv)) {
  Write-Output 'Missing apps/mobile/.env'
  $ok = $false
} else {
  Write-Output 'Found apps/mobile/.env'
}

if ($CheckSecrets) {
  Write-Output 'Running secrets check...'
  $required = @('GEMINI_API_KEY_PRIMARY','SUPABASE_URL','SUPABASE_SERVICE_KEY','JWT_SECRET')
  $missing = @()

  # helper to read key from .env file
  function Get-EnvFromFile($filePath, $key) {
    if (-not (Test-Path $filePath)) { return $null }
    $lines = Get-Content -Path $filePath -ErrorAction SilentlyContinue
    foreach ($line in $lines) {
      if ($line -match "^\s*${key}\s*=\s*(.+)$") {
        return $matches[1].Trim()
      }
    }
    return $null
  }

  foreach ($k in $required) {
    $val = [Environment]::GetEnvironmentVariable($k, 'Process')
    if (-not $val -or $val.Trim() -eq '') {
      # try .env
      $val = Get-EnvFromFile -filePath $backendEnv -key $k
    }

    if (-not $val -or $val.Trim() -eq '') {
      # Special-case: accept legacy GEMINI_API_KEY if GEMINI_API_KEY_PRIMARY is missing
      if ($k -eq 'GEMINI_API_KEY_PRIMARY') {
        $legacy = [Environment]::GetEnvironmentVariable('GEMINI_API_KEY', 'Process')
        if (-not $legacy -or $legacy.Trim() -eq '') {
          # try .env for legacy
          $legacy = Get-EnvFromFile -filePath $backendEnv -key 'GEMINI_API_KEY'
        }
        if (-not $legacy -or $legacy.Trim() -eq '') {
          $missing += $k
          continue
        }
      } else {
        $missing += $k
        continue
      }
    } else {
      if ($val -match 'change|example|dev|placeholder|REPLACE_ME' ) {
        Write-Output "Warning: $k has placeholder value in .env"
        $missing += $k
      }
    }
  }

  if ($missing.Count -gt 0) {
    Write-Output "Missing or placeholder secrets: $($missing -join ', ')"
    $ok = $false
  } else {
    Write-Output 'Secrets check: OK'
  }
}

$services = @(
  @{ Port = 3000; Url = 'http://localhost:3000/api/docs'; Label = 'backend' },
  @{ Port = 19006; Url = 'http://localhost:19006'; Label = 'mobile web' }
)

foreach ($service in $services) {
  $port = $service.Port
  $inUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if ($inUse) {
    if (-not (Test-HealthyPort -Port $port -Url $service.Url -Label $service.Label)) {
      $ok = $false
    }
  } else {
    Write-Output "Port $port is free"
  }
}

if ($ok) {
  Write-Output 'Preflight: PASS'
  exit 0
}

Write-Output 'Preflight: FAIL'
exit 1
