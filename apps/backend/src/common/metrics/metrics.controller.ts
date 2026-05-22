import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  getPrometheusMetrics(): string {
    const snap = this.metricsService.getSnapshot();
    const lines: string[] = [];

    lines.push('# HELP calorie_ai_http_requests_total Total HTTP requests received');
    lines.push('# TYPE calorie_ai_http_requests_total counter');
    lines.push(`calorie_ai_http_requests_total ${snap.counters.http_requests_total}`);

    lines.push('# HELP calorie_ai_http_errors_5xx_total Total HTTP 5xx errors');
    lines.push('# TYPE calorie_ai_http_errors_5xx_total counter');
    lines.push(`calorie_ai_http_errors_5xx_total ${snap.counters.http_errors_5xx}`);

    lines.push('# HELP calorie_ai_http_errors_4xx_total Total HTTP 4xx errors');
    lines.push('# TYPE calorie_ai_http_errors_4xx_total counter');
    lines.push(`calorie_ai_http_errors_4xx_total ${snap.counters.http_errors_4xx}`);

    lines.push('# HELP calorie_ai_ai_scan_success_total AI scan success count');
    lines.push('# TYPE calorie_ai_ai_scan_success_total counter');
    lines.push(`calorie_ai_ai_scan_success_total ${snap.counters.ai_scan_success}`);

    lines.push('# HELP calorie_ai_ai_scan_failure_total AI scan failure count');
    lines.push('# TYPE calorie_ai_ai_scan_failure_total counter');
    lines.push(`calorie_ai_ai_scan_failure_total ${snap.counters.ai_scan_failure}`);

    lines.push('# HELP calorie_ai_ai_scan_success_rate_pct AI scan success rate percent');
    lines.push('# TYPE calorie_ai_ai_scan_success_rate_pct gauge');
    lines.push(`calorie_ai_ai_scan_success_rate_pct ${snap.rates.ai_scan_success_rate_pct ?? 0}`);

    lines.push('# HELP calorie_ai_process_uptime_s Process uptime seconds');
    lines.push('# TYPE calorie_ai_process_uptime_s gauge');
    lines.push(`calorie_ai_process_uptime_s ${snap.process.uptime_s}`);

    lines.push('# HELP calorie_ai_memory_heap_mb Memory heap MB');
    lines.push('# TYPE calorie_ai_memory_heap_mb gauge');
    lines.push(`calorie_ai_memory_heap_mb ${snap.process.memory_heap_mb}`);

    return lines.join('\n') + '\n';
  }
}
