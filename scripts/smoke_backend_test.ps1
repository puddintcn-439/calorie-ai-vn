param(
  [string]$BaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'

Write-Host "Testing $BaseUrl/health..."
try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -UseBasicParsing -ErrorAction Stop
  Write-Host "HEALTH OK: $($health | ConvertTo-Json -Depth 5)"
} catch {
  Write-Host "HEALTH FAIL: $_"
  exit 1
}

Write-Host "Testing $BaseUrl/ai-debug/scan/text..."
$body = @{ text = "smoke test $(Get-Date -Format 'o')" } | ConvertTo-Json -Depth 3
try {
  $resp = Invoke-RestMethod -Uri "$BaseUrl/ai-debug/scan/text" -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -ErrorAction Stop
  Write-Host "AI DEBUG RESPONSE: $($resp | ConvertTo-Json -Depth 5)"
  if ($resp.success -eq $true) {
    Write-Host "SMOKE TEST PASSED"
    exit 0
  } else {
    Write-Host "SMOKE TEST FAILED (success=false)"
    exit 2
  }
} catch {
  Write-Host "AI DEBUG REQUEST FAILED: $_"
  exit 1
}
