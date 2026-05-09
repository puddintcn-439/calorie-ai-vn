$env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('PATH','User')

& "$PSScriptRoot\kill-dev-ports.ps1" -Ports @(3000)
if ($LASTEXITCODE -ne 0) {
	Write-Output 'Failed to clean backend port 3000'
	exit 1
}

Set-Location "$PSScriptRoot\..\apps\backend"

# Start watch mode in background and wait until HTTP endpoint is healthy.
$stdoutLog = Join-Path $env:TEMP 'calorie-ai-backend-dev.out.log'
$stderrLog = Join-Path $env:TEMP 'calorie-ai-backend-dev.err.log'
if (Test-Path $stdoutLog) {
	Remove-Item $stdoutLog -Force -ErrorAction SilentlyContinue
}
if (Test-Path $stderrLog) {
	Remove-Item $stderrLog -Force -ErrorAction SilentlyContinue
}

try {
	$process = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog
} catch {
	Write-Output "Failed to start backend process: $($_.Exception.Message)"
	exit 1
}

$healthy = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
	if ($process.HasExited) {
		break
	}

	try {
		$response = Invoke-WebRequest -Uri 'http://localhost:3000/api/docs' -UseBasicParsing -TimeoutSec 2
		if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
			$healthy = $true
			break
		}
	} catch {
		# Keep retrying until timeout or process exit.
	}
}

if ($healthy) {
	Write-Output "Backend ready on http://localhost:3000 (PID: $($process.Id))"
	exit 0
}

Write-Output "Backend failed to become ready. Process exited: $($process.HasExited)"
if (Test-Path $stdoutLog) {
	Write-Output '--- backend stdout tail ---'
	Get-Content $stdoutLog -Tail 60
}
if (Test-Path $stderrLog) {
	Write-Output '--- backend stderr tail ---'
	Get-Content $stderrLog -Tail 60
}

exit 1
