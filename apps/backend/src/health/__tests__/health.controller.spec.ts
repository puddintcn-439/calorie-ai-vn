import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    service = module.get<HealthService>(HealthService);
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
});
