***Explanation: replace file with cleaned & safety-improved spec***

# AI Calorie / Fitness — Product Spec (cleaned & safety-improved)

**Version:** 1.1  
**Last updated:** 2026-05-13

Tài liệu này là phiên bản cập nhật, gom nội dung từ `Build md file caculator.txt` và `caculatorApp.txt` rồi thêm các cảnh báo, ràng buộc an toàn, và hướng dẫn kiểm thử.

---

## 1. Mục tiêu ngắn gọn
- Hỗ trợ người dùng: giảm cân, tăng cân, giữ cân, tăng cơ.  
- Công cụ: AI food logging (detect → map → DB), adaptive calorie targets, habit tracking, coaching.

---

## 2. Công thức lõi (đơn vị: kg, cm, tuổi, kcal)

### 2.1 BMR (Mifflin–St Jeor)

$$
BMR = 10\\times W + 6.25\\times H - 5\\times A + s
$$

- $W$ = trọng lượng (kg)  
- $H$ = chiều cao (cm)  
- $A$ = tuổi (years)  
- $s = +5$ (male) hoặc $s = -161$ (female)

**Optional (nếu có body fat%) — Katch–McArdle**

$$
LBM = W\\times (1 - \\frac{body\\_fat\\_pct}{100})
\\\\
BMR = 370 + 21.6 \\times LBM
$$

> Khuyến nghị: nếu user cung cấp body fat %, ưu tiên Katch–McArdle để tăng độ chính xác.

---

### 2.2 Activity multiplier
| Activity level | Multiplier |
|---|---:|
| Sedentary | 1.2 |
| Light | 1.375 |
| Moderate | 1.55 |
| Heavy | 1.725 |
| Athlete | 1.9 |

---

### 2.3 TDEE (Total Daily Energy Expenditure)

$$
TDEE = BMR \\times ActivityMultiplier
$$

---

### 2.4 Goal calories (safe defaults)

- Fat loss (cut): $\\Delta = -300\\text{ to }-700\\ \\text{kcal/day}$ (nominal).  
- Muscle gain (bulk): $\\Delta = +200\\text{ to }+500\\ \\text{kcal/day}$.  
- Maintain: $\\Delta = 0$.

**Ràng buộc an toàn (clamp / floor):**
- Không cho GoalCalories xuống quá thấp. Ví dụ:

```text
min_allowed = max( floor_by_sex, round(BMR * 1.1) )
# example floor_by_sex = 1200 (female), 1500 (male)
GoalCalories = max( TDEE + Delta, min_allowed )
```

- Ngoài ra giới hạn deficit theo tỷ lệ: không quá 20% của TDEE (hoặc một rule tương đương). Ví dụ: `Delta >= -0.20 * TDEE`.

> Lý do: tránh target quá thấp gây hại, và scale theo BMR/TDEE thay vì dùng các giá trị cố định.

---

## 3. Weight prediction (approximation)

- Thông thường dùng xấp xỉ: $7700\\ \text{kcal} \\approx 1\\ \text{kg fat}$. Đây là ước lượng thô.

**Dự đoán thay đổi cân theo calorie delta**

$$
PredictedWeightChange\\_kg = \\frac{CalorieDelta}{7700}
$$

- $CalorieDelta$ = (ngày hôm đó) surplus/deficit tích lũy theo thời gian (kcal).
- Ghi chú: 7700 là approximation; composition (cơ vs mỡ vs nước) thay đổi theo cá nhân.

**Ví dụ**: 500 kcal deficit/day → khoảng $0.45\\ \text{kg/week}$.

---

## 4. Adaptive metabolism (weekly update)

Mục tiêu: ước lượng TDEE thực tế dựa trên dữ liệu quan sát (calories ăn, weight trend).

**Công thức ước lượng (tuần):**

$$
ActualTDEE \\approx AvgCalories - \\frac{7700 \\times WeeklyWeightChange}{7}
$$

- $AvgCalories$ = trung bình calories tiêu thụ/ngày trong window (ví dụ 7 ngày).  
- $WeeklyWeightChange$ = kg/week (có dấu). *Lưu ý về dấu*: nếu user **giảm cân** thì $WeeklyWeightChange < 0$; ví dụ $-0.5$ kg/week.

