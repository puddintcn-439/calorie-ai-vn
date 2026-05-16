# User Segment E2E Test Matrix

## Overview
Map 10 user segments → current app features + gaps + test scenarios

---

## 1️⃣ Người muốn giảm cân (Weight loss seekers) — 40% market

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Don't know intake, motivation drops, need visual progress |
| **Key Features** | Photo scan, streak, dashboard insights, AI coach |
| **Current App Support** | ✅ Scan, ✅ Dashboard, ✅ Streak, ✅ Body progress, ⚠️ Coach (partial) |
| **Gaps** | ❌ Meal plans, ❌ Advanced insights, ❌ Emotional support |

### E2E Test Scenario 1.1: "Scan → Log → See Progress"
```
1. User opens app → logs in
2. Sees empty dashboard (new user)
3. Taps "📸 Scan" → takes food photo
4. AI recognizes food, estimates calories
5. Confirms and logs to "Bữa sáng"
6. Returns to dashboard → sees updated totals
7. Checks body progress section → sees trend
8. Validates streak counter incremented
✅ Goal: User feels sense of progress
```

### E2E Test Scenario 1.2: "Daily deficit tracking"
```
1. User logs multiple meals across day (breakfast, lunch, dinner, snacks)
2. Dashboard shows cumulative calories vs target
3. "Remaining calories" visual updates correctly
4. At end of day, sees "On track" / "Over target" message
5. Body progress data syncs (optional daily weigh-in)
✅ Goal: User sees compounding progress
```

---

## 2️⃣ Gym / Fitness users — 20% market

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Protein tracking, macro split confusion, bulk/cut cycles |
| **Key Features** | Macro breakdown, protein alerts, workout logging |
| **Current App Support** | ⚠️ Activity logs show calories, ⚠️ Macros visible, ❌ Workout library |
| **Gaps** | ❌ Macro targets per meal, ❌ Protein alerts, ❌ Workout templates |

### E2E Test Scenario 2.1: "Log workout + verify calorie burn"
```
1. User logs to "Hoạt động" section (e.g., "Gym 60 min")
2. App estimates calories burned (MET-based)
3. Dashboard shows: Net calories = Intake - Burn
4. User sees macros for logged meals (P/C/F breakdown)
❌ Gap: No workout template library, macro targets not shown
✅ Partial success: Burn calculation works
```

### E2E Test Scenario 2.2: "Multi-day tracking for bulk/cut"
```
1. User logs 3 days of meals + workouts
2. View weekly insights (not yet implemented)
❌ Gap: No weekly macro averaging, no trend analysis
```

---

## 3️⃣ Người muốn đẹp dáng / Body aesthetics — 30% market

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Visual proof needed, emotional motivation, before/after obsession |
| **Key Features** | Body progress photos, waist measurement, AI body analysis |
| **Current App Support** | ✅ Body progress (photo + weight), ⚠️ Basic UI, ❌ Waist tracking |
| **Gaps** | ❌ Waist/chest/arm tracking, ❌ AI shape insights, ❌ "Summer body" planning |

### E2E Test Scenario 3.1: "Capture body progress photo"
```
1. User navigates to "Tiến trình" (Progress)
2. Taps "+" to add today's body photo + weight
3. Photo uploads and date is recorded
4. Returns to timeline → sees previous photos
5. Can compare before/after side-by-side
✅ Works: Photo capture + history visible
❌ Gap: No waist/measurement tracking, no AI analysis
```

---

## 4️⃣ Emotional eaters — 15% market (HIGH RETENTION)

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Stress/mood triggers eating, shame, no support |
| **Key Features** | Mood tracking, AI companion, non-judgmental coaching, late-night help |
| **Current App Support** | ⚠️ Coach exists (partial), ❌ Mood logging, ❌ Craving detection |
| **Gaps** | ❌ Mood + food journal, ❌ Emotional intervention, ❌ Check-in reminders |

### E2E Test Scenario 4.1: "Binge eating support flow"
```
1. User at 11 PM feels urge to order food
2. Taps "Chat with Coach"
3. AI asks: "What's going on? Stress? Bored?"
4. Provides alternatives: water, walk, journaling
❌ Gap: Coach not fully interactive, no mood logging, no crisis intervention
```

---

## 5️⃣ Người có bệnh lý / Health conditions — 8% market (PREMIUM SEGMENT)

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Generic app doesn't help, need disease-specific guidance |
| **Key Features** | Diabetes guidance, PCOS macros, gout food warnings |
| **Current App Support** | ❌ No health condition profiles, ❌ No warnings system |
| **Gaps** | ❌ Health intake form, ❌ Personalized restrictions, ❌ Alerts for red foods |

### E2E Test Scenario 5.1: "Diabetic user glucose awareness"
```
❌ Not yet supported: User selects "Tiểu đường" in profile
❌ App should then: Highlight carbs, flag sugar, suggest timing
```

---

## 6️⃣ Busy professionals — 12% market

| Dimension | Details |
|-----------|---------|
| **Core Pain** | No time to track, eat out constantly, work stress |
| **Key Features** | Quick meal search, restaurant menus, batch logging |
| **Current App Support** | ✅ Voice logging (partial), ⚠️ Quick add, ❌ Restaurant DB |
| **Gaps** | ❌ Restaurant menu API, ❌ Quick search by cuisine, ❌ Meal suggestions |

### E2E Test Scenario 6.1: "Quick lunch decision at restaurant"
```
1. User at Starbucks, needs quick choice
2. Taps 📸 or text: "Starbucks sandwich"
3. AI returns: options with calories + macro splits
4. User selects, logs
❌ Gap: No restaurant menu integration, need offline fallback
✅ Current workaround: Scan or text query works partially
```

