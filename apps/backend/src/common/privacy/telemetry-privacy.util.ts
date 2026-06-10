const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+/gi;
const PHONE_RE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const GPS_RE = /\b-?(?:90(?:\.0+)?|[0-8]?\d(?:\.\d+)?),\s*-?(?:180(?:\.0+)?|1[0-7]\d(?:\.\d+)?|\d?\d(?:\.\d+)?)\b/g;
const TOKEN_RE = /\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+|[A-Za-z0-9+/_-]{24,}={0,2})\b/g;

const DIRECT_PII_KEYS = new Set([
  'email',
  'emails',
  'full_name',
  'fullname',
  'name',
  'username',
  'user_name',
  'display_name',
  'phone',
  'mobile',
  'telephone',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'password',
  'secret',
  'scan_image_url',
  'image_url',
  'photo_url',
  'avatar_url',
  'url',
  'uri',
  'image',
  'photo',
  'avatar',
  'gps',
  'gps_lat',
  'gps_lng',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'location',
]);

function normalizeMetadataKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function isSensitiveMetadataKey(key: string): boolean {
  const normalized = normalizeMetadataKey(key);
  if (DIRECT_PII_KEYS.has(normalized)) {
    return true;
  }

  return normalized.endsWith('_email')
    || normalized.endsWith('_name')
    || normalized.endsWith('_username')
    || normalized.endsWith('_token')
    || normalized.endsWith('_secret')
    || normalized.endsWith('_url')
    || normalized.endsWith('_uri')
    || normalized.endsWith('_latitude')
    || normalized.endsWith('_longitude');
}

export function sanitizeTelemetryText(value?: string | null, maxLength = 280): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const sanitized = value
    .trim()
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(URL_RE, '[redacted-url]')
    .replace(PHONE_RE, '[redacted-phone]')
    .replace(GPS_RE, '[redacted-gps]')
    .replace(TOKEN_RE, '[redacted-secret]')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim();

  return sanitized.length > 0 ? sanitized : undefined;
}

export function sanitizeTelemetryMetadata(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) {
    return undefined;
  }

  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveMetadataKey(key)) {
      continue;
    }

    if (typeof raw === 'string') {
      const sanitized = sanitizeTelemetryText(raw, 160);
      if (sanitized !== undefined) {
        out[key] = sanitized;
      }
      continue;
    }

    if (typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw;
      continue;
    }

    if (Array.isArray(raw)) {
      const sanitizedItems = raw
        .slice(0, 10)
        .map((item) => {
          if (typeof item === 'string') {
            return sanitizeTelemetryText(item, 120);
          }
          if (typeof item === 'number' || typeof item === 'boolean') {
            return item;
          }
          if (item && typeof item === 'object') {
            return sanitizeTelemetryMetadata(item, depth + 1);
          }
          return undefined;
        })
        .filter((item) => item !== undefined);

      if (sanitizedItems.length > 0) {
        out[key] = sanitizedItems;
      }
      continue;
    }

    if (raw && typeof raw === 'object') {
      const nested = sanitizeTelemetryMetadata(raw, depth + 1);
      if (nested && Object.keys(nested).length > 0) {
        out[key] = nested;
      }
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeCorrectionEventPayload<T extends Record<string, unknown>>(event: T): T {
  const sanitized: Record<string, unknown> = {
    ...event,
    food_name: sanitizeTelemetryText(typeof event.food_name === 'string' ? event.food_name : undefined, 120),
    notes: sanitizeTelemetryText(typeof event.notes === 'string' ? event.notes : undefined, 280),
  };

  delete sanitized.scan_image_url;

  return sanitized as T;
}

export function sanitizeLoggingEventPayload<T extends Record<string, unknown>>(event: T): T {
  const sanitized: Record<string, unknown> = {
    ...event,
    reason_code: sanitizeTelemetryText(typeof event.reason_code === 'string' ? event.reason_code : undefined, 80),
    metadata: sanitizeTelemetryMetadata(event.metadata),
  };

  return sanitized as T;
}