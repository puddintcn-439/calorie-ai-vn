# App Flow — Tổng quan theo Tab

Tài liệu này mô tả luồng chức năng chính của ứng dụng theo từng tab, các liên kết chéo, cách hiển thị theo mốc thời gian và cách dữ liệu được cập nhật. Cuối tài liệu kết luận nhóm người dùng mục tiêu và lộ trình E2E cho từng nhóm.

---

## **Hôm nay (Home)**
- **Chức năng chính**: Dashboard hàng ngày — hiển thị tổng calo đã ăn, calo mục tiêu, net (eat - burned), daily roadmap (bài tập gợi ý), top coaching insight, khuyến nghị (recommendations).
- **Liên quan**: `Nhật ký` (chi tiết logs), `Coach` (insight + chat), `Tiến trình` (body progress), `Thống kê` (aggregates tuần), `Scan` (tạo log từ scan).
- **Hiển thị theo thời gian**: trọng tâm là *hôm nay* (day). Có các thẻ/khối cho thông tin tuần (weekly summary), và đề xuất/backfill dựa trên dữ liệu tuần.
- **Cập nhật**: khi mount gọi các store/actions: `fetchDailyLog()`, `fetchActivityLogs()`, `fetchDailyRoadmap()`, `fetchSubscription()`, `fetchSummary()`, `fetchRecommendations()`, `fetchTopInsight()`; có pull-to-refresh; activity sync qua `activitySyncService` có thể đồng bộ hoạt động từ thiết bị.
- **Ghi chú**: dùng `useLogStore`, `useCalorieTargetStore`, `useSubscriptionStore`, `useGamificationStore` để đồng bộ dữ liệu hiển thị.

## **Scan**
- **Chức năng chính**: Quét ảnh/ảnh hoá đơn/text/voice/barcode để parse món ăn, ước lượng macro & calo bằng AI; cho phép chỉnh sửa, refine và lưu thành log hoặc saved meal.
- **Liên quan**: `Nhật ký` (tạo/ghi log), `Hôm nay` (hiện ngay trong daily), `Profile` (calorie targets ảnh hưởng gợi ý), `Coach` (có thể dùng kết quả làm ngữ cảnh).
- **Hiển thị theo thời gian**: hành động tức thì; kết quả áp dụng cho ngày hiện tại (hoặc ngày do người dùng chọn).
- **Cập nhật**: gọi các endpoint AI: `/ai/scan/image`, `/ai/scan/text`, `/ai/scan/voice`, `/ai/scan/receipt` (theo docs); sau khi nhận kết quả gọi `addLog`/`saveMeal` từ `useLogStore`.
- **Ghi chú**: có fallback khi AI quota/rate limit; telemetry cho low-confidence; có flow refine (người dùng bổ sung ngữ cảnh rồi gọi `refineScan`).

## **Nhật ký (Log)**
- **Chức năng chính**: Hiển thị nhật ký ăn uống & hoạt động trong ngày theo nhóm bữa; quick-log từ `savedMeals`; progress bar vs per-meal targets; xóa log; thêm/ghi nhanh hoạt động; quản lý roadmap.
- **Liên quan**: `Hôm nay` (tổng quan), `Scan` (tạo log), `Tiến trình` (kết quả dài hạn), `Profile` (lấy `perMealTargets`).
- **Hiển thị theo thời gian**: chủ yếu *ngày* (today). Lịch sử body-progress/roadmap hiển thị trong `Tiến trình`/`Profile`, nhưng `Log` tập trung vào day timeline.
- **Cập nhật**: store actions: `logSavedMeal()`, `removeLog(id)`, `addActivity()`, `deleteActivity()`, `addRoadmapItem()`, `deleteRoadmapItem()`, `fetchDailyLog()`; UI cập nhật sau call thành công, có Alert/EmptyState cho UX.
- **Ghi chú**: quick log UX (Alert chọn bữa), progress fill logic: width = min(total/perMealTarget*100,100).

