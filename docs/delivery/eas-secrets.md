# EAS & Expo Secrets — Setup Guide

This document lists the secrets and credentials required to run EAS builds in CI and how to add them to GitHub repository secrets.

Required secrets (recommended):

- `EXPO_TOKEN` — Expo account token (use `expo login` + `expo token:generate` or `eas login` / `eas token`).
- `EAS_PROJECT_ID` — Optional; if you use multiple projects or want explicit mapping.
- Android keystore items (if uploading/producing signed APK/AAB):
  - `ANDROID_KEYSTORE_BASE64` — Base64-encoded keystore file (use `base64 -w0 my.keystore`)
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
- Google Play service account JSON (if using `eas submit`):
  - `GOOGLE_SERVICE_JSON` — base64 or multiline secret of the JSON file
- iOS credentials (if building / uploading):
  - Apple App Store Connect API keys / secrets — follow `eas` docs to store credentials in CI

How to add secrets in GitHub (UI):

1. Open the repository on GitHub.
2. Settings → Secrets and variables → Actions → New repository secret.
3. Add keys listed above and paste values.

How to add secrets with GitHub CLI (`gh`):

```bash
# EXPO_TOKEN example
gh secret set EXPO_TOKEN --body "$(cat ~/expo-token.txt)"

# Android keystore example (base64)
gh secret set ANDROID_KEYSTORE_BASE64 --body "$(base64 -w0 my-release-key.keystore)"
gh secret set ANDROID_KEYSTORE_PASSWORD --body "your-keystore-password"
gh secret set ANDROID_KEY_ALIAS --body "my-key-alias"
gh secret set ANDROID_KEY_PASSWORD --body "your-key-password"
```

CI usage notes

- The `.github/workflows/ci-cd.yml` workflow includes a `mobile-eas-build` job gated on `EXPO_TOKEN` being present. After adding `EXPO_TOKEN`, the job will run (if the `if:` condition is true) and will attempt `npm run build:android:preview`.
- For signed uploads / `eas submit`, additional secrets (keystore, Google service account JSON) are required.

Security and automation tips

- Prefer storing binary secrets (keystore/JSON) as base64 and decode them in the workflow when needed.
- Use GitHub environment protection rules for production secrets (environments) to require approvals or branch protections.
- Avoid committing credential files into the repo; keep them in secrets only.

If you want, I can:
- Add an example workflow step decoding and installing the Android keystore inside `mobile-eas-build` job.
- Provide a safe `eas` CLI command list to generate tokens and export them for `gh secret set`.

***
