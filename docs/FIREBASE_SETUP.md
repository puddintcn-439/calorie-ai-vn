# Firebase Push Notifications Setup Guide

## Overview

This guide walks through setting up Firebase Cloud Messaging (FCM) for push notifications on the CalorieAI backend and mobile app.

**Status:** ✅ Backend integration complete (firebase-admin SDK installed)  
**Mobile:** Expo notifications ready (no additional setup needed for basic delivery)  
**Timeline:** 1-2 hours for full setup (Firebase + credentials)

---

## Backend Setup (NestJS)

### 1. Firebase Project Creation

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or select existing):
   - **Project name:** calorie-ai-vn
   - **Analytics:** Optional
3. Once created, note the **Project ID** (used in .env)

### 2. Enable Cloud Messaging

1. In Firebase Console, go to **Build → Cloud Messaging**
2. Click **Enable** (should be pre-enabled in most cases)
3. Note the **Server API Key** and **Sender ID** (both shown in Cloud Messaging tab)

### 3. Create Service Account

1. Go to **Project Settings → Service Accounts**
2. Click **Generate New Private Key**
3. Save the JSON file as `firebase-service-account.json` in the backend root directory:
   ```
   apps/backend/firebase-service-account.json
   ```
4. **DO NOT commit this file to git** (add to `.gitignore` if not already)

### 4. Configure Backend Environment

Update `apps/backend/.env`:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

### 5. Verify Backend Setup

Test the push notification endpoint:

```bash
# Start backend
cd apps/backend
npm start

# In another terminal, test the endpoint
curl -X POST http://localhost:3000/reminders/push-test \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "meal_type": "breakfast",
    "calories_logged": 300
  }'
```

Expected response:
```json
{
  "sent": true,
  "nudge": {
    "title": "🌅 Bữa sáng - Hãy thêm 1200kcal nữa",
    "body": "Bạn đã ghi 300kcal, chỉ còn 1500kcal nữa...",
    "type": "encouragement",
    "mealType": "breakfast",
    "emoji": "💪"
  }
}
```

---

## Mobile Setup (React Native + Expo)

### 1. Push Token Registration

The mobile app automatically registers push tokens on auth (login/register):

**File:** `apps/mobile/services/push-notification.service.ts`

```typescript
async initializePushNotifications() {
  // Requests permission (iOS/Android)
  // Gets Expo push token
  // Registers with backend via POST /reminders/push-token
  // Sets up notification handlers
}
```

### 2. Notification Handling

Handle incoming notifications when app is:
- **Foreground:** Use `Notifications.addNotificationResponseReceivedListener()`
- **Background:** Handled by Expo automatically
- **Killed:** Tap notification to open app

### 3. Test on Real Device

```bash
# 1. Build mobile app for testing
cd apps/mobile
npx expo start --dev-client

# 2. Scan QR code and open in Expo Go (iOS/Android)

# 3. App will register push token automatically after login

# 4. Send test push from backend:
curl -X POST http://<BACKEND_URL>/reminders/push-test \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"meal_type": "lunch", "calories_logged": 500}'

# 5. Verify notification appears on device
```

---

## Database Schema

### push_notification_tokens Table

Stores device tokens for each user:

```sql
CREATE TABLE push_notification_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX idx_push_tokens_user ON push_notification_tokens(user_id, active);
```

**Fields:**
- `user_id`: User who owns the device
- `token`: Expo push token (ExponentPushToken[...])
- `platform`: iOS, Android, or web
- `active`: Token is valid and should receive notifications
- `created_at`: Token registration time
- `updated_at`: Last activity time

---

## API Endpoints

### 1. Register Push Token

**Endpoint:** `POST /reminders/push-token`

**Request:**
```json
{
  "token": "ExponentPushToken[xxxxx...]",
  "platform": "ios"
}
```

**Response:**
```json
{
  "registered": true
}
```

**Called by:** Mobile app on auth (login/register)

### 2. Send Test Push

**Endpoint:** `POST /reminders/push-test`

**Request:**
```json
{
  "meal_type": "breakfast",
  "calories_logged": 300
}
```

