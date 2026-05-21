param(
    [int]$WebPort = 8081,
    [int]$BackendPort = 3000
)

# Attempt to find a suitable LAN IPv4 address (fallback to localhost)
$ip = $null
try {
    $ipEntry = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
        Sort-Object -Property PrefixLength -Descending |
        Select-Object -First 1
    if ($ipEntry) { $ip = $ipEntry.IPAddress }
} catch {
    $ip = $null
}

if (-not $ip) { $ip = 'localhost' }

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$outFile = Join-Path $repoRoot 'docs\\dev-links.md'

$template = @"
# Dev Run Links

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

- Web (local): [http://localhost:$($WebPort)](http://localhost:$($WebPort))
- Web (LAN): [http://$($ip):$($WebPort)](http://$($ip):$($WebPort))
- Dev client (development build): exp+calorie-ai-vn://expo-development-client/?url=http://$($ip):$($WebPort)
- Expo Go (open on device): exp://$($ip):$($WebPort)

Commands to start (from repo root):
```powershell
Start-Process powershell -ArgumentList '-NoExit','-Command','npm --prefix apps/backend run start'
Start-Process powershell -ArgumentList '-NoExit','-Command','npm --prefix apps/mobile run dev'
# or
.\\scripts\\start-all-and-log.ps1
```

Notes:
- Paste the `exp://` link into a mobile browser or scan the QR code printed by the Expo terminal to open the project in Expo Go.
- Ensure your phone is on the same Wi‑Fi network as this machine. If the LAN link fails, try the `localhost` link via a device proxy or use a tunnel (ngrok) with a valid authtoken.
"@

$template | Out-File -FilePath $outFile -Encoding utf8
Write-Host "Wrote dev links to $outFile"
