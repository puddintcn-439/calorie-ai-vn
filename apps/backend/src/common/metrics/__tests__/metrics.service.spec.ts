import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  it('records AI scan latency and exposes average/max latency', () => {
    const service = new MetricsService();

    service.recordAiScan(true, 1000);
    service.recordAiScan(false, 3100);

    const snapshot = service.getSnapshot();

    expect(snapshot.counters.ai_scan_success).toBe(1);
    expect(snapshot.counters.ai_scan_failure).toBe(1);
    expect(snapshot.counters.ai_scan_latency_count).toBe(2);
    expect(snapshot.counters.ai_scan_latency_total_ms).toBe(4100);
    expect(snapshot.counters.ai_scan_latency_max_ms).toBe(3100);
    expect(snapshot.rates.ai_scan_avg_latency_ms).toBe(2050);
  });

  it('fires an alert when average AI scan latency is too high', () => {
    const service = new MetricsService();

    service.recordAiScan(true, 16000);

    const snapshot = service.getSnapshot();
    const latencyAlert = snapshot.alerts.find((alert) => alert.name === 'high_ai_scan_average_latency');

    expect(latencyAlert).toEqual(expect.objectContaining({
      fired: true,
      value: 16000,
      threshold: 15000,
      unit: 'ms',
    }));
  });

  it('ignores invalid latency values', () => {
    const service = new MetricsService();

    service.recordAiScan(true, Number.NaN);
    service.recordAiScan(true, -1);

    const snapshot = service.getSnapshot();

    expect(snapshot.counters.ai_scan_success).toBe(2);
    expect(snapshot.counters.ai_scan_latency_count).toBe(0);
    expect(snapshot.rates.ai_scan_avg_latency_ms).toBeNull();
  });
});
