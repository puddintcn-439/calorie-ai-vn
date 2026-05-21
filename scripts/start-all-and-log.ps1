param(
    [int]$WebPort = 8081,
    [int]$BackendPort = 3000
)

$scriptDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')

# Kill common ports if processes are listening
$ports = @($BackendPort, $WebPort, 19000, 19001, 19007)
foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host "Killed PID $($c.OwningProcess) on port $p" } catch {}
        }
    }
}

# Start backend and Expo in separate PowerShell windows
Start-Process -FilePath 'powershell' -ArgumentList '-NoExit','-Command',"cd `"$repoRoot`"; npm --prefix apps/backend run start"
Start-Process -FilePath 'powershell' -ArgumentList '-NoExit','-Command',"cd `"$repoRoot`"; npm --prefix apps/mobile run dev"

Start-Sleep -Seconds 6

# Generate links markdown
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scriptDir 'generate-dev-links.ps1')

Write-Host "Started dev servers and wrote docs/dev-links.md"
