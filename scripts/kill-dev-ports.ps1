param(
  [int[]]$Ports = @(3000, 19006, 19007)
)

$hadFailure = $false

foreach ($port in $Ports) {
  # Only treat LISTEN sockets as port conflicts. TIME_WAIT/FIN_WAIT are transient and not blockers.
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($null -eq $connections) {
    Write-Output "Port $port already free"
    continue
  }

  $pids = $connections |
    Where-Object { $_.OwningProcess -gt 0 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $pids) {
    try {
      Stop-Process -Id $processId -Force -ErrorAction Stop
    } catch {
      Write-Output "Failed to stop PID $processId on port ${port}: $($_.Exception.Message)"
      $hadFailure = $true
    }
  }

  $remaining = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($remaining) {
    $remainingPids = $remaining |
      Where-Object { $_.OwningProcess -gt 0 } |
      Select-Object -ExpandProperty OwningProcess -Unique
    Write-Output "Port $port still busy after cleanup (PID(s): $($remainingPids -join ', '))"
    $hadFailure = $true
  } else {
    Write-Output "Freed port $port (PID(s): $($pids -join ', '))"
  }
}

if ($hadFailure) {
  exit 1
}

exit 0
