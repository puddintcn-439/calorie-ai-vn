# Mobile Preview Build QA Record

> **Platform**: Android (APK) + iOS (IPA)  
> **Build profile**: `preview` (EAS internal distribution)  
> **Native features required**: React Native Health Connect (Android), React Native Health (iOS)

---

## Build Status

| Platform | Status | Build ID | Date | Notes |
|----------|--------|----------|------|-------|
| Android APK | ⏳ Pending first cloud build | — | — | EAS login required |
| iOS IPA | ⏳ Pending first cloud build | — | — | Apple dev account required |

*Update this table after each successful build.*

---

## Prerequisites

### EAS Account Setup (one-time)

```powershell
# 1. Authenticate with EAS
npm exec eas-cli -- login

# 2. Verify login
npm exec eas-cli -- whoami

# 3. Link project (if not already linked)
npm exec eas-cli -- init --id <expo-project-id>
```

### Environment Variables Required

Set these in EAS Secrets (https://expo.dev → Project → Secrets) or via CLI:

```powershell
# Backend API URL for preview builds
npm exec eas-cli -- secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://api.calorieai.vn"

# Supabase (if mobile accesses Supabase directly)
npm exec eas-cli -- secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "<your-supabase-url>"
npm exec eas-cli -- secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<your-anon-key>"
```

---

## Build Commands

Run from `apps/mobile/` directory:

```powershell
# Android APK (EAS cloud — no local Android SDK needed)
npm run build:android:preview
# Equivalent: npm exec eas-cli -- build --platform android --profile preview

# iOS IPA (EAS cloud — requires Apple developer account configured in EAS)
npm run build:ios:preview
# Equivalent: npm exec eas-cli -- build --platform ios --profile preview

# Both platforms simultaneously
npm exec eas-cli -- build --platform all --profile preview
```

> **Note**: EAS cloud handles native module compilation (react-native-health-connect,
> react-native-health). Local builds on Windows are NOT supported for these native modules.

---

## EAS Profile Configuration

Current `eas.json` preview profile:

```json
"preview": {
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "ios": { "simulator": false }
}
```

- `developmentClient: false` (default) — builds a standalone APK/IPA, not a dev client
- `distribution: internal` — install via EAS link or QR code (no App Store submission required)
- Android: APK format for direct sideload on test devices
- iOS: IPA distributed via EAS internal distribution link

---

## Native Health Feature QA Checklist

After installing the preview build on device:

### Android (Health Connect)

- [ ] App launches without crash
- [ ] Navigate to Home → sync card visible
- [ ] Sync card shows "Setup required" when Health Connect not installed
- [ ] Sync card shows "Permission needed" when Health Connect installed but not granted
- [ ] Sync card shows "Synced" when permissions granted and data available
- [ ] Navigate to `calorieai://health-sync` deep link → Diagnostics screen opens
- [ ] Diagnostics screen shows correct platform: `android`
- [ ] "Sync Today" button triggers activity sync
- [ ] Date selector accepts YYYY-MM-DD format and syncs historical data
- [ ] Activity data appears in Log tab after sync

### iOS (HealthKit)

- [ ] App launches without crash
- [ ] Navigate to Home → sync card visible  
- [ ] Sync card shows "Permission needed" before granting HealthKit access
- [ ] System permission dialog appears on first sync attempt
- [ ] After granting: sync card shows "Synced"
- [ ] Navigate to `calorieai://health-sync` → Diagnostics screen opens
- [ ] Diagnostics shows platform: `ios`
- [ ] Activity data synced and visible in Log tab

---

## Sharing Build with QA Team

After successful build:

```powershell
# List recent builds
npm exec eas-cli -- build:list --platform android --profile preview --limit 5

# Get download URL for latest build
npm exec eas-cli -- build:view --latest
```

EAS generates a QR code and install link valid for 30 days (internal distribution).

---

## Troubleshooting

### "react-native-health-connect is not installed"

This module requires a **native dev build** — it will not work in Expo Go.  
Solution: Use the preview or development build profile with EAS.

### Build fails with "Missing credentials"

- Android: EAS auto-generates a keystore for internal distribution
- iOS: Go to https://expo.dev → your project → Credentials and configure Apple certificates

### Deep link `calorieai://health-sync` not opening

1. Verify `app.json` has `scheme: "calorieai"` set
2. On Android: uninstall + reinstall the APK (scheme registration requires fresh install)
3. On iOS: reset URL scheme cache with device restart

---

*Created: 2026-05-09 | Next build attempt: After EAS login setup*
