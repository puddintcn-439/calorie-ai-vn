# Dev Run Links

Generated: 2026-05-21 00:15:19

- Web (local): [http://localhost:8081](http://localhost:8081)
- Web (LAN): [http://192.168.0.100:8081](http://192.168.0.100:8081)
- Dev client (development build): exp+calorie-ai-vn://expo-development-client/?url=http://192.168.0.100:8081
- Expo Go (open on device): exp://192.168.0.100:8081

Commands to start (from repo root):
`powershell
Start-Process powershell -ArgumentList '-NoExit','-Command','npm --prefix apps/backend run start'
Start-Process powershell -ArgumentList '-NoExit','-Command','npm --prefix apps/mobile run dev'
# or
.\\scripts\\start-all-and-log.ps1
`

Notes:
- Paste the exp:// link into a mobile browser or scan the QR code printed by the Expo terminal to open the project in Expo Go.
- Ensure your phone is on the same Wiâ€‘Fi network as this machine. If the LAN link fails, try the localhost link via a device proxy or use a tunnel (ngrok) with a valid authtoken.
