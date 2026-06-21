# Gemini voice food logging

## Architecture

```text
Microphone (expo-av, maximum 30 seconds)
  -> multipart/form-data POST /ai/scan/voice-audio
  -> GeminiAudioTranscriptionService
  -> AiService.scanVoice(transcript)
  -> editable detected foods and macros
  -> user confirms the food log
```

The audio endpoint uses `JwtAuthGuard`, per-user throttling, and the existing
`scan_voice` AI usage feature. The existing transcript-only
`POST /ai/scan/voice` endpoint remains available as the manual fallback.

## API contract

- Endpoint: `POST /ai/scan/voice-audio`
- Content type: `multipart/form-data`
- Required field: `audio`
- Optional fields: `locale`, `timezone`, `meal_hint`
- Maximum upload: 5 MB
- Rate limit: 10 requests per minute per authenticated user
- Mobile recording limit: 30 seconds
- Mobile request timeout: 45 seconds

Supported MIME types:

- `audio/m4a`
- `audio/mp4`
- `audio/mpeg`
- `audio/mp3`
- `audio/wav`
- `audio/x-wav`
- `audio/webm`

The response is the normal `AIScanResponse` plus:

```json
{
  "transcript": "một tô bún bò",
  "metadata": {
    "input_mode": "voice_audio",
    "transcription_provider": "primary"
  }
}
```

## Privacy

Raw audio and base64 audio are never written to application storage, a
database, or logs. The backend processes the upload in memory and only passes
the buffer to Gemini for transcription. Transcript content is not included in
application logs or error messages.

Expo records to an operating-system-managed temporary URI so the file can be
uploaded. The app does not copy that file into persistent application storage.

## Provider and fallback behavior

`GEMINI_API_KEY_PRIMARY` is used first. If it is unavailable or the provider
request fails, `GEMINI_API_KEY_BACKUP` is attempted. `GEMINI_API_KEY` remains a
compatible primary-key fallback. The transcription model is selected from
`AI_AUDIO_MODEL`, then `AI_MODEL`, and defaults to `gemini-2.5-flash`.

If speech cannot be understood, the mobile UI shows “Không nghe rõ, thử lại
hoặc nhập text”. The user can record again or use the transcript input, which
continues to call the original transcript endpoint.

On web, direct recording is intentionally disabled because the current flow
uses the native `expo-av` recorder. The transcript input remains available.

## Manual QA

### iOS

1. Open Scan, choose Voice, and grant microphone permission.
2. Tap “Nhấn để nói”, speak a Vietnamese food and portion, then stop.
3. Verify the processing state, transcript, detected foods, grams, and macros.
4. Edit an item or portion and confirm the food log.
5. Repeat without stopping and verify automatic upload at 30 seconds.
6. Deny microphone permission and verify the manual transcript fallback.

### Android

1. Repeat the iOS flow and verify the `RECORD_AUDIO` permission prompt.
2. Test a short recording and a recording that reaches 30 seconds.
3. Confirm that returning from the permission dialog does not affect camera,
   gallery, text, receipt, barcode, or search modes.
4. Disable networking and verify the retry-or-type guidance without audio data
   appearing in logs.

### Web

1. Open Scan and choose Voice.
2. Verify that no native recording control is offered.
3. Enter a transcript manually and analyze it.
4. Edit the returned food name and portion, then confirm the log.