## **Tiến trình (Progress / Body progress)**
- **Chức năng chính**: Ghi số liệu cơ thể (cân nặng, vòng eo, vòng hông, body fat, energy level), xem trend và tổng thay đổi (7-day, days_tracked), xóa mục nhập.
- **Liên quan**: `Profile` (dùng height/weight), `Insights` (so sánh tuần), `Coach` (gợi ý tập luyện), `Hôm nay` (liên quan mục tiêu calo ngày).
- **Hiển thị theo thời gian**: *ngày* (mục nhập từng ngày) + *tuần* (7-day deltas, days_tracked). Không có chart đồ thị phức tạp trong màn hình này (hiện là bảng/tổng hợp), nhưng có trường `trend` chứa nhiều entry.
- **Cập nhật**: GET `/body-progress/trend`, POST `/body-progress`, DELETE `/body-progress/:id`; sau khi lưu gọi `loadData()` để cập nhật.

## **Coach (AI Coach)**
- **Chức năng chính**: Chat với AI Coach, hiển thị weekly summary & insights, acknowledge insight; trả lời dựa trên context (today calories, weekly summary).
- **Liên quan**: `Hôm nay` (context), `Log` (dữ liệu ăn), `Progress`/`Insights` (context tuần), `Profile` (user meta), `Subscription` (gating premium features).
- **Hiển thị theo thời gian**: chat theo *real-time* tương tác; có khối *weekly summary* (tuần) và list insights (có thể thay đổi mỗi tuần).
- **Cập nhật**: fetch `/coaching/insights`, `/coaching/weekly-summary`; gửi message qua `askCoach()` (service) — backend AI trả về message; acknowledge via POST `/coaching/insights/:id/acknowledge`.
- **Ghi chú**: một số lỗi trả về message fallback; tính năng coach có thể bị gate bởi subscription (premium/pro).

## **Thống kê (Insights)**
- **Chức năng chính**: Tổng hợp tuần (weeklyInsights) — average calories/day, adherence %, days on target, macro breakdown, daily breakdown (chi tiết ngày trong tuần).
- **Liên quan**: `Hôm nay`, `Tiến trình`, `Coach` (dùng dữ liệu để đưa gợi ý tuần), `Profile` (target ảnh hưởng to target comparisons).
- **Hiển thị theo thời gian**: *Tuần* là trọng tâm; có breakdown theo *ngày* trong tuần; có các chỉ báo so sánh với tuần trước (trend_vs_last_week). Có thể mở chi tiết ngày.
- **Cập nhật**: gọi store `fetchWeeklyInsights()`; có refresh; `useInsightsStore` chịu trách nhiệm lưu/trả dữ liệu.

## **Hồ sơ (Profile)**
- **Chức năng chính**: Quản lý thông tin cơ bản (tên, tuổi, giới tính, cân nặng, chiều cao), mục tiêu (goal, activity_level), per-meal targets, notification prefs, subscription tier, assessment BMI & exercise roadmap, lưu profile.
- **Liên quan**: `Tiến trình` (data liên quan), `Log` (perMealTargets), `Hôm nay` (instant recommendations), `Coach` (context), `Scan` (thiết lập target để gợi ý chính xác hơn).
- **Hiển thị theo thời gian**: thông tin tĩnh nhưng có *instant assessment* tính theo dữ liệu hiện tại; exercise roadmap gợi ý dùng dữ liệu hiện tại.
- **Cập nhật**: GET `/user/profile`, PATCH `/user/profile`; reminder prefs via `useReminderStore`; subscription via `useSubscriptionStore`; cập nhật sẽ propagate tới `useLogStore`/dashboard khi fetch lại.
- **Ghi chú**: hiện có animation highlight khi `basicIncomplete && basicCollapsed`; cũng có logic auto-expand assessment khi weight+height có.

---

## **Shared stores & API (tóm tắt)**
- **Stores chính**: `useLogStore`, `useCalorieTargetStore`, `useGamificationStore`, `useSubscriptionStore`, `useInsightsStore`, `useReminderStore`, `useAuthStore`.
- **Endpoints nổi bật**: `/user/profile`, `/body-progress`, `/body-progress/trend`, `/coaching/insights`, `/coaching/weekly-summary`, `/ai/scan/*`, `/ai/coach`, các endpoint log/activity trong `useLogStore` (abstracted).
- **Sync sources**: activity sync (`activitySyncService`), AI scan services (`ai.service`), user interactions (quick log, manual add), background/periodic fetches are primarily on mount / pull-to-refresh.
- **Edge cases**: Android notification channels giữ cấu hình cũ (vibrationPattern); AI quota fallback; subscription gating affects Coach.

---

