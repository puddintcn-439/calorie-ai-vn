import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '../health.service';
import { SupabaseService } from '../../common/supabase/supabase.service';

describe('HealthService', () => {
  let service: HealthService;
  let supabaseService: SupabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: SupabaseService,
          useValue: {
            db: {
              from: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  error: null,
                  data: { count: 0 },
                }),
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return healthy status when database is connected', async () => {
      jest.spyOn(supabaseService.db, 'from').mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: {}, error: null }),
      } as any);

      const result = await service.getStatus();

      expect(result.status).toBe('healthy');
      expect(result.database.status).toBe('connected');
      expect(result.version).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should return unhealthy status when database is disconnected', async () => {
      jest.spyOn(supabaseService.db, 'from').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('Connection failed'),
        }),
      } as any);

      const result = await service.getStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.database.status).toBe('disconnected');
      expect(result.error).toBeDefined();
    });
  });

  describe('checkReadiness', () => {
    it('should return ready=true when database is accessible', async () => {
      jest.spyOn(supabaseService.db, 'from').mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: {}, error: null }),
      } as any);

      const result = await service.checkReadiness();

      expect(result.ready).toBe(true);
    });

    it('should return ready=false when database is inaccessible', async () => {
      jest.spyOn(supabaseService.db, 'from').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: new Error('DB Error'),
        }),
      } as any);

      const result = await service.checkReadiness();

      expect(result.ready).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('checkLiveness', () => {
    it('should always return alive=true', async () => {
      const result = await service.checkLiveness();

      expect(result.alive).toBe(true);
      expect(result.uptime).toBeGreaterThan(0);
    });
  });
});