**Ví dụ**
- Nếu ăn $2000$ kcal/day và $WeeklyWeightChange = -0.5$ kg/week, thì

$$
ActualTDEE \\approx 2000 - \\frac{7700\\times(-0.5)}{7} = 2000 + 550 = 2550\\ \\text{kcal/day}
$$

**Smoothing & stability recommendations**
- Không update target chỉ dựa trên 1 tuần duy nhất → dùng EMA hoặc window 2–3 tuần.  
- Giới hạn thay đổi target mỗi tuần (ví dụ ±100–200 kcal/week) để tránh dao động do nhiễu.  
- Khi tính $AvgCalories$, tách calories từ workouts nếu bạn muốn estimate BMR/TDEE (tránh double-counting).

**Implementation note**: áp dụng clamp an toàn (Section 2.4) sau khi tính lại.

---

## 5. Steps → calories & exercise

- Estimation thô: $Calories_{steps} \\approx Steps \\times 0.04$ (xấp xỉ dùng cho 70kg).  
- Scale theo cân nặng để chính xác hơn:

$$
Calories_{steps} \\approx Steps \\times 0.04 \\times \\frac{weight\\_kg}{70}
$$

- Khi có workout (type + duration), dùng MET table hoặc backend exercise table để tính calories burned dựa trên weight & duration.

---

## 6. Protein / Macros guidance

- Protein targets:
  - Cut / fat loss: $1.6\\! -\\! 2.4\\ \\mathrm{g} / \\mathrm{kg\\ bodyweight}$
  - Build / bulk: $1.6\\! -\\! 2.2\\ \\mathrm{g} / \\mathrm{kg}$
- Carbs/Fat: allocate remaining calories according to user preference and activity level.  
- Đảm bảo minimal protein khi cut để bảo vệ cơ.

---

## 7. Bulk vs Gain expectations
- Lưu ý: surplus không đồng nghĩa tăng 100% là cơ. Đối với lean gains, tỉ lệ gain cơ phụ thuộc training, protein, sleep.  
- Khuyến nghị: small surplus (200–300 kcal) + progressive overload để tối đa hóa phần gain cơ.

---

## 8. AI food logging architecture (safety rules)

Flow: AI detect → map to nutrition DB → show top matches + confidence → user confirm → save.

**Important**
- Không để AI trực tiếp gán calories. AI chỉ cung cấp candidate names/portions/confidence.  

### 8.1 Portion precision UX

- Mọi món đã ghi phải có `quantity` và `estimated_grams`; giao diện hiển thị rõ khối lượng mỗi phần và tổng khối lượng.
- Thành phần `PortionInput` được dùng chung cho sửa Nhật ký, kết quả AI và tìm món:
  - nhập trực tiếp gram/ml;
  - bước tăng/giảm 10 g;
  - gợi ý nhanh 50 g, 100 g, 1 tô và 1 cái;
  - vùng chạm tối thiểu 44 dp, bố cục theo lưới 8 pt.
- Khi người dùng đổi khẩu phần, calories và macro được scale từ giá trị gốc theo tổng khối lượng mới. Không gọi AI lại chỉ để đổi gram.
- Text/voice nhận diện các mẫu phổ biến như `200g`, `1 tô`, `1 cái`, `1 ly`. Nếu mô tả không có khẩu phần, ứng dụng yêu cầu người dùng xác nhận trước khi lưu.
- Khẩu phần AI luôn là ước tính có thể chỉnh sửa; UI không trình bày con số như một phép đo tuyệt đối.
- Lưu `confidence` và cho người dùng sửa trước khi lưu.  
- Cache common meals and provide nearest DB lookup with fuzzy matching.

**Fields to store**
- detected_name, mapped_food_id, grams, calories, confidence_score, source (image/text/voice), ai_version, timestamp

---

## 9. Safety & edge cases
- Clamp GoalCalories (see 2.4).  
- Minimum input validation: age >= 13 (example), height/weight in sane ranges.  
- Handle missing data: if age/gender unknown, use conservative defaults and force user to complete onboarding.
- Android/notification notes (persisted channels) — unrelated to calorie engine but keep in docs.

---

## 10. Testing checklist (unit + e2e)
- Unit tests for: BMR (Mifflin + Katch), TDEE calc, Goal clamp, ActualTDEE, PredictedWeightChange.  
- Integration tests: scan → map → DB → save → reflected in `daily log` and `dashboard`.  
- E2E scenarios: beginner onboarding, quick-log flow, weekly adaptive update with synthetic weight trend.

