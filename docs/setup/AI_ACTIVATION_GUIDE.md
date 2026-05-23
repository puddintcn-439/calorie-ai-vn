# AI Activation Guide - Gemini Integration Setup

**Status:** 🟢 ACTIVE - AI Coach is running  
**Active Model:** `gemini-2.5-flash`  
**Safety:** Quota/rate-limit fallback is enabled to prevent 500 errors

---

## Current Production-Like Setup (Verified)

1. `GEMINI_API_KEY_PRIMARY` (and optional `GEMINI_API_KEY_BACKUP`) are configured in `apps/backend/.env`
2. Backend AI module uses `gemini-2.5-flash`
3. Backend health endpoint returns `200 OK`
4. API E2E passed (`/auth/register -> /auth/login -> /ai/coach`)
5. UI E2E passed on Coach tab: user message rendered and AI response rendered in chat

---

## Quick Start (5 minutes) (For New Environment)

### Step 1: Get Gemini API Key
1. Open [Google AI Studio](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "**Create API Key**" → "Create API key in new project" or "Create API key in existing project"
4. Copy the generated API key

### Step 2: Configure .env
Open `apps/backend/.env` and replace:

```diff
# ===========================
# Gemini AI
# ===========================
GEMINI_API_KEY_PRIMARY=your_actual_api_key_from_step_1
# Optional backup key (recommended):
GEMINI_API_KEY_BACKUP=your_backup_api_key_here
```

**Example:**
```
GEMINI_API_KEY_PRIMARY=your_gemini_api_key_here
GEMINI_API_KEY_BACKUP=your_gemini_api_key_backup_here
```

### Step 3: Restart Backend
```bash
cd apps/backend
npm run dev
```

### Step 4: Test AI Coach
Visit in web app: http://localhost:19006/coach
- Type: "Tôi còn 400 kcal thì nên ăn gì?"
- Expected: AI Coach responds with meal suggestions in chat (NOT "connection error")

---

## AI Features Enabled After Activation

| Feature | Endpoint | Status After Setup |
|---------|----------|-------------------|
| Food Image Scan | `POST /ai/scan/image` | ✅ Enabled |
| Food Text Scan | `POST /ai/scan/text` | ✅ Enabled |
| Voice Transcript | `POST /ai/scan/voice` | ✅ Enabled |
| Receipt Parser | `POST /ai/scan/receipt` | ✅ Enabled |
| Meal Refinement | `POST /ai/scan/refine` | ✅ Enabled |
| **AI Coach Chat** | `POST /ai/coach` | ✅ Enabled |

---

## Verification Steps

### Check 1: API Key Valid
```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR_API_KEY"
```

Should return: `{ models: [...] }`  
Should NOT return: `403 Forbidden` or `API_KEY_INVALID`

### Check 2: Backend Service Running
```bash
curl http://localhost:3000/health
```

Should return: `200 OK`

### Check 3: AI Coach Endpoint
```bash
curl -X POST http://localhost:3000/ai/coach \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "message": "Tôi còn 400 kcal, nên ăn gì?",
    "today_calories": 1400,
    "target_calories": 1800
  }'
```

Expected response:
```json
{
  "message": "Bạn nên ăn một bữa nhẹ nhàng như...",
  "suggestions": []
}
```

### Check 4: UI Coach E2E (Web)
1. Login user account on `http://localhost:19006/login`
2. Open tab `Coach`
3. Send message: `Tôi còn 400 kcal thì nên ăn gì tối nay để no lâu?`
4. Confirm chat shows:
   - A new `Bạn` message
   - A new `Coach` response message (not the offline fallback text)

---

## Troubleshooting

### Error: "GEMINI_API_KEY is invalid"
- ✅ Check API key is correctly copied (no spaces, no quotes)
- ✅ Verify API key is active on Google AI Studio dashboard
- ✅ Check API key hasn't been revoked

### Error: "Connection refused"
- ✅ Ensure backend is running on port 3000: `cd apps/backend ; npm run dev`
- ✅ Check firewall isn't blocking localhost:3000

### Error: "401 Unauthorized"
- ✅ Verify JWT token is valid (should be auto-injected from auth.store in mobile)
- ✅ Test with valid Bearer token

### Error: "429 Too Many Requests"
- ✅ AI endpoints have rate limits:
  - Text scan: 30 req/min
  - Image scan: 20 req/min
  - Coach: 20 req/min
- ✅ Wait 60 seconds and retry

### Error: `quota exceeded` on `gemini-2.0-flash`
- ✅ Current project is configured to use `gemini-2.5-flash`
- ✅ Keep using 2.5 unless your Google project has active quota for 2.0
- ✅ Fallback response in `POST /ai/coach` prevents 500 while provider is throttled

### Error: "Gemini API quota exceeded"
- ✅ Gemini API has free tier limits (~60 requests/minute)
- ✅ Upgrade to paid plan on Google Cloud Console if needed

---

## Production Checklist

- [ ] GEMINI_API_KEY_PRIMARY set and valid in production .env
- [ ] Active model confirmed as `gemini-2.5-flash` (or another validated model)
- [ ] API key has no rotation scheduled
- [ ] Rate limits acceptable for expected traffic
- [ ] Fallback UI implemented for when Gemini fails
- [ ] Error logging configured for AI failures
- [ ] Metrics/monitoring for AI endpoint latency set up

---

## Pricing & Limits

Pricing/quota can vary by model and project billing configuration.

- Check current quota: https://ai.dev/rate-limit
- Check official pricing: https://ai.google.dev/gemini-api/docs/pricing
- Verify model-specific availability before switching model in backend

---

## Next: Food Database & Roadmap Generation

After activating AI, complete these Phase 1 fixes:
1. ✅ AI Coach (THIS GUIDE)
2. [ ] Seed Vietnamese food database
3. [ ] Fix roadmap generation logic

**Estimated Total:** 11-19 hours to production-ready

---

**Updated:** 2026-05-10  
**Current State:** Active on `gemini-2.5-flash`, Coach UI E2E validated  
**Next Steps:** Keep fallback enabled and monitor quota/rate-limit events in production
