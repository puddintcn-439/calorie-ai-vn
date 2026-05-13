<#
Restart + Verify dev agent

Usage:
  .\scripts\restart-verify.ps1 [-Build] [-RunTests] [-NoOpenWindows] [-SkipVerify]

By default (no flags) the script will: build backend, restart backend and Expo, and verify basic health endpoints.

Flags:
  -Build         : Run `npm run build` in `apps/backend` and a TS check in `apps/mobile` before restart.
  -RunTests      : Run `npm run test` in `apps/backend` (optional, may be slow).
  -NoOpenWindows : Do not open new PowerShell windows; print commands instead.
  -SkipVerify    : Do not perform HTTP health checks after restart.
#>

param(
    [switch]$Build,
    [switch]$RunTests,
    [switch]$NoOpenWindows,
    [switch]$SkipVerify
)

# If the user passed no flags, default to build + verify (no tests)
if(-not($PSBoundParameters.ContainsKey('Build') -or $PSBoundParameters.ContainsKey('RunTests') -or $PSBoundParameters.ContainsKey('SkipVerify'))) {
    $Build = $true
}

$root = Resolve-Path "$PSScriptRoot\.." | Select-Object -ExpandProperty Path
$backend = Join-Path $root 'apps\backend'
$mobile = Join-Path $root 'apps\mobile'

Write-Host "Workspace: $root"
Write-Host "Backend: $backend"
Write-Host "Mobile: $mobile"
Write-Host "Options => Build:$Build  RunTests:$RunTests  SkipVerify:$SkipVerify  NoOpenWindows:$NoOpenWindows"

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
        } catch { }
    }
}

Stop-PortProcesses -PortList $ports.Values

if($Build) {
    Write-Host "\n[1/3] Building backend..."
    Push-Location $backend
    Write-Host "Running: npm run build"
    & npm run build
    if($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Backend build failed (exit $LASTEXITCODE). Aborting."; exit 1 }
    Pop-Location

    Write-Host "[2/3] Running mobile TypeScript check (npm run lint)..."
    Push-Location $mobile
    if(Test-Path package.json) {
        Write-Host "Running: npm run lint"
        & npm run lint
        if($LASTEXITCODE -ne 0) { Write-Host "Mobile lint returned exit $LASTEXITCODE. Continue anyway." }
    }
    Pop-Location
}

if($RunTests) {
    Write-Host "[3/3] Running backend tests..."
    Push-Location $backend
    & npm run test
    if($LASTEXITCODE -ne 0) { Write-Host "Tests returned exit $LASTEXITCODE." }
    Pop-Location
}

function Start-DevWindow {
    param([string]$Path, [string]$Cmd, [string]$Label)
    if($NoOpenWindows) {
        Write-Host "Would run: (cd $Path) ; $Cmd"
    } else {
        $command = "cd `"$Path`"; $Cmd"
        Start-Process -FilePath powershell -ArgumentList "-NoExit","-Command",$command
        Write-Host "Started $Label in a new PowerShell window"
    }
}

Start-DevWindow -Path $backend -Cmd "npm run dev" -Label "backend"
Start-DevWindow -Path $mobile -Cmd "npm run dev" -Label "mobile"

# wait for ports (best-effort)
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

Write-Host "\n-- Verification --"
if(-not $SkipVerify) {
    $backendOk = $false
    try {
        $resp = Invoke-WebRequest -Uri 'http://localhost:3000/health/ready' -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        if($resp.StatusCode -eq 200) { $backendOk = $true; Write-Host "Backend health OK: 200" } else { Write-Host "Backend health returned $($resp.StatusCode)" }
    } catch {
        Write-Host "Backend health check failed: $($_.Exception.Message)"
    }

    if(Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue) { Write-Host "Expo Metro: listening on 8081" } else { Write-Host "Expo Metro: not listening on 8081" }
    if(Get-NetTCPConnection -LocalPort 19006 -State Listen -ErrorAction SilentlyContinue) { Write-Host "Expo web dev server: listening on 19006" } else { Write-Host "Expo web dev server: not listening on 19006" }

    if(-not $backendOk) { Write-Host "\nRESULT: VERIFICATION FAILED"; exit 2 } else { Write-Host "\nRESULT: verification succeeded"; exit 0 }
} else {
    Write-Host "Skipping verification (flag)."
}
