import { Injectable } from '@nestjs/common';

export interface MetricCounters {
  auth_login_success: number;
  auth_login_failure: number;
  auth_register_success: number;
  auth_register_failure: number;
  ai_scan_success: number;
  ai_scan_failure: number;
  ai_scan_latency_count: number;
  ai_scan_latency_total_ms: number;
  ai_scan_latency_max_ms: number;
  activity_sync_success: number;
  activity_sync_failure: number;
  http_requests_total: number;
  http_errors_5xx: number;
  http_errors_4xx: number;
}

export interface MetricSnapshot {
  counters: MetricCounters;
  rates: {
    auth_failure_rate_pct: number | null;
    ai_scan_success_rate_pct: number | null;
    ai_scan_avg_latency_ms: number | null;
  };
  alerts: AlertStatus[];
  process: {
    uptime_s: number;
    memory_heap_mb: number;
  };
  window_start: string;
  snapshot_at: string;
}

export interface AlertStatus {
  name: string;
  fired: boolean;
  value: number | null;
  threshold: number;
  unit: string;
  description: string;
}

const ALERT_THRESHOLDS = {
  auth_failure_rate_pct: 25,
  ai_scan_success_rate_pct: 70,
  ai_scan_avg_latency_ms: 15000,
  http_5xx_total: 50,
} as const;

@Injectable()
export class MetricsService {
  private readonly windowStart = new Date().toISOString();

  private counters: MetricCounters = {
    auth_login_success: 0,
    auth_login_failure: 0,
    auth_register_success: 0,
    auth_register_failure: 0,
    ai_scan_success: 0,
    ai_scan_failure: 0,
    ai_scan_latency_count: 0,
    ai_scan_latency_total_ms: 0,
    ai_scan_latency_max_ms: 0,
    activity_sync_success: 0,
    activity_sync_failure: 0,
    http_requests_total: 0,
    http_errors_5xx: 0,
    http_errors_4xx: 0,
  };

  inc(key: keyof MetricCounters, by = 1): void {
    this.counters[key] += by;
  }

  recordAuthSuccess(type: 'login' | 'register'): void {
    this.inc(type === 'login' ? 'auth_login_success' : 'auth_register_success');
  }

  recordAuthFailure(type: 'login' | 'register'): void {
    this.inc(type === 'login' ? 'auth_login_failure' : 'auth_register_failure');
  }

  recordAiScan(success: boolean, durationMs?: number): void {
    this.inc(success ? 'ai_scan_success' : 'ai_scan_failure');

    if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
      const rounded = Math.round(durationMs);
      this.inc('ai_scan_latency_count');
      this.inc('ai_scan_latency_total_ms', rounded);
      this.counters.ai_scan_latency_max_ms = Math.max(this.counters.ai_scan_latency_max_ms, rounded);
    }
  }

  recordActivitySync(success: boolean): void {
    this.inc(success ? 'activity_sync_success' : 'activity_sync_failure');
  }

  recordHttpRequest(statusCode: number): void {
    this.inc('http_requests_total');
    if (statusCode >= 500) this.inc('http_errors_5xx');
    else if (statusCode >= 400) this.inc('http_errors_4xx');
  }

  getSnapshot(): MetricSnapshot {
    const c = this.counters;

    const totalAuth = c.auth_login_success + c.auth_login_failure + c.auth_register_success + c.auth_register_failure;
    const authFailures = c.auth_login_failure + c.auth_register_failure;
    const authFailureRate = totalAuth > 0 ? (authFailures / totalAuth) * 100 : null;

    const totalAiScans = c.ai_scan_success + c.ai_scan_failure;
    const aiSuccessRate = totalAiScans > 0 ? (c.ai_scan_success / totalAiScans) * 100 : null;
    const aiAverageLatency = c.ai_scan_latency_count > 0
      ? c.ai_scan_latency_total_ms / c.ai_scan_latency_count
      : null;

    const mem = process.memoryUsage();

    const alerts: AlertStatus[] = [
      {
        name: 'high_auth_failure_rate',
        fired: authFailureRate !== null && authFailureRate > ALERT_THRESHOLDS.auth_failure_rate_pct,
        value: authFailureRate !== null ? Math.round(authFailureRate * 10) / 10 : null,
        threshold: ALERT_THRESHOLDS.auth_failure_rate_pct,
        unit: '%',
        description: 'Authentication failure rate exceeds threshold',
      },
      {
        name: 'low_ai_scan_success_rate',
        fired: aiSuccessRate !== null && aiSuccessRate < ALERT_THRESHOLDS.ai_scan_success_rate_pct,
        value: aiSuccessRate !== null ? Math.round(aiSuccessRate * 10) / 10 : null,
        threshold: ALERT_THRESHOLDS.ai_scan_success_rate_pct,
        unit: '%',
        description: 'AI food scan success rate is below acceptable threshold',
      },
      {
        name: 'high_ai_scan_average_latency',
        fired: aiAverageLatency !== null && aiAverageLatency > ALERT_THRESHOLDS.ai_scan_avg_latency_ms,
        value: aiAverageLatency !== null ? Math.round(aiAverageLatency) : null,
        threshold: ALERT_THRESHOLDS.ai_scan_avg_latency_ms,
        unit: 'ms',
        description: 'Average AI scan latency exceeds threshold',
      },
      {
        name: 'high_5xx_error_count',
        fired: c.http_errors_5xx > ALERT_THRESHOLDS.http_5xx_total,
        value: c.http_errors_5xx,
        threshold: ALERT_THRESHOLDS.http_5xx_total,
        unit: 'count',
        description: 'Accumulated 5xx server errors exceed threshold since process start',
      },
    ];

    return {
      counters: { ...c },
      rates: {
        auth_failure_rate_pct: authFailureRate !== null ? Math.round(authFailureRate * 10) / 10 : null,
        ai_scan_success_rate_pct: aiSuccessRate !== null ? Math.round(aiSuccessRate * 10) / 10 : null,
        ai_scan_avg_latency_ms: aiAverageLatency !== null ? Math.round(aiAverageLatency) : null,
      },
      alerts,
      process: {
        uptime_s: Math.floor(process.uptime()),
        memory_heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      window_start: this.windowStart,
      snapshot_at: new Date().toISOString(),
    };
  }
}