---

## 11. Example snippets

Clamping & weekly-update pseudocode:

```ts
const minAllowed = Math.max(sex === 'female' ? 1200 : 1500, Math.round(BMR * 1.1));
const proposed = TDEE + delta; // delta from user goal
const clamped = Math.max(proposed, minAllowed);
// apply weekly smoothing
const nextTarget = previousTarget + clamp(clamped - previousTarget, -150, 150);
```

Adaptive TDEE estimate (weekly):

```text
ActualTDEE = AvgCalories - (7700 * WeeklyWeightChange / 7)
// then apply smoothing + clamp
```

---

## 12. Next steps
- (Action) Review and confirm these edits; nếu OK tôi sẽ: commit + push + tạo PR.  
- (Optional) Tạo unit tests templates cho core formulas.

---

**Notes**: mọi công thức là ước lượng, cần test trên cohort thực tế và chỉnh thông số (clamp, caps, smoothing) theo dữ liệu thu thập được để tránh overfitting trên noise.

## Goal Progress

---

## Predicted Goal Date

Example:

```text
Estimated goal date:
Aug 15
```

---

# 9. AI Coach (Retention Feature)

This is one of the strongest retention systems.

---

## Example Messages

```text
“You are plateauing this week.”
```

```text
“Protein intake is low this week.”
```

```text
“You ate out more during weekends.”
```

---

# 10. Habit / Streak System

Features:

* Daily logging streak
* Weekly consistency
* Achievement system
* Progress milestones

---

# 11. Notifications

Examples:

```text
“You still have 400 calories left today.”
```

```text
“Don’t forget to log dinner 😄”
```

---

# 12. Premium Features

## Free Plan

* Manual logging
* Limited AI scans
* Basic dashboard

---

## Premium Plan

* Unlimited AI scans
* AI coaching
* Adaptive calories
* Meal planning
* Advanced analytics

---

# 13. Recommended Tech Stack

| Layer    | Stack                 |
| -------- | --------------------- |
| Mobile   | React Native + Expo   |
| Backend  | Node.js + NestJS      |
| Database | PostgreSQL / Supabase |
| AI       | Gemini 2.5 Flash      |
| Cache    | Redis                 |
| Queue    | BullMQ                |
| Search   | Meilisearch           |
| Storage  | Supabase Storage      |

---

# 14. Cost Optimization

## Resize Images Before Upload

```text
Max width: 768px
```

---

## Compress Images

Use:

* WebP
* JPEG compression

---

## Cache Common Meals

Examples:

* White rice
* Pho
* Bun Bo Hue

---

## AI Routing

Simple meals:

```text
Gemini Flash Lite
```

Complex meals:

```text
Gemini Flash
```

---

# 15. Most Important Metrics

NOT:

```text
AI accuracy
```

BUT:

| Metric          | Why Important   |
| --------------- | --------------- |
| D1 Retention    | Users come back |
| D7 Retention    | Habit formation |
| Scans/day       | Engagement      |
| Paid Conversion | Revenue         |
| Streak Length   | User addiction  |

---

# 16. Product Roadmap

## V1

* AI scan
* Calorie tracking
* Goal calories

---

## V2

* Adaptive TDEE
* AI coaching

---

## V3

* Meal recommendations
* Community/social
* Wearable sync

---

# Final Insight

This is NOT just:

```text
a food recognition app
```

It is:

```text
a behavior change system
```

If users:

* log daily
* see progress
* feel understood

then:

* retention increases
* paid conversion improves
* long-term growth becomes possible

---

## Đánh giá hướng phát triển ứng dụng

