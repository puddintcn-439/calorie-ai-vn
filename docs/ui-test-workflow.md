# UI Test Run Order — Calorie AI VN (Developer checklist)

Mục đích: lưu lại thứ tự chạy thủ công để dev/CI có thể thực hiện nhanh theo cùng một quy trình.

## 1. Backend

Chạy (root):

```powershell
cd C:\Users\VuNH44\calorie-ai-vn
npm run dev:backend:ready
```

Kiểm tra health:

```powershell
Invoke-WebRequest http://localhost:3000/health
```

> Script: `scripts/start-backend-dev.ps1` (build → start → wait `/api/docs`).

## 2. Mobile Web

Mở terminal mới (root):

```powershell
cd C:\Users\VuNH44\calorie-ai-vn
npm run dev:mobile:web:ready
```

Mở UI web trên trình duyệt: `http://localhost:19006`

> Script: `scripts/start-mobile-web.ps1` (kills ports 19006/19007 → `expo start --web --port 19006`).

## 3. Chạy UI E2E (Playwright)

Mở terminal mới (apps/mobile):

```powershell
cd C:\Users\VuNH44\calorie-ai-vn\apps\mobile
# Nếu chưa cài browser cho Playwright
npx playwright install
npm run e2e:ci
```

Lưu ý: `npm run e2e:ci` chạy tập test (auth, home tabs, journey, profile, scan, strength log, desktop/mobile viewports...).

## 4. (Tùy chọn) Test trên iPhone bằng Expo Go

Backend phải chạy trước.

```powershell
cd C:\Users\VuNH44\calorie-ai-vn\apps\mobile
npx expo start --go --lan --clear
# Lấy IP Wi‑Fi máy tính
Get-NetIPAddress -AddressFamily IPv4
# Ví dụ link được tạo: exp://192.168.0.103:8081
```

Nếu app mở được nhưng gọi API lỗi, chỉnh `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://<IP-WIFI-CUA-MAY>:3000
```

Rồi restart Expo.

## 5. Verification trước release

```powershell
cd C:\Users\VuNH44\calorie-ai-vn
npm run preflight
npm run build

cd apps\mobile
npm run lint
npm run e2e:ci

cd ..\backend
npm test -- --runInBand
```

## Ghi chú ngắn
- Metro port mặc định là `8081` (hoặc port khác nếu bạn đã override). Luôn dùng port mà Expo CLI báo tại thời điểm chạy.
- Nếu điện thoại không kết nối được: kiểm tra cùng Wi‑Fi, firewall Windows, hoặc dùng tunnel (ngrok với authtoken sẽ ổn định hơn localtunnel).
- Các script tham chiếu:
  - `scripts/start-backend-dev.ps1`
  - `scripts/start-mobile-web.ps1`
  - `scripts/kill-dev-ports.ps1`

---
Lưu bởi GitHub Copilot (theo yêu cầu của developer).