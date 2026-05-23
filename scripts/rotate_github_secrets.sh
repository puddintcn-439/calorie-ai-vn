#!/usr/bin/env bash
set -euo pipefail

# Usage: OWNER/REPO (e.g. myorg/myrepo)
# Expects the secret values to be present in the environment before running (do NOT commit them)
# Example:
#   export GEMINI_API_KEY_PRIMARY="..."
#   export GEMINI_API_KEY_BACKUP="..."  # optional
#   ./scripts/rotate_github_secrets.sh myorg/myrepo

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <owner/repo>" >&2
  exit 2
fi

REPO="$1"
shift || true

secrets=(
  GEMINI_API_KEY_PRIMARY
  GEMINI_API_KEY_BACKUP
  # Backwards-compat
  GEMINI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  SUPABASE_DB_URL
  JWT_SECRET
  SENTRY_DSN
  TAVILY_API_KEY
)

for name in "${secrets[@]}"; do
  val="$(printenv "$name" || true)"
  if [ -z "$val" ]; then
    echo "[skip] $name not set in environment"
    continue
  fi
  echo "Setting secret $name in $REPO"
  # Use gh CLI to set secret for the repository
  echo -n "$val" | gh secret set "$name" --repo "$REPO" --body - >/dev/null
done

echo "Done. Remember to rotate provider-side keys (Supabase/GCP) and revoke old keys after verification."
