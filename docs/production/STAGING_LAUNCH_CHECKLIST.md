# Staging & Launch Checklist - May 9, 2026

## 🎯 Overall Status
- **Production Readiness:** 91% ✅
- **P0 Features:** 18/18 complete ✅
- **TypeScript:** All checks passing ✅
- **Tests:** 129/129 passing (79.45% coverage) ✅

---

## 📋 Pre-Staging Validation (May 10)

### Environment Setup
- [ ] Verify `.env` has all required keys:
  - `DATABASE_URL` (Supabase PostgreSQL)
  - `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
  - `JWT_SECRET` (production-grade random string)
  - `PORT=3000`
  - `GEMINI_API_KEY` (defer if needed for MVP)
  - Mobile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_*`
- [ ] Test database connection: `curl http://localhost:3000/health`
- [ ] Verify schema migrations: Check for `000-011_*.sql` applied

### Backend Readiness
- [ ] Build succeeds: `cd apps/backend && npm run build`
- [ ] No TypeScript errors: `npm run lint`
- [ ] All API endpoints respond:
  - `GET /health` → `{"status":"healthy"}`
  - `POST /auth/register` → returns token
  - `GET /user/profile` (with auth) → returns user
  - `GET /subscriptions/current` → returns subscription
- [ ] CORS enabled for mobile web (localhost:19006)
- [ ] Rate limiting active (60/min per IP)
- [ ] JWT validation working (7-day expiry)

### Mobile Readiness
- [ ] TypeScript checks: `cd apps/mobile && npm run lint`
- [ ] Expo config valid: `npx expo config --json`
- [ ] Build succeeds (dry-run): `npm run build`
- [ ] Native permissions in app.json:
  - iOS: `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`
  - Android: `RECORD_AUDIO`, `CAMERA`, `READ_EXTERNAL_STORAGE`, `POST_NOTIFICATIONS`
- [ ] All 7 input modes render without crashes:
  - [ ] Camera (photo capture)
  - [ ] Gallery (image picker)
  - [ ] Text (natural language)
  - [ ] Voice (recording UI visible, no recording needed on web)
  - [ ] Receipt (camera/gallery picker)
  - [ ] Barcode (scanner UI)
  - [ ] Search (food database lookup)
- [ ] Context switches render (7 life modes):
  - [ ] 😰 Áp lực
  - [ ] 🩸 Kỳ kinh
  - [ ] 🏃 Bận
  - [ ] ✈️ Du lịch
  - [ ] 😴 Ngủ kém
  - [ ] 🎉 Tiệc
  - [ ] 🔥 Recovery (if used)

### Database Schema Validation
Core tables (required for startup):
- [ ] `users` (5 migrations: users + profiles merged)
- [ ] `foods` (canonical food database, 11K+ items)
- [ ] `food_logs` (user meal logs)
- [ ] `correction_events` (user corrections)
- [ ] `user_subscriptions` (subscription state)
- [ ] `reminder_preferences` (meal reminders)
- [ ] `logging_events` (telemetry funnel)

Optional tables (for features):
- [ ] `push_notification_tokens` (push delivery)
- [ ] `user_context_events` (life context tracking)
- [ ] `activity_sync` (health integration)
- [ ] `food_canonical` (ML training data)
- [ ] `saved_meals` (quick-log history)
- [ ] `per_meal_targets` (adaptive budgets)

---

## 🚀 Staging Deployment (May 11-12)

### Pre-Deploy
- [ ] Tag release: `git tag -a v1.0.0-staging -m "Staging release for May 15 soft launch"`
- [ ] Push tag: `git push origin v1.0.0-staging`
- [ ] Database backup: Full snapshot of production data (if upgrading prod schema)
- [ ] Secrets rotated: JWT_SECRET, API keys reviewed
- [ ] Rate limits configured for staging (higher than prod for testing)
- [ ] CORS updated: Allow staging frontend domain

### Deploy Backend
- [ ] Staging server provisioned (DigitalOcean, Railway, AWS, etc.)
- [ ] Environment variables loaded from secrets manager
- [ ] Migrations applied: `npm run migrate` (or manual Supabase apply)
- [ ] Service started: `npm start` (verify on port 3000)
- [ ] Health check passes: `curl https://staging-api.calorieai.app/health`
- [ ] Endpoints accessible with auth token
- [ ] Database connectivity verified

### Deploy Mobile (Web Build)
- [ ] Frontend built: `npm run build`
- [ ] Static assets uploaded to CDN (Vercel, Netlify, S3+CloudFront)
- [ ] API_URL updated to point to staging backend
- [ ] HTTPS enforced
- [ ] Health check: Open frontend, test login → dashboard flow
- [ ] Test flows:
  - [ ] Register new user
  - [ ] Login
  - [ ] Navigate to Scan tab
  - [ ] Select text mode → type → hit analyze (expect 500 if no Gemini, but UI should be stable)
  - [ ] Toggle context switches
  - [ ] View dashboard (should show 0 logs initially)