**Response:**
```json
{
  "sent": true,
  "nudge": { ... }
}
```

**Purpose:** Test push notification delivery (requires auth)

---

## Troubleshooting

### "Firebase not initialized"
**Solution:** Set `FIREBASE_SERVICE_ACCOUNT_PATH` in .env and provide valid service account JSON

### "Invalid token" errors
**Solution:** 
- Verify token starts with `ExponentPushToken[`
- Check token is fresh (Expo tokens expire after long inactivity)
- Mobile app should re-register on each auth session

### No notification received
**Checklist:**
1. Verify backend has valid Firebase credentials
2. Check push token is registered: `SELECT * FROM push_notification_tokens WHERE user_id='...'`
3. Check `active=true` for the token
4. Verify app has notification permissions (iOS/Android)
5. Test with `POST /reminders/push-test` endpoint

### iOS Notifications Not Showing
**Solution:**
- Go to Settings → [App Name] → Notifications
- Ensure **Allow Notifications** is ON
- Check **Lock Screen**, **Notification Center**, **Banners** are enabled

### Android Notifications Not Showing
**Solution:**
- Go to Settings → Apps → [App Name] → Permissions → Notifications
- Ensure **Allow notifications** is enabled
- Check notification channel exists (app creates "reminders" channel)

---

## Security Notes

⚠️ **Do NOT commit `firebase-service-account.json` to git:**

```bash
# apps/backend/.gitignore
firebase-service-account.json
```

🔐 **In production:**
- Store credentials in secrets manager (AWS Secrets Manager, GitHub Secrets, etc)
- Load from environment variable or mounted secret
- Rotate keys regularly

🔐 **Token security:**
- Tokens are user-specific (user_id + token unique constraint)
- Invalid tokens are automatically marked inactive
- Only the backend can send notifications

---

## Integration with Reminder System

### Automatic Nudges

The reminder scheduler will automatically send push notifications:

```typescript
// In reminder.scheduler.ts
async checkAndSendReminders() {
  // 1. Get user's preferences
  // 2. Generate nudge message
  // 3. Send via email + push notification
  // 4. Log telemetry event
}
```

**Nudge Types:**
- `encouragement` - Positive motivation ("You're doing great!")
- `warning` - Gentle caution ("A bit more to goal")
- `streak` - Streak preservation ("Keep the streak alive!")
- `correction` - After user logs food

---

## Testing Checklist

- [ ] Firebase project created + enabled Cloud Messaging
- [ ] Service account credentials downloaded
- [ ] Backend `.env` updated with `FIREBASE_SERVICE_ACCOUNT_PATH`
- [ ] Backend builds successfully (`npm run build`)
- [ ] `POST /reminders/push-token` endpoint works
- [ ] `POST /reminders/push-test` endpoint works
- [ ] Test push received on device
- [ ] Push notification database table exists
- [ ] Token registration verified in database
- [ ] Invalid tokens marked as inactive
- [ ] iOS notification permissions enabled
- [ ] Android notification channel functional

---

## Next Steps

1. **Complete Setup (if not done):**
   - [ ] Create Firebase project
   - [ ] Download service account JSON
   - [ ] Set `FIREBASE_SERVICE_ACCOUNT_PATH` in .env

2. **Staging Deployment:**
   - [ ] Test push notifications work end-to-end
   - [ ] Monitor push delivery rate
   - [ ] Test on multiple devices (iOS + Android)

3. **Production Rollout:**
   - [ ] Store credentials in secrets manager
   - [ ] Monitor push delivery metrics (Sentry/DataDog)
   - [ ] Set up alerts for delivery failures

4. **Future Enhancements:**
   - [ ] Rich notifications with actions (quick-log buttons)
   - [ ] Notification templates per context mode
   - [ ] Delivery time optimization (send when user most likely to engage)
   - [ ] Analytics tracking (open rate, click-through rate)

---

## References

- [Firebase Admin SDK - Node.js](https://firebase.google.com/docs/admin/setup)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Push Notifications Best Practices](https://firebase.google.com/docs/cloud-messaging/best-practices)
