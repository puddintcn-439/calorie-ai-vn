$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')

& "$PSScriptRoot\kill-dev-ports.ps1" -Ports @(19006, 19007)
if ($LASTEXITCODE -ne 0) {
	Write-Output 'Failed to clean mobile ports 19006/19007'
	exit 1
}

Set-Location "$PSScriptRoot\..\apps\mobile"

# CI mode disables interactive prompts (port switch confirmations, etc.).
$env:CI = '1'

$stdoutLog = Join-Path $env:TEMP 'calorie-ai-mobile-web.out.log'
$stderrLog = Join-Path $env:TEMP 'calorie-ai-mobile-web.err.log'
if (Test-Path $stdoutLog) {
	Remove-Item $stdoutLog -Force -ErrorAction SilentlyContinue
}
if (Test-Path $stderrLog) {
	Remove-Item $stderrLog -Force -ErrorAction SilentlyContinue
}

try {
	$process = Start-Process -FilePath 'npx.cmd' -ArgumentList @('expo', 'start', '--web', '--port', '19006', '--clear', '--non-interactive') -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
} catch {
	Write-Output "Failed to start mobile web process: $($_.Exception.Message)"
	exit 1
}

$healthy = $false
for ($attempt = 1; $attempt -le 90; $attempt++) {
	if ($process.HasExited) {
		break
	}

	try {
		$response = Invoke-WebRequest -Uri 'http://localhost:19006' -UseBasicParsing -TimeoutSec 2
		if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
			$healthy = $true
			break
		}
	} catch {
		# Keep retrying until timeout or process exit.
	}
}

if ($healthy) {
	Write-Output "Mobile web ready on http://localhost:19006 (PID: $($process.Id))"
	exit 0
}

Write-Output "Mobile web failed to become ready. Process exited: $($process.HasExited)"
if (Test-Path $stdoutLog) {
	Write-Output '--- mobile stdout tail ---'
	Get-Content $stdoutLog -Tail 80
}
if (Test-Path $stderrLog) {
	Write-Output '--- mobile stderr tail ---'
	Get-Content $stderrLog -Tail 80
}

exit 1