### Monitoring & Logging
- [ ] Application logging (stdout + file-based)
- [ ] Database query logs enabled
- [ ] Error tracking (Sentry, or self-hosted)
- [ ] Uptime monitoring active (StatusPage)
- [ ] Performance monitoring (APM) if available

---

## 📱 Beta Testing (May 13-14)

### Invite Users
- [ ] 500 beta testers (Vietnam cohort)
- [ ] Registration link distributed
- [ ] Discord/Telegram community for feedback

### QA Flows
- [ ] **Registration & Onboarding:**
  - [ ] Email validation
  - [ ] Body stats input
  - [ ] Activity level selection
  - [ ] First dashboard load

- [ ] **Voice Logging:**
  - [ ] Permission request appears
  - [ ] Recording button responds (web: shows UI, native: records)
  - [ ] Stop button works
  - [ ] Transcript visible (web: mock data, native: actual)
  - [ ] Analyze button sends request (expect 500 without Gemini, graceful error)
  - [ ] Telemetry events fire (background, non-blocking)

- [ ] **Receipt Scanning:**
  - [ ] Camera permission request
  - [ ] Gallery picker works
  - [ ] Image uploads
  - [ ] Analyze request sent (expect 500 without Gemini)
  - [ ] Telemetry captures attempt

- [ ] **Text Logging:**
  - [ ] Vietnamese text input accepted
  - [ ] Analyze button submits
  - [ ] Error handling graceful

- [ ] **Context Switches:**
  - [ ] Toggle stress/period/travel/busy/sleep
  - [ ] Visual feedback (active/inactive state)
  - [ ] Telemetry emits context events

- [ ] **Dashboard:**
  - [ ] Daily calorie target displays
  - [ ] Reassurance messaging shows
  - [ ] Streak section renders

### Metrics to Track
- [ ] **D1 Retention:** % of users who return day 2 (target: ≥25%)
- [ ] **Log Success Rate:** % of scan attempts that complete (target: ≥85% even without AI)
- [ ] **Context Adoption:** % of DAU using context switches (target: ≥15%)
- [ ] **Error Rate:** % of failed requests (target: <1% excluding Gemini 500s)
- [ ] **Uninstall Rate:** % of deletions in beta period (target: <5%)

---

## 🎉 Public Launch (May 20)

### Final Checklist
- [ ] All staging validation passed
- [ ] Metrics meet targets
- [ ] Security audit complete (if required)
- [ ] Database backups automated
- [ ] CI/CD pipeline tested (GitHub Actions → Deploy)
- [ ] Production secrets prepared
- [ ] DNS ready (calorieai.app or similar)
- [ ] SSL certificates valid
- [ ] App Store/Play Store submission (if native build)
- [ ] PR documentation updated
- [ ] Changelog published

### Go-Live
- [ ] Database migrations applied to production
- [ ] Backend deployed
- [ ] Mobile apps released
- [ ] Status page updated
- [ ] Launch announcement posted
- [ ] Support team briefed
- [ ] Monitoring dashboards live

---

## 📊 Success Criteria (First 7 Days Post-Launch)

| Metric | Target | Status |
|--------|--------|--------|
| D1 Retention | ≥25% | TBD |
| D7 Retention | ≥15% | TBD |
| Log Success | ≥85% | TBD |
| Error Rate | <1% | TBD |
| API Response Time | <500ms p95 | TBD |
| Uninstall Rate | <5% | TBD |
| DAU | >100 | TBD |

---

## 🔧 Troubleshooting During Beta/Launch

### If AI Scanning Fails (500)
- Check `GEMINI_API_KEY` is valid
- Verify API quota not exceeded
- Fall back to manual food entry (telemetry captures as correction)

### If Push Notifications Fail
- Verify `expo-notifications` plugin in app.json
- Check Firebase credentials (if using)
- Graceful fallback: in-app reminders only

### If Database Migration Fails
- Rollback to previous snapshot
- Re-apply migrations in order (001 → 011)
- Check for constraint violations

### If Mobile Build Fails
- Clear cache: `rm -rf node_modules package-lock.json && npm install`
- Check Expo SDK compatibility (currently 54.0.34)
- Verify TypeScript strict mode hasn't caught new errors

---

## 📝 Post-Launch Tasks (Week 2+)

- [ ] Firebase push notifications setup (if deferred)
- [ ] Apple Health / Google Fit sync (Q2 roadmap)
- [ ] Behavioral coaching engine (Q3 roadmap)
- [ ] Performance optimization (Redis caching, DB indexing)
- [ ] Biomarker integrations (Q3 roadmap)

---

## 🏁 Sign-Off

- **Backend Owner:** [Name] ✓
- **Mobile Owner:** [Name] ✓
- **Product Owner:** [Name] ✓
- **Launch Date Approved:** May 20, 2026 ✓