## **Đối tượng người dùng & chức năng phục vụ**
- **Người mới / Beginner**
  - Tính năng trọng tâm: Onboarding (Profile), Hôm nay (daily guidance), Scan (scan image -> log), Quick log.
  - Mục tiêu: nhanh chóng thiết lập profile, thấy target & dùng scan để log.
- **Người bận rộn (Busy professional)**
  - Tính năng trọng tâm: Saved meals (quick-log), Scan, Hôm nay (quick snapshot), Notifications reminders.
  - Mục tiêu: tối thiểu thời gian tương tác (1-2 tap), nhiều automation.
- **Người tập luyện / Fitness-focused**
  - Tính năng trọng tâm: Tiến trình (body progress), Roadmap/Activity catalog, Coach (tối ưu tập luyện), Insights (tuần).
  - Mục tiêu: theo dõi tiến trình dài hạn, tích hợp hoạt động và giữ adherence.
- **Người cần coaching/duy trì cân nặng (Emotional eaters / Behavioural support)**
  - Tính năng trọng tâm: Coach (chat), Insights (nhắc lại pattern), Notifications nudges.
  - Mục tiêu: hỗ trợ hành vi, check-in hàng ngày, AI guidance.
- **Người dùng cao cấp / clinical**
  - Tính năng trọng tâm: Coach premium, detailed Insights, Progress export.
  - Mục tiêu: care plan có khả năng cá nhân hóa sâu.

---

## **E2E usage roadmap (mỗi nhóm — bước chính)**

### Beginner (Onboarding → Habit)
1. Onboarding: mở app → điền `Profile` (height, weight, age, goal).  
2. Hôm nay: hệ thống tính instant target → hiển thị daily target.  
3. Scan: chụp ảnh/scan meal → chỉnh sửa items → `Lưu` thành log.  
4. Log: kiểm tra nhật ký & quick-log (saved meals).  
5. Weekly check: vào `Thống kê` để xem adherence & macro; nhận gợi ý Coach nếu cần.

### Busy Professional (Fast logging loop)
1. Thiết lập per-meal targets trong `Profile`.  
2. Tạo `Saved Meals` (từ scan hoặc lưu tay).  
3. Hàng ngày: dùng `Saved Meals` để quick-log (1-2 tap).  
4. Tự động nhận notifications nhắc log nếu bật.  
5. Tuần: mở `Insights` để kiểm tra compliance; adjust per-meal if needed.

### Fitness-focused (Plan → Execute → Track)
1. Set goal = gain/lose và activity_level trong `Profile`.  
2. Nhận `exercise roadmap` (Profile/Hôm nay).  
3. Thực hiện lộ trình → tick task trong `Nhật ký` / `Profile` (hoặc addActivity).  
4. Ghi `Tiến trình` hàng tuần; dùng `Coach` để tối ưu plan.  
5. Review `Insights` monthly để điều chỉnh chiến lược.

### Behavioural/Coach-first
1. Thiết lập profile + bật reminders.  
2. Dùng `Coach` để đặt câu hỏi/ngay khi có urge (emotional triggers).  
3. Ghi nhật ký hàng ngày, nhận nudges & insights.  
4. Tuần: follow-up với Coach, set small targets.

### Premium/Clinical
1. Onboard + upgrade subscription.  
2. Dùng `Coach` premium để lấy plan chuyên sâu.  
3. Liên tục record `Tiến trình` và gửi dữ liệu cho clinician/export.

---

## **Checklist E2E đề xuất (kiểm thử cho release)**
- Hôm nay: fetch data mount -> hiển thị đúng total calo, target, net.  
- Scan -> parse -> allow edit -> save -> appears in `Nhật ký`.  
- Quick-log: saved meal -> log into chosen meal -> reflected in `Nhật ký` and `Hôm nay`.  
- Activity: add activity -> affect net calories -> reflect in `Hôm nay`.  
- Tiến trình: submit body progress -> reflected in trend & `Insights`.  
- Coach: send question -> backend returns answer (test with premium gating).  
- Subscription flow: change tier -> UI updates available features.  
- Reminder prefs: enable/disable -> verify push scheduling (platform tests).

---

File đã lưu: docs/app-flow-by-tab.md

Nếu muốn, tôi có thể:
- chạy `npm run dev` trong `apps/mobile` để mở Expo và kiểm tra giao diện; hoặc
- chuyển sang tạo checklist E2E script (Cypress/Detox) cho các flows ưu tiên.

