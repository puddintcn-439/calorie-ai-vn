<#
Starts backend and mobile (Expo) dev servers in separate PowerShell windows and prints reachable URLs.

Usage:
  .\scripts\start-all.ps1

Options:
  -NoOpenWindows  : Do not open new windows; just print the commands that would run.
#>

param(
    [switch]$NoOpenWindows
)

$root = Resolve-Path "$PSScriptRoot\.." | Select-Object -ExpandProperty Path
$backend = Join-Path $root 'apps\backend'
$mobile = Join-Path $root 'apps\mobile'

Write-Host "Workspace root: $root"
Write-Host "Backend dir: $backend"
Write-Host "Mobile dir: $mobile"

# Ports commonly used by dev servers
$ports = @{ backend=3000; metro=8081; expo=19006 }

function Stop-PortProcesses {
    param([int[]]$PortList)
    foreach($p in $PortList) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -Unique OwningProcess
            if($conns) {
                foreach($c in $conns) {
                    $pid = $c.OwningProcess
                    if($pid) {
                        Write-Host "Stopping PID $pid listening on port $p"
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        } catch {
            # ignore
        }
    }
}

Stop-PortProcesses -PortList $ports.Values

if (-not $NoOpenWindows) {
    Write-Host 'Starting a fresh PayOS development webhook tunnel...'
    & (Join-Path $PSScriptRoot 'start-payos-dev-tunnel.ps1')
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'PayOS webhook tunnel could not be started. Browser return reconciliation will remain available.'
    }
}

function Start-DevWindow {
    param([string]$Path, [string]$Cmd)
    if($NoOpenWindows) {
        Write-Host "Would run: (cd $Path) ; $Cmd"
    } else {
        $command = "cd `"$Path`"; $Cmd"
        Start-Process -FilePath powershell -ArgumentList "-NoExit","-Command",$command
    }
}

Start-DevWindow -Path $backend -Cmd "npm run dev"
Start-DevWindow -Path $mobile -Cmd "npm run dev:web"

# wait briefly for ports to come up (best-effort)
$checkPorts = @($ports.backend,$ports.metro,$ports.expo)
$timeout = 60
$start = Get-Date
while(((Get-Date) - $start).TotalSeconds -lt $timeout) {
    $ready = 0
    foreach($p in $checkPorts) {
        $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if($c) { $ready++ }
    }
    if($ready -eq $checkPorts.Count) { break }
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "Dev links:"
if(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { Write-Host " - Backend: http://localhost:3000" } else { Write-Host " - Backend: not listening on 3000" }
if(Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { Write-Host " - Expo Metro (web/bundler): http://localhost:8081" } else { Write-Host " - Expo Metro: not listening on 8081" }
if(Get-NetTCPConnection -LocalPort 19006 -State Listen -ErrorAction SilentlyContinue) { Write-Host " - Expo web dev server: http://localhost:19006" }

# expo dev client link using local IP (best effort)
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
if($ip) {
    Write-Host " - Expo dev-client URL: exp+calorie-ai-vn://expo-development-client/?url=http://$ip:8081"
}
Write-Host ""
Write-Host "If links are missing, open the terminal windows started by this script to see the full Expo output (QR code and additional URLs)."
