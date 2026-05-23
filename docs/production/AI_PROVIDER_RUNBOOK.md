AI Provider Runbook
===================

Mục đích: hướng dẫn kĩ thuật viên xử lý sự cố liên quan đến nhà cung cấp LLM (Gemini) — timeout, quota, key bị vô hiệu hóa.

1) Triệu chứng nhanh
- API trả lỗi timeout hoặc 5xx trên các endpoint AI (`/ai/*`, `/ai-debug/*`).
- Tỷ lệ `ai_scan_success_rate_pct` giảm, nhiều `ai_scan_failure` trong Metrics.
- Log chứa `AI_TIMEOUT` hoặc lỗi 429 / "quota exceeded".

2) Kiểm tra nhanh (5 phút)
- Kiểm tra health: `GET /health` — nếu thất bại, xem logs backend.
- Kiểm tra logs Sentry / ứng dụng để lấy stack traces (nếu có).
- Kiểm tra metrics snapshot: endpoint health/metrics (bằng `MetricsService.getSnapshot()`), chú ý `ai_scan_success_rate_pct` và `http_errors_5xx`.
- Kiểm tra GCP Console (IAM & Quotas) cho project chứa `GEMINI_API_KEY_PRIMARY` (hoặc key tương ứng): usage/quota, recent errors.

3) Remediation tạm thời
- Giảm concurrency provider để giảm rate-limits: cập nhật `AI_PROVIDER_MAX_CONCURRENCY` và redeploy (hoặc scale replicas xuống).
- Nếu lỗi là quota/key, rotate key hoặc switch provider theo thủ tục (nếu có provider dự phòng).
- Backend sẽ trả degraded response (xem `buildAiUnavailableScanResponse`) — đảm bảo front-end xử lí `success:false` đúng cách.

4) Kiểm tra chi tiết
- Xác nhận ứng dụng đang dùng đúng `GEMINI_API_KEY_PRIMARY` (hoặc backup nếu bị rotate) và không bị expired/disabled.
- Xem timeline: lượng request, lỗi 429, limit reached.
- Nếu là network timeout, kiểm tra NAT/GCP egress và cấu hình firewall.

5) Escalation
- Nếu là quota exhausted: liên hệ Google Cloud support, cung cấp request id và timestamps.
- Nếu là key compromised: revoke key và tạo mới, cập nhật secret manager và CI secrets.

6) Post-incident
- Tạo ghi chú sự cố (incident) kèm logs, timeline, root cause và fix.
- Đánh giá thresholds metrics, cân nhắc giảm default concurrency hoặc tăng timeouts.

7) Giám sát đề xuất
- Theo dõi: `ai_scan_success_rate_pct`, `ai_scan_failure`, `http_errors_5xx`, latency trung bình provider.
- Alert: `ai_scan_success_rate_pct < 70%` hoặc `http_errors_5xx > 50` trong MetricsService.

Ghi chú: không bật `AI_SIMULATE_LOCAL_RESPONSE` trong production — ứng dụng đã fail-fast nếu phát hiện biến môi trường này.
