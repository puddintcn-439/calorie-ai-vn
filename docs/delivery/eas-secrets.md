# EAS And Expo Secrets

This runbook lists the secrets needed for native mobile builds and submit flows.

## Required For Preview Builds

- `EXPO_TOKEN`: Expo account token generated with EAS CLI.
- `EAS_PROJECT_ID`: optional, but recommended when one repo can map to more than one Expo project.

## Android Signing And Submit

- `ANDROID_KEYSTORE_BASE64`: base64-encoded keystore file, if using a fixed upload key.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `GOOGLE_SERVICE_JSON`: Google Play service account JSON for `eas submit`.

For internal preview builds, EAS can manage credentials automatically. For production submit, store signing and Play Console credentials in EAS/GitHub secrets, never in the repo.

## iOS Signing And Submit

- Apple Developer account access configured in EAS.
- App Store Connect API key if CI will submit automatically.
- HealthKit capability configured for the bundle identifier before validating Health Sync.

## GitHub Setup

Add secrets at:

```text
GitHub repository -> Settings -> Secrets and variables -> Actions -> New repository secret
```

With GitHub CLI:

```bash
gh secret set EXPO_TOKEN --body "$(cat ~/expo-token.txt)"
gh secret set EAS_PROJECT_ID --body "your-eas-project-id"
gh secret set GOOGLE_SERVICE_JSON --body "$(base64 -w0 google-service-account.json)"
```

## Build Commands

```bash
cd apps/mobile
npm run build:android:preview
npm run build:ios:preview
```

## Notes

- Native HealthKit and Health Connect do not work in Expo Go.
- The current `apps/mobile/eas.json` has development, preview, and production profiles.
- The production submit block is present but empty; fill it only after Play Console/App Store Connect credentials are ready.
- Use GitHub environment protection for production secrets.
