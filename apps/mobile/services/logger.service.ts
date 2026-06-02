type LogLevel = 'info' | 'warn' | 'error';

type LogPayload = {
  scope: string;
  message: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

const debugLogsEnabled = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_DEBUG_LOGS === '1';

function emit(level: LogLevel, payload: LogPayload) {
  if (!debugLogsEnabled) return;

  const parts: unknown[] = [`[${level}] ${payload.scope}: ${payload.message}`];
  if (payload.error !== undefined) parts.push(payload.error);
  if (payload.metadata !== undefined) parts.push(payload.metadata);

  console.log(...parts);
}

export const appLogger = {
  info(scope: string, message: string, metadata?: Record<string, unknown>) {
    emit('info', { scope, message, metadata });
  },
  warn(scope: string, message: string, error?: unknown, metadata?: Record<string, unknown>) {
    emit('warn', { scope, message, error, metadata });
  },
  error(scope: string, message: string, error?: unknown, metadata?: Record<string, unknown>) {
    emit('error', { scope, message, error, metadata });
  },
};
