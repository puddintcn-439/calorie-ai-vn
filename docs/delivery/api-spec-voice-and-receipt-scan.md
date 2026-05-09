# API Spec: Voice Logging and Receipt Scan

## 1. Purpose
Define implementation-ready API contracts for:
1. Voice-based meal logging parse
2. Receipt image parse to meal candidates

This spec is designed to fit existing AI scan flows and response shape.

## 2. Endpoint: POST /ai/scan/voice

## 2.1 Auth and Headers
- Auth: Bearer token required
- Content-Type: application/json

## 2.2 Request Body
{
  "transcript": "I had one chicken salad and a latte this morning",
  "locale": "en-US",
  "timezone": "America/Los_Angeles",
  "meal_hint": "breakfast",
  "context": {
    "source": "mobile_voice",
    "device_language": "en"
  }
}

Field rules:
- transcript: required, 2..1500 chars
- locale: optional, default from user profile
- timezone: optional
- meal_hint: optional enum [breakfast,lunch,dinner,snack]
- context: optional object

## 2.3 Response 200
{
  "success": true,
  "scan_id": "uuid",
  "items": [
    {
      "name": "Chicken salad",
      "name_vi": "Chicken salad",
      "category": "other",
      "quantity": 1,
      "unit": "serving",
      "estimated_grams": 280,
      "calories": 420,
      "protein_g": 34,
      "carbs_g": 18,
      "fat_g": 24,
      "confidence": 0.82
    }
  ],
  "total_calories": 540,
  "total_protein_g": 40,
  "total_carbs_g": 30,
  "total_fat_g": 28,
  "ai_confidence": 0.79,
  "processing_ms": 710,
  "metadata": {
    "parse_mode": "voice_transcript",
    "locale_used": "en-US"
  }
}

## 2.4 Error Codes
- 400: malformed payload
- 401: unauthorized
- 422: transcript empty/invalid
- 429: throttled
- 503: AI provider unavailable

## 2.5 Telemetry Events
- log_attempted { input_mode: "voice" }
- log_parsed { confidence, processing_ms, item_count }
- log_failed { reason_code }

## 3. Endpoint: POST /ai/scan/receipt

## 3.1 Auth and Headers
- Auth: Bearer token required
- Content-Type: multipart/form-data

## 3.2 Multipart Fields
- receipt_image: file (required)
- locale: string (optional)
- currency: string (optional)
- merchant_hint: string (optional)
- meal_hint: enum optional [breakfast,lunch,dinner,snack]

## 3.3 Response 200
{
  "success": true,
  "scan_id": "uuid",
  "items": [
    {
      "name": "Greek Yogurt",
      "name_vi": "Greek Yogurt",
      "category": "other",
      "quantity": 1,
      "unit": "cup",
      "estimated_grams": 170,
      "calories": 130,
      "protein_g": 12,
      "carbs_g": 8,
      "fat_g": 4,
      "confidence": 0.88
    }
  ],
  "unresolved_items": [
    {
      "raw_text": "PROMO ITEM X",
      "reason": "unknown_product",
      "confidence": 0.31
    }
  ],
  "total_calories": 130,
  "total_protein_g": 12,
  "total_carbs_g": 8,
  "total_fat_g": 4,
  "ai_confidence": 0.74,
  "processing_ms": 1240,
  "metadata": {
    "parse_mode": "receipt_ocr",
    "merchant": "Target",
    "currency": "USD"
  }
}

## 3.4 Error Codes
- 400: missing file or invalid multipart field
- 401: unauthorized
- 413: file too large
- 415: unsupported media type
- 422: image unreadable
- 429: throttled
- 503: OCR/AI provider unavailable

## 3.5 Validation Rules
- file size <= 8 MB
- mime type in [image/jpeg,image/png,image/webp]
- max OCR tokens threshold to avoid cost spikes

## 4. Shared DTO Notes

Reuse existing AI scan output type with additive optional fields:
- unresolved_items?: array
- metadata?: object

No breaking changes for existing clients consuming:
- success
- scan_id
- items
- totals
- ai_confidence
- processing_ms

## 5. Security and Abuse Controls

1. Per-user throttle
- voice: 30 req/min
- receipt: 15 req/min

2. Input sanitization
- strip control characters from transcript
- OCR text normalization before prompt

3. Cost guardrails
- early reject oversized payload
- provider timeout <= 15s
- max retry 1 on transient errors

## 6. QA Contract Test Matrix

Voice endpoint:
1. happy path transcript
2. empty transcript
3. long transcript > max chars
4. unsupported locale fallback
5. AI timeout path

Receipt endpoint:
1. happy path with 2 products
2. unreadable image
3. oversized image
4. unknown lines -> unresolved_items
5. provider outage fallback

## 7. Implementation Mapping

Backend modules:
- ai.controller.ts: add POST /ai/scan/voice and POST /ai/scan/receipt
- ai.dto.ts: add new DTOs
- ai.service.ts: add scanVoice() and scanReceipt()

Mobile modules:
- app/(tabs)/scan.tsx: add voice and receipt modes
- services/ai.service.ts: add client methods

Analytics:
- telemetry service event emission on attempt/success/failure

## 8. Definition of Done

1. Both endpoints deployed and documented.
2. Mobile can create editable candidate logs from voice and receipt.
3. Contract tests green.
4. Logging median time improved in baseline dashboard.
