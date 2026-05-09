$backendUrl = 'http://localhost:3000/api/docs'
$mobileUrl = 'http://localhost:19006'

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Label
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    Write-Output "$Label healthy ($($response.StatusCode))"
    return $true
  } catch {
    Write-Output "$Label unhealthy: $($_.Exception.Message)"
    return $false
  }
}

$ok = $true

if (-not (Test-HttpEndpoint -Url $backendUrl -Label 'Backend')) {
  $ok = $false
}

if (-not (Test-HttpEndpoint -Url $mobileUrl -Label 'Mobile web')) {
  $ok = $false
}

if ($ok) {
  Write-Output 'Health: PASS'
  exit 0
}

Write-Output 'Health: FAIL'
exit 1