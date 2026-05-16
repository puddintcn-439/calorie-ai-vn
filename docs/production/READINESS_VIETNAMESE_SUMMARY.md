# Tóm Tắt Readiness

Ngày cập nhật: 2026-05-16

## Định Hướng Sản Phẩm

Calorie AI đi theo hướng global-first: phục vụ nhiều thị trường, nhiều kiểu món ăn và nhiều ngôn ngữ. Món Việt là lợi thế dữ liệu/UX quan trọng, không phải giả định duy nhất trong công thức sức khỏe.

## Trạng Thái Hiện Tại

Đã có:

- Mobile app với 5 tab chính: Today, Scan, Log, Coach, Profile.
- AI scan ảnh, text, receipt và voice-transcript.
- Barcode lookup với local database trước, Open Food Facts fallback sau.
- Food/activity log, saved meals, weekly insights, progress, achievements.
- HealthKit/Health Connect integration path cho native preview builds.
- Subscription tiers và feature gating.
- Backend Dockerfile, health endpoints, GHCR image build.

Đã được siết lại trong P0:

- Barcode fallback được chuẩn hóa và cache local.
- Barcode calories được scale theo serving size khi log.
- Voice recording không còn tạo transcript giả.
- BMI mặc định theo adult global cutoffs.
- Under-18 và underweight weight-loss flows bị chặn về maintenance.
- Deploy workflow không còn báo success nếu chưa có rollout thật.

## Blocker Trước Go-Live

- Cần chạy EAS preview build thật và ghi lại build ID.
- Cần cấu hình `PRODUCTION_DEPLOY_WEBHOOK_URL` và `PRODUCTION_ROLLBACK_WEBHOOK_URL`.
- Cần validate food database với global staples, packaged foods và món Việt phổ biến.
- Cần native QA cho HealthKit, Health Connect, barcode, receipt, and camera.
- Cần cảnh báo y tế rõ trong onboarding/profile: app không thay thế bác sĩ, không dùng cho điều trị bệnh.

## Không Nên Claim

Không claim:

- “Production ready 100%”.
- “11,000+ foods validated” nếu chưa có evidence từ DB/staging.
- “Voice logging tự động” khi chưa có speech-to-text provider.
- “Medical/clinical advice”.

Có thể claim:

- AI-assisted food logging.
- Wellness calorie estimates.
- Barcode fallback through Open Food Facts.
- Global-first nutrition tracking with strong Vietnamese food support.
