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
