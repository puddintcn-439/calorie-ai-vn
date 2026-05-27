import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';
import { MetricsService } from '../../common/metrics/metrics.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;
  let metrics: MetricsService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({
              status: 'healthy',
              timestamp: new Date().toISOString(),
            }),
            checkReadiness: jest.fn().mockResolvedValue({
              ready: true,
              timestamp: new Date().toISOString(),
            }),
            checkLiveness: jest.fn().mockResolvedValue({
              alive: true,
              uptime: 100,
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            getSnapshot: jest.fn().mockReturnValue({
              counters: {
                auth_login_success: 0,
                auth_login_failure: 0,
                auth_register_success: 0,
                auth_register_failure: 0,
                ai_scan_success: 1,
                ai_scan_failure: 0,
                ai_scan_latency_count: 1,
                ai_scan_latency_total_ms: 1200,
                ai_scan_latency_max_ms: 1200,
                activity_sync_success: 0,
                activity_sync_failure: 0,
                http_requests_total: 1,
                http_errors_5xx: 0,
                http_errors_4xx: 0,
              },
              rates: {
                auth_failure_rate_pct: null,
                ai_scan_success_rate_pct: 100,
                ai_scan_avg_latency_ms: 1200,
              },
              alerts: [],
              process: {
                uptime_s: 10,
                memory_heap_mb: 100,
              },
              window_start: '2026-05-28T00:00:00.000Z',
              snapshot_at: '2026-05-28T00:01:00.000Z',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
    metrics = module.get<MetricsService>(MetricsService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /health', () => {
    it('should call getStatus and return result', async () => {
      const result = await controller.getHealth();

      expect(service.getStatus).toHaveBeenCalled();
      expect(result.status).toBe('healthy');
    });
  });

  describe('GET /health/ready', () => {
    it('should call checkReadiness and return result', async () => {
      const result = await controller.getReadiness();

      expect(service.checkReadiness).toHaveBeenCalled();
      expect(result.ready).toBe(true);
    });
  });

  describe('GET /health/live', () => {
    it('should call checkLiveness and return result', async () => {
      const result = await controller.getLiveness();

      expect(service.checkLiveness).toHaveBeenCalled();
      expect(result.alive).toBe(true);
    });
  });

  describe('GET /health/metrics', () => {
    it('should expose monitoring counters, rates, alerts, process info, and timestamps', () => {
      const result = controller.getMetrics();

      expect(metrics.getSnapshot).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({
        counters: expect.objectContaining({
          ai_scan_success: expect.any(Number),
          ai_scan_failure: expect.any(Number),
          ai_scan_latency_count: expect.any(Number),
          ai_scan_latency_total_ms: expect.any(Number),
          ai_scan_latency_max_ms: expect.any(Number),
          http_requests_total: expect.any(Number),
        }),
        rates: expect.objectContaining({
          auth_failure_rate_pct: null,
          ai_scan_success_rate_pct: expect.any(Number),
          ai_scan_avg_latency_ms: expect.any(Number),
        }),
        alerts: expect.any(Array),
        process: expect.objectContaining({
          uptime_s: expect.any(Number),
          memory_heap_mb: expect.any(Number),
        }),
        window_start: expect.any(String),
        snapshot_at: expect.any(String),
      }));
    });
  });
});