---

## 7️⃣ Người ăn ngoài rất nhiều — 18% market

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Restaurant portions unpredictable, calories vary |
| **Key Features** | Restaurant AI, portion estimation, brand tracking |
| **Current App Support** | ✅ Photo scan (works for restaurant food), ⚠️ Manual corrections |
| **Gaps** | ❌ Restaurant menu DB, ❌ Brand history, ❌ Portion size visual guide |

### E2E Test Scenario 7.1: "Fast food order → estimate portion"
```
1. User at McDonald's, takes photo of meal
2. AI recognizes items (burger, fries, drink)
3. Estimates calories based on portion visibility
4. User adjusts if needed
✅ Partially works: Scan recognizes, manual adjust available
❌ Gap: No "McDonald's preset" saved meals yet
```

---

## 8️⃣ Grocery shoppers — 10% market

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Nutrition labels confusing, don't know what's healthy |
| **Key Features** | Barcode scan, health score, product comparison |
| **Current App Support** | ✅ Barcode lookup exists with local DB first and Open Food Facts fallback |
| **Gaps** | ⚠️ Needs staging coverage validation, health score formula, and sugar/sodium alerts |

### E2E Test Scenario 8.1: "Barcode scan in supermarket"
```
1. User stands in cereal aisle, scans barcode
2. App returns: product info + health rating
✅ Implemented baseline: local barcode lookup + Open Food Facts fallback. Next validation: packaged-food coverage and serving-size QA.
```

---

## 9️⃣ Biohacker / Longevity — 3% market (PREMIUM)

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Need advanced metrics, personalized optimization |
| **Key Features** | Glucose tracking, HRV sync, supplement logging |
| **Current App Support** | ❌ No wearable integration, ❌ No supplement logging |
| **Gaps** | ❌ Wearable API (Oura, Withings), ❌ Supplement DB |

---

## 🔟 Beginner users (Mass market!) — 50% user base

| Dimension | Details |
|-----------|---------|
| **Core Pain** | Overwhelmed by terms, too technical, will uninstall if complex |
| **Key Features** | Simple onboarding, conversational AI, visual-first design |
| **Current App Support** | ⚠️ Onboarding exists (basic), ✅ Visual scan, ⚠️ Coach (partial) |
| **Gaps** | ❌ Friendly onboarding, ❌ Beginner tips, ❌ Progress celebration |

### E2E Test Scenario 10.1: "First time user journey"
```
1. New user installs → sees onboarding
2. Inputs: age, height, weight, goal, activity level
3. App explains: "Daily target: 1800 kcal. Scan food or type to log."
4. First scan → celebrates result
5. Next day → encouragement message
✅ Current state: Basic onboarding works
❌ Gap: No celebration/encouragement tone, no beginner tips
```

---

## 📊 Feature Coverage Matrix

| Segment | Scan | Log Activity | Dashboard | Body Progress | Coach | Roadmap | Need Next |
|---------|------|--------------|-----------|----------------|-------|---------|-----------|
| 1. Weight Loss | ✅✅ | ✅ | ✅✅ | ✅✅ | ✅ | ✅ | Meal plans |
| 2. Gym User | ✅ | ✅✅ | ⚠️ | ⚠️ | ❌ | ✅ | Macro targets |
| 3. Aesthetics | ✅ | ✅ | ✅ | ✅✅ | ⚠️ | ✅ | Waist tracking |
| 4. Emotional Eater | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Mood logging |
| 5. Health Conditions | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | Health profile |
| 6. Busy Pro | ✅✅ | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | Quick search |
| 7. Eat Out Much | ✅✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | Restaurant DB |
| 8. Grocery Shopper | ✅ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | Barcode API |
| 9. Biohacker | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | Wearable sync |
| 10. Beginner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Encouragement |

---

## 🎯 High Priority Features (Next 4 Weeks)

### Tier 1 — Ship first (covers 60% user value)
1. **Beginner Onboarding Polish** — friendly tone, progress celebration
2. **Meal Planning** — "tối nay còn X kcal, ăn gì?" suggestions
3. **Weekly Insights** — macro trends, adherence, pattern detection
4. **Workout Library** — preset routines + macro adjustments for gym users

### Tier 2 — Next sprint (covers 20% user value)
5. **Mood + Food Journal** — connect emotions to eating patterns (emotional eaters)
6. **Restaurant Menu Integration** — quick lookup by cuisine/brand
7. **Waist + Measurement Tracking** — body aesthetics segment
8. **Macro Split Guidance** — beginner-friendly P/C/F explainer

### Tier 3 — Premium / Later
9. **Health Condition Profiles** — diabetes, PCOS, gout templates
10. **Barcode Integration** — Open Food Facts API
11. **Wearable Sync** — Oura, Withings
12. **Supplement DB** — longevity users

---

## 🚀 E2E Test Execution Plan

### Test Environment
- Device: Web app localhost:19006
- User: Test account logged in
- Data: Fresh daily reset

### Test Scenarios to Execute (Today)
1. ✅ Scenario 1.1 — Weight loss scan → log → progress
2. ✅ Scenario 3.1 — Body progress photo capture
3. ⚠️ Scenario 6.1 — Quick restaurant search
4. ✅ Scenario 10.1 — Beginner onboarding

### Expected Gaps Found
- [ ] No meal suggestions (Tier 1)
- [ ] No weekly insights (Tier 1)
- [ ] No workout templates (Tier 1)
- [ ] No mood tracking (Tier 2)
- [ ] No restaurant menu DB (Tier 2)
- [ ] No waist tracking (Tier 2)

