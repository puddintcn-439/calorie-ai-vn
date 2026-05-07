# Calorie AI VN 🥗

> AI Calorie Tracker cho đồ ăn Việt Nam — scan ảnh, nhập text, tự động phân tích calo.

## Tech Stack

| Layer | Tech |
|---|---|
| Mobile | React Native + Expo SDK 51 + Expo Router |
| State | Zustand |
| Backend | NestJS + Passport JWT |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| AI | Google Gemini 2.0 Flash |
| Monorepo | Turborepo |

## Project Structure

```
calorie-ai-vn/
├── apps/
│   ├── mobile/          # Expo React Native app
│   └── backend/         # NestJS API
├── packages/
│   └── types/           # Shared TypeScript interfaces
└── supabase/
    └── migrations/      # Database schema
```

## Getting Started

### 1. Prerequisites

- Node.js >= 20
- npm >= 10
- [Supabase account](https://supabase.com) (free tier đủ dùng)
- [Google AI Studio API key](https://aistudio.google.com) (Gemini)

### 2. Clone & Install

```bash
git clone <repo>
cd calorie-ai-vn
npm install
```

### 3. Setup Environment

```bash
cp .env.example apps/backend/.env
# Điền Supabase URL, Service Key, Gemini API key, JWT secret

cp .env.example apps/mobile/.env
# Điền Supabase URL, Anon key, backend URL
```

### 4. Setup Supabase

1. Tạo project mới tại supabase.com
2. Vào SQL Editor, chạy lần lượt các file trong `supabase/migrations/`
3. Copy URL + keys vào `.env`

### 5. Run Development

```bash
# Backend
npm run backend
# → http://localhost:3000
# → Swagger: http://localhost:3000/api/docs

# Mobile (trong terminal khác)
npm run mobile
# → Quét QR bằng Expo Go app
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Đăng ký |
| POST | `/auth/login` | Đăng nhập |
| POST | `/ai/scan/image` | Scan ảnh đồ ăn |
| POST | `/ai/scan/text` | Phân tích text |
| POST | `/ai/coach` | Hỏi AI coach |
| GET | `/log/daily?date=YYYY-MM-DD` | Log hôm nay |
| POST | `/log` | Thêm log |
| DELETE | `/log/:id` | Xoá log |
| GET | `/food/search?q=phở` | Tìm kiếm món ăn |
| GET | `/user/profile` | Xem profile |
| PATCH | `/user/profile` | Cập nhật profile |

## Roadmap

- [ ] Streak / gamification
- [ ] AI Coach màn hình chat
- [ ] Weekly insights
- [ ] Barcode scanner
- [ ] Apple HealthKit / Google Fit sync
- [ ] Freemium / subscription (RevenueCat)
