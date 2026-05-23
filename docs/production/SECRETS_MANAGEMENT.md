SECRETS MANAGEMENT — Hướng dẫn nhanh
=====================================

Mục tiêu: bảo vệ secrets (API keys, DB keys, JWT secrets) — không commit vào repo, có rotation, audit và CI gate.

1) Quy tắc cơ bản
- KHÔNG commit secrets vào Git. Di chuyển tất cả giá trị thực vào `GitHub Secrets` hoặc secret manager (GCP Secret Manager, AWS Secrets Manager, Vault).
- Giữ file mẫu `apps/backend/.env.example` trong repo (chỉ chứa biến và placeholders).
- Truy cập secrets theo biến môi trường trong runtime (`process.env.GEMINI_API_KEY`, ...).

2) Tên biến khuyến nghị (consistent across CI/infra)
- `GEMINI_API_KEY_PRIMARY` — primary key for the AI provider (preferred)
- `GEMINI_API_KEY_BACKUP` — optional backup key for automatic fallback
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — supabase project
- `SUPABASE_DB_URL` — optional for direct DB migrations
- `JWT_SECRET` — signing secret
- `SENTRY_DSN` — Sentry reporting

3) Cách cấu hình trên GitHub Actions
- Đặt các secret trên GitHub repo → `Settings` → `Secrets and variables` → `Actions`.
- CI workflows (ví dụ `.github/workflows/validate-production-secrets.yml`) kiểm tra presence của những secret cần thiết trước khi deploy.

4) Rotation (quy trình ngắn)
- Tạo secret mới ở provider (Gemini/Supabase console).
- Cập nhật secret trong Secret Manager / GitHub Secrets (sử dụng UI hoặc script với GitHub API).
- Thực hiện một build/kiểm tra smoke test trên staging; khi thành công, promote key lên production secrets.
- Revoke key cũ nếu có lý do an ninh.

5) Phát hiện secrets trong repo
- Dùng script `scripts/find_potential_secrets.js` (đã thêm) để quét repo tìm các token phơi bày.
- Mỗi PR nên chạy workflow `secret-scan.yml` để chặn commit chứa secrets.

6) Khi phát hiện secret đã bị commit
- Revoke/rotate key ngay lập tức.
- Xóa secret khỏi git history (sử dụng `git filter-repo` hoặc BFG) và force-push — sau đó thông báo cho nhóm.

7) Kiểm thử & Audit
- Thêm test CI để validate presence của production secrets (đã có `validate-production-secrets.yml`).
- Thường xuyên chạy `scripts/find_potential_secrets.js` trên lịch hoặc as pre-commit hook.

8) Ghi chú
- Đã cập nhật `scripts/preflight-check.ps1` để hỗ trợ kiểm tra secrets khi gọi với option `-CheckSecrets`.

9) Tự động cập nhật GitHub Secrets (helper)
- Có thể dùng `gh` CLI cùng 2 helper script có sẵn trong `scripts/` để set/rotate secrets cho repo:
	- `scripts/rotate_github_secrets.sh` (Bash)
	- `scripts/rotate_github_secrets.ps1` (PowerShell)

Usage (example):
1. Export secret values into environment locally (do NOT commit them):
	- Bash: `export GEMINI_API_KEY_PRIMARY="..."`
	- PowerShell: `$env:GEMINI_API_KEY_PRIMARY = '...'
2. Run the script: `./scripts/rotate_github_secrets.sh myorg/myrepo` or `./scripts/rotate_github_secrets.ps1 -Repo myorg/myrepo`

These helpers call `gh secret set` and require `gh` CLI authenticated with a user that has repo-write permission. After rotation, run smoke tests on staging and then promote secrets to production.

10) Example: GitHub Actions + GCP Secret Manager
- If you store production secrets in GCP Secret Manager, a workflow can fetch them at runtime.

Example step (requires `GCP_SA_KEY` as a GitHub Actions secret containing a service account JSON with Secret Manager access):

```yaml
- name: Authenticate to GCP
	uses: google-github-actions/auth@v1
	with:
		credentials_json: ${{ secrets.GCP_SA_KEY }}

- name: Fetch secrets from Secret Manager
	uses: google-github-actions/get-secretmanager-secrets@v0
	with:
		secrets: |
			projects/PROJECT_ID/secrets/GEMINI_API_KEY:env:GEMINI_API_KEY
			projects/PROJECT_ID/secrets/SUPABASE_SERVICE_KEY:env:SUPABASE_SERVICE_KEY
			projects/PROJECT_ID/secrets/JWT_SECRET:env:JWT_SECRET
```

After this step the fetched secrets will be available as environment variables for subsequent steps.
