# Global AI Health Companion Execution Plan

## 1. Why This Document Exists

Muc tieu cua tai lieu nay la chot 3 viec trong cung mot khung:
1. Chot feature hien tai da giai quyet pain nao cho user.
2. Chot gap can hoan thien de tien toi kinh doanh global.
3. Chot backlog coding theo phase de team vao implementation ngay.

Dinh huong tong quat:
- Khong build them mot calorie tracker thong thuong.
- Build AI Health Companion: giam ma sat logging, dong hanh hanh vi an uong, tao retention dai han.

## 2. Current Product Status vs Real User Pains

### 2.1 Pain Da Giai Quyet Tot

1. "Toi khong biet minh an bao nhieu"
- Da co image scan, text scan, barcode, refine ket qua.
- Da co luu log tu dong vao nhat ky ngay.
- Tac dong: giam nhu cau nhap tay va tim serving cong.

2. "Track calo qua met nen toi bo"
- Da co multi-mode logging (camera/gallery/text/barcode/search).
- Da co sua ten mon, sua portion, xoa item truoc khi luu.
- Tac dong: giam friction va giam bo app som.

3. "Toi khong biet nen an gi"
- Da co recommendation va weekly adjustment co the hien thi tren dashboard.
- Da co meal plan theo ngay trong tuan.

4. "Toi muon thay progress"
- Da co dashboard net calories, macro, streak, badges, weekly insights.

5. "Toi tap nhung khong thay ket qua"
- Da co weekly insight, trend tuan, phan bo macro va meal-level summary.

### 2.2 Pain Moi Giai Quyet Mot Phan

1. Emotional eating va behavioral coaching
- Da co AI coach va reminder.
- Chua co detection pattern binge/stress theo gio va can thiep chu dong.

2. Shopping intelligence
- Da co barcode lookup va nutrition parse.
- Chua co health score mua hang, alternatives theo budget, recommendation theo chuoi cua hang.

3. Activity sync
- Da co flow sync.
- Du lieu van o muc estimated/demo, chua la native integration day du.

### 2.3 Pain Chua Giai Quyet Day Du

1. Voice logging (noi la log)
2. Receipt scan va auto-parse bill
3. Body progress AI (before/after, vong eo uoc luong)
4. Biomarker intelligence (glucose, blood test impact)
5. Global culture adaptation (khong chi Vietnam-first prompts)

## 3. Business Direction to Scale Globally

## 3.1 Product Positioning

Vi tri san pham:
- "AI layer cho hanh vi an uong va suc khoe hang ngay"
Khong phai:
- "App tinh calo co them AI"

Value proposition:
- User mua su tien loi, dong luc va consistency.
- User khong mua LLM complexity.

## 3.2 Core Moat

1. Behavioral memory
- Nho pattern an uong theo ngu canh thoi gian.

2. Retention engine
- Daily loop + micro-win + smart nudge dung luc.

3. Global food graph
- Food ontology da van hoa + estimation portions theo vung.

4. Intervention quality
- Khong chi tra loi dung, ma tra loi dung luc, dung context.

## 3.3 Monetization Priorities

Tier 1 (som co doanh thu):
- Subscription Premium AI Coach (10-30 USD/thang)
- Personalized meal guidance

Tier 2 (retention + viral):
- Progress visualization
- Story-like weekly recap

Tier 3 (unit economics manh):
- Affiliate healthy food/supplements
- B2B wellness partnerships

## 4. Product Architecture Priorities

## 4.1 North Star Metric

North Star:
- Weekly active loggers with >= 5 logging events/week

Guardrail metrics:
- D1, D7, D30 retention
- Time-to-log median <= 10s
- Weekly coaching engagement rate
- % users with >= 1 streak in 14 days

## 4.2 Global Product Pillars

1. Frictionless Logging
- Image, text, voice, barcode, receipt in one consistent flow.

2. Behavioral Coaching
- Detect pattern, intervene dung luc, support khong phan xet.

3. Personalized Guidance
- Theo goal + benh ly + budget + culture.

4. Progress Confidence
- User nhin thay tien bo ro rang de tiep tuc.

## 5. Coding Roadmap (Execution-First)

## Phase 0 (0-2 tuan): Stabilize and Measure

