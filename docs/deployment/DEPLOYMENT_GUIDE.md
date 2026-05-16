# Deployment Guide

This guide reflects the current repository layout and CI behavior.

## Backend Image Build

The backend Dockerfile depends on workspace packages, so the Docker context must be the repository root.

```bash
docker build -f apps/backend/Dockerfile -t calorie-ai-backend:latest .
```

Local stack:

```bash
docker compose up --build
```

## GitHub Actions Production Deploy

`.github/workflows/deploy.yml` currently does three things:

1. Builds and pushes a backend image to GHCR from the repo root.
2. Runs pre-deploy smoke tests.
3. Calls a production deploy webhook and verifies `/health`.

Required repository secrets:

- `PRODUCTION_DEPLOY_WEBHOOK_URL`: endpoint that performs the real rollout for the image payload.
- `PRODUCTION_ROLLBACK_WEBHOOK_URL`: endpoint that rolls back to the previous image.
- `PRODUCTION_URL`: public API base URL used for health checks.
- `DEPLOY_TOKEN`: bearer token accepted by health/deploy/rollback endpoints.

Deploy payload:

```json
{
  "image": "ghcr.io/<owner>/<repo>/backend:prod-<sha>",
  "tag": "prod-<sha>",
  "sha": "<github_sha>"
}
```

Rollback payload:

```json
{
  "image": "<previous_image>",
  "failed_image": "ghcr.io/<owner>/<repo>/backend:prod-<sha>",
  "sha": "<github_sha>"
}
```

The workflow intentionally fails if `PRODUCTION_DEPLOY_WEBHOOK_URL` is not configured. This prevents a build-only workflow from being reported as a successful deploy.

The legacy external smoke suite is opt-in because it requires a reachable Supabase project:

```bash
RUN_EXTERNAL_SMOKE=true npm run test --workspace=backend -- smoke --runInBand
```

## Kubernetes

Checked-in manifests currently exist only under:

```text
k8s/prod/
```

There is no `k8s/staging` directory in the repo. Do not reference staging manifests until they are added.

## Minimum Production Validation

After rollout:

```bash
curl -fsS "$PRODUCTION_URL/health"
curl -fsS "$PRODUCTION_URL/health/ready"
```

Then run a short smoke path against the production or staging API:

- register/login
- update profile
- calculate calorie target
- search food
- barcode lookup
- create food log
- create activity log
- fetch Today/Insights summary

## Mobile Release

Native preview builds are handled through EAS:

```bash
cd apps/mobile
npm run build:android:preview
npm run build:ios:preview
```

Production submit requires the secrets documented in `docs/delivery/eas-secrets.md`.