- **Tổng quan:** Hướng đi đúng — không chỉ là nhận diện ảnh mà là hệ thống thay đổi hành vi người dùng.
- **Ưu điểm:** Tập trung vào retention qua AI coach, habit loops, và cá nhân hoá; có mô hình doanh thu rõ (premium scans, coaching).
- **Rủi ro chính:** Sai số calorie nếu AI tự tính; chi phí xử lý ảnh/AI cao; tích hợp Health APIs phức tạp; vấn đề bảo mật và pháp lý y tế.
- **MVP khuyến nghị:** Triển khai onboarding, calorie engine (Mifflin + activity multiplier), manual logging + giới hạn AI scans, weight logs, dashboard, thông báo cơ bản.
- **Kỹ thuật:** Giữ AI chỉ nhận diện; mọi phép tính calo do nutrition DB thực hiện; cache meals phổ biến; route AI (lite vs full) để tối ưu chi phí.
- **KPIs ưu tiên:** D1/D7 retention, scans/day, paid conversion, weekly weight trend accuracy.
- **Tối ưu chi phí:** Resize/compress ảnh client-side; cache common meals; phân tầng AI routing.
- **Lộ trình ngắn hạn (3 tháng):** Xây MVP core → pilot ~100 người → đo lường retention và weight trend → iterate coach messages.
- **Bước tiếp theo (ngay):** Xác nhận schema DB (foods/meals/weight_logs), chuẩn hoá API cho logging, chuẩn bị instrumentation analytics, và thiết lập pilot user recruitment.

---

# AI Fitness / Calorie App — Complete Formula Collection

# 1. Basal Metabolic Rate (BMR)

## Mifflin-St Jeor Formula

### Male

```text
BMR = (10 × weight_kg)
    + (6.25 × height_cm)
    - (5 × age)
    + 5
```

---

### Female

```text
BMR = (10 × weight_kg)
    + (6.25 × height_cm)
    - (5 × age)
    - 161
```

---

# 2. Total Daily Energy Expenditure (TDEE)

```text
TDEE = BMR × ActivityMultiplier
```

---

## Activity Multipliers

| Activity Level    | Multiplier |
| ----------------- | ---------- |
| Sedentary         | 1.2        |
| Light Exercise    | 1.375      |
| Moderate Exercise | 1.55       |
| Heavy Exercise    | 1.725      |
| Athlete           | 1.9        |

---

# 3. Goal Calories

## Weight Loss

```text
GoalCalories = TDEE - Deficit
```

Recommended deficit:

```text
300–700 kcal/day
```

---

## Weight Gain

```text
GoalCalories = TDEE + Surplus
```

Recommended surplus:

```text
200–500 kcal/day
```

---

## Maintain Weight

```text
GoalCalories = TDEE
```

---

# 4. Weight Change Formula

## Core Rule

```text
7700 kcal ≈ 1kg fat
```

---

## Predicted Weight Change

```text
WeightChangeKg =
TotalCalorieDelta / 7700
```

---

# 5. Daily Deficit / Surplus

```text
DailyCalorieDelta =
CaloriesConsumed - TDEE
```

---

# 6. Weekly Weight Prediction

```text
WeeklyWeightChange =
(DailyCalorieDelta × 7) / 7700
```

---

# Example

```text
500 kcal deficit/day
```

↓

```text
≈ 0.45kg loss/week
```

---

# 7. Goal Timeline Prediction

## Required Calorie Delta

```text
RequiredCalories =
TargetWeightDifference × 7700
```

---

## Estimated Days

```text
EstimatedDays =
RequiredCalories / DailyDeficit
```

---

# Example

```text
Need to lose:
10kg
```

↓

```text
10 × 7700
= 77000 kcal
```

If:

```text
500 kcal deficit/day
```

↓

```text
≈ 154 days
```

---

# 8. Adaptive TDEE Formula

## Weekly Recalculation

```text
ActualTDEE =
AverageCaloriesConsumed
- (7700 × WeeklyWeightChange / 7)
```

---

# Example

User:

```text
eats 2000 kcal/day
```

Weight trend:

```text
loses 0.5kg/week
```

↓

```text
ActualTDEE ≈ 2550
```

---

# 9. Body Mass Index (BMI)

```text
BMI =
weight_kg / (height_m × height_m)
```

---

## BMI Classification

| BMI       | Classification |
| --------- | -------------- |
| <18.5     | Underweight    |
| 18.5–24.9 | Normal         |
| 25–29.9   | Overweight     |
| 30+       | Obese          |

---

# 10. Protein Target

## Fat Loss

```text
Protein =
1.6–2.2g × bodyweight_kg
```

---

## Muscle Gain

```text
Protein =
1.8–2.4g × bodyweight_kg
```

---

# 11. Fat Intake Target

```text
Fat =
0.6–1g × bodyweight_kg
```

---