Backend:
- Chuan hoa schema optional tables, bo fallback dev-only khi migration da co.
- Chot telemetry schema cho: logging friction, coach usage, reminder response.
- Them idempotency va retry policy cho AI scan va coach.

Mobile:
- Chot event tracking funnel: open app -> log attempt -> log success.
- Chuan hoa error UX (khong do man hinh, co guidance ro rang).

QA:
- Them smoke suite cho login, scan, recommendations, reminders, subscriptions.

Exit criteria:
- Khong con 500 tren cac endpoint core.
- Dung thu metric friction logging end-to-end.

## Phase 1 (2-6 tuan): Kill Logging Friction

Backend:
- Them endpoint voice-log parse.
- Them endpoint receipt OCR parse -> candidate food items.
- Improve portion estimation confidence score + correction learning loop.

Mobile:
- Voice input button ngay tren scan screen.
- Receipt capture mode.
- One-tap quick add tu ket qua AI.

Data/AI:
- Prompt strategy cho global dish inference (khong hard-code Vietnam-first).
- Region-aware food alias mapping.

Exit criteria:
- Median log time <= 8s.
- >= 60% logs duoc tao tu AI-assisted flow.

## Phase 2 (6-12 tuan): Build Behavioral Moat

Backend:
- Pattern service: detect late-night overeating, streak break risk, protein deficiency risk.
- Intervention engine: trigger nudge by risk state.

Mobile:
- Coach timeline (daily brief, risk alert, recovery plan after overeating).
- Weekly behavior recap card.

Data/AI:
- User health memory store (window 30/60/90 ngay).
- Feedback loop quality score (was intervention useful?).

Exit criteria:
- D7 retention tang it nhat 20% so voi baseline.
- Coach interaction to next-day logging lift > 10%.

## Phase 3 (12-24 tuan): Global Intelligence and Revenue Expansion

Backend:
- Global food ontology service.
- Multi-region nutrition normalization.

Mobile:
- Region/language packs.
- Market-specific recommendation surfaces.

Business:
- Premium coach packages theo segment.
- Affiliate pipeline cho grocery/supplements.

Exit criteria:
- Product fit tai >= 2 region ngoai VN.
- Subscription conversion on activated users >= 8%.

## 6. Priority Backlog (Ready for Coding)

### P0 (Ship Immediately)

1. Voice logging API + mobile client
2. Receipt scan API + mobile capture UI
3. Structured behavior telemetry events
4. Error boundary and retry UX for scan/coach
5. TS config migration cleanup for TS6 compatibility warnings

### P1

1. Behavior pattern detector service
2. Smart intervention rules engine
3. Weekly progress storytelling UI
4. Health score for barcode shopping

### P2

1. Global dish ontology and locale inference
2. Biomarker connectors (future-ready abstraction)
3. Advanced coach memory and long-term planning

## 7. Definition of Done for Core User Outcomes

1. "Log in 3-5s"
- DoD: user co the tao log bang image/voice/receipt trong <= 3 taps va <= 10s median.

2. "Know what to eat now"
- DoD: recommendation co context "remaining calories + constraints" va co actionable options.

3. "Feel supported, not judged"
- DoD: coach response quality score >= target, zero toxic language incidents.

4. "See meaningful progress"
- DoD: weekly recap auto-generated, user hieu ro trend va next action.

## 8. Risks and Mitigation

1. AI cost phinh nhanh
- Mitigation: route model by intent, cache, hard budget limits per user/day.

2. Accuracy disputes
- Mitigation: confidence-first UX + fast correction flow + learning from edits.

3. Low retention sau tuan dau
- Mitigation: immediate streak loop + personalized daily brief + behavior-triggered nudges.

4. Over-focus on model quality, under-focus on UX
- Mitigation: every sprint phai co UX friction KPI gate.

## 9. Next Coding Actions (This Week)

1. Create technical specs:
- voice-log contract
- receipt-parse contract
- behavior telemetry schema

2. Split implementation tickets:
- Backend x 6 tickets
- Mobile x 6 tickets
- QA x 4 tickets

3. Start with one measurable objective:
- reduce median time-to-log from current baseline to <= 10s.

---

Owner: Product + Engineering
Last updated: 2026-05-09
Status: Ready for execution
