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

Đã được bổ sung trong P1:

- Profile có health flags cho thai kỳ, cho con bú, bệnh thận, tiểu đường, rối loạn ăn uống và thuốc ảnh hưởng cân nặng.
- BMI hiển thị theo hướng screening/risk, không phải chẩn đoán.
- Under-18, thai kỳ/cho con bú và rối loạn ăn uống được ép về maintenance-only.
- Kidney disease, diabetes và medication flags bật cảnh báo cần chuyên gia xem lại.
- Weekly adaptive target tự dừng khi hồ sơ cần medical review.
- Macro card có thêm mục tiêu fiber, sodium, free/added sugar và saturated fat.
- Today hiển thị actual fiber, sodium, total sugar và saturated fat khi dữ liệu log có các trường này.
- Today nhắc hoàn thiện hồ sơ an toàn hoặc xem cảnh báo y tế khi profile có risk flags.
- Goal plan cá nhân được tính lại ở backend, có clamp an toàn và lưu `safety_status`/warnings.
- Profile là nơi cấu hình các hoạt động người dùng muốn/có thể tập; Today dùng dữ liệu này để đề xuất vận động và khi hoàn thành sẽ ghi vào Log.

## Blocker Trước Go-Live

- Cần chạy EAS preview build thật và ghi lại build ID.
- Cần cấu hình `PRODUCTION_DEPLOY_WEBHOOK_URL` và `PRODUCTION_ROLLBACK_WEBHOOK_URL`.
- Cần validate food database với global staples, packaged foods và món Việt phổ biến.
- Cần native QA cho HealthKit, Health Connect, barcode, receipt, and camera.
- Cần clinical/nutrition review cho toàn bộ health copy và ngưỡng dinh dưỡng trước khi claim rộng.
- Cần apply migration `015_user_health_flags.sql`, `016_food_quality_nutrients.sql`, `017_add_goal_plan_to_users.sql` và `018_user_activity_preferences.sql` trên staging/prod.

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