# 12. Carbs Formula

```text
CarbsCalories =
RemainingCalories
```

```text
CarbsGrams =
CarbsCalories / 4
```

---

# 13. Macro Calories

| Macro   | Calories per gram |
| ------- | ----------------- |
| Protein | 4 kcal            |
| Carbs   | 4 kcal            |
| Fat     | 9 kcal            |

---

# 14. Lean Body Mass (LBM)

```text
LBM =
Weight × (1 - BodyFat%)
```

---

# Example

```text
80kg
20% body fat
```

↓

```text
LBM = 64kg
```

---

# 15. Water Intake Recommendation

## Basic Formula

```text
WaterML =
WeightKg × 35
```

---

# Example

```text
70kg
```

↓

```text
≈ 2450ml/day
```

---

# 16. Steps → Calories Burned

## Simple Approximation

```text
CaloriesBurned =
Steps × 0.04
```

---

# Example

```text
10000 steps
```

↓

```text
≈ 400 kcal
```

---

# 17. Running Calories

```text
CaloriesBurned =
DistanceKm × WeightKg × 1.036
```

---

# Example

```text
5km
70kg
```

↓

```text
≈ 362 kcal
```

---

# 18. Body Fat Estimate (US Navy Method)

## Male

```text
BodyFat =
86.010 × log10(waist - neck)
- 70.041 × log10(height)
 + 36.76
```

---

## Female

```text
BodyFat =
163.205 × log10(waist + hip - neck)
- 97.684 × log10(height)
- 78.387
```

---

# 19. Muscle Gain Recommendation

## Lean Bulk Speed

```text
0.25–0.5kg/month
```

---

# 20. Safe Fat Loss Recommendation

```text
0.5–1% bodyweight/week
```

---

# 21. Daily Remaining Calories

```text
RemainingCalories =
GoalCalories - ConsumedCalories
```

---

# 22. Macro Progress Formula

## Protein Progress

```text
ProteinProgress =
ProteinConsumed / ProteinTarget
```

---

# 23. Weight Trend Smoothing

## 7-day moving average

```text
TrendWeight =
Sum(last_7_days_weight) / 7
```

---

# 24. Consistency Score

## Example Formula

```text
Consistency =
DaysLogged / TotalDays
```

---

# 25. Streak Formula

```text
CurrentStreak =
ConsecutiveDaysLogged
```

---

# 26. Meal Calories Formula

```text
MealCalories =
(serving_grams / 100)
× calories_per_100g
```

---

# Example

```text
250g rice
130 kcal/100g
```

↓

```text
325 kcal
```

---

# 27. AI Confidence Score

## Suggested Logic

```text
Confidence =
ModelConfidence × PortionConfidence
```

---

# 28. Plateau Detection

## Example Logic

If:

```text
weight change < 0.2kg
for 14 days
```

↓

```text
Trigger plateau warning
```

---

# 29. Smart Calorie Adjustment

## Plateau Adjustment

```text
NewGoalCalories =
CurrentGoalCalories - 100~150
```

---

# 30. Refeed Recommendation

## Example Logic

If:

```text
Deficit > 500
for > 14 days
```

↓

```text
Recommend maintenance day
```

---

## Đánh giá công thức — tóm tắt ngắn

- **Phù hợp tổng quát:** Các công thức trên là tiêu chuẩn thực tế để dùng trong app và phù hợp cho MVP.
- **Lưu ý chính:**
  - `7700 kcal/kg` là xấp xỉ — thay đổi theo tỷ lệ mỡ/khối cơ và nước.
  - `Steps × 0.04` là xấp xỉ; hệ số phụ thuộc cân nặng, bước dài, tốc độ.
  - Công thức chạy (×1.036) là gần đúng; có thể dùng METs hoặc dữ liệu GPS cho chính xác hơn.
  - US Navy bodyfat cần đơn vị đo rõ (cm) và log10; lưu ý đo sai số cao.
  - Protein/fat ranges là khuyến nghị; cần điều chỉnh cho tuổi, bệnh lý, và mục tiêu.
  - Adaptive TDEE cần smooth (rolling average) để giảm nhiễu cân nặng hàng ngày.
- **Khuyến nghị triển khai:** Lưu tất cả hàm tính ở backend (nutrition engine), ghi source data (grams, sources), và log confidence để audit.

