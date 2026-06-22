param(
    [string]$BackendUrl = 'http://localhost:3000',
    [int]$TimeoutSeconds = 30
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..') | Select-Object -ExpandProperty Path
$envPath = Join-Path $repoRoot 'apps\backend\.env'
$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $ngrok -and -not $cloudflared) {
    Write-Error 'Neither ngrok nor cloudflared is installed or available on PATH.'
    exit 1
}
if (-not (Test-Path -LiteralPath $envPath)) {
    Write-Error "Backend environment file was not found: $envPath"
    exit 1
}

$stdoutLog = Join-Path $env:TEMP 'calorie-ai-payos-tunnel.out.log'
$stderrLog = Join-Path $env:TEMP 'calorie-ai-payos-tunnel.err.log'
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

$publicUrl = $null
$provider = $null
$process = $null

if ($ngrok) {
    Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match '\bhttp\s+(3000|http://localhost:3000)\b' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    $process = Start-Process `
        -FilePath $ngrok.Source `
        -ArgumentList @('http', '3000', '--log', 'stdout') `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    $startedAt = Get-Date
    while (((Get-Date) - $startedAt).TotalSeconds -lt $TimeoutSeconds) {
        if ($process.HasExited) { break }
        try {
            $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
            $publicUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1).public_url
            if ($publicUrl) {
                $provider = 'ngrok'
                break
            }
        } catch {
            # ngrok inspector is not ready yet
        }
        Start-Sleep -Milliseconds 500
    }
}

if (-not $publicUrl -and $cloudflared) {
    Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match '--url\s+["'']?http://localhost:3000' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    $process = Start-Process `
        -FilePath $cloudflared.Source `
        -ArgumentList @('tunnel', '--no-autoupdate', '--url', $BackendUrl) `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    $startedAt = Get-Date
    while (((Get-Date) - $startedAt).TotalSeconds -lt $TimeoutSeconds) {
        if ($process.HasExited) { break }
        $logText = ((Get-Content -LiteralPath $stdoutLog, $stderrLog -ErrorAction SilentlyContinue) -join "`n")
        $match = [regex]::Match($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $publicUrl = $match.Value
            $provider = 'cloudflared-quick'
            break
        }
        Start-Sleep -Milliseconds 500
    }
}

if (-not $publicUrl) {
    Write-Error 'Cloudflare did not provide a Quick Tunnel URL before timeout.'
    Get-Content -LiteralPath $stdoutLog, $stderrLog -ErrorAction SilentlyContinue |
        Select-Object -Last 40
    exit 1
}

$webhookUrl = "$publicUrl/billing/webhooks/payos"
$envText = [IO.File]::ReadAllText($envPath)
if ($envText -match '(?m)^PAYOS_WEBHOOK_URL=.*$') {
    $envText = [regex]::Replace($envText, '(?m)^PAYOS_WEBHOOK_URL=.*$', "PAYOS_WEBHOOK_URL=$webhookUrl")
} else {
    $envText = $envText.TrimEnd() + [Environment]::NewLine + "PAYOS_WEBHOOK_URL=$webhookUrl" + [Environment]::NewLine
}
[IO.File]::WriteAllText($envPath, $envText, [Text.UTF8Encoding]::new($false))

Write-Output "PayOS development webhook tunnel ($provider): $publicUrl"
Write-Output "PAYOS_WEBHOOK_URL updated in apps/backend/.env"
Write-Output "Tunnel PID: $($process.Id)"
Write-Output 'Start or restart the backend after this command so PayOS registers the new webhook URL.'
