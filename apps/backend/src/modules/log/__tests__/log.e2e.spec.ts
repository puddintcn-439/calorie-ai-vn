import { INestApplication, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { LogController } from '../log.controller';
import { LogService } from '../log.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('LogController (e2e)', () => {
  let app: INestApplication;

  const logService = {
    createActivityLog: jest.fn(),
    getActivityLogs: jest.fn(),
    syncActivityBatch: jest.fn(),
  } as unknown as jest.Mocked<LogService>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogController],
      providers: [
        { provide: LogService, useValue: logService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'user-1', sub: 'user-1', email: 'user@example.com' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(async () => await app.close());

  it('POST /log/activity returns created activity including exercises', async () => {
    const dto = {
      activity_type: 'gym',
      duration_min: 45,
      exercises: [{ name: 'Back Squat', sets: [{ reps: 5, weight_kg: 120 }] }],
    } as any;

    logService.createActivityLog = jest.fn().mockResolvedValue({ id: 'a-1', user_id: 'user-1', ...dto });

    const res = await request(app.getHttpServer()).post('/log/activity').send(dto).expect(201);

    expect(res.body.id).toBe('a-1');
    expect(res.body.exercises).toBeDefined();
    expect(logService.createActivityLog).toHaveBeenCalledWith('user-1', expect.objectContaining({ activity_type: 'gym' }));
  });

  it('POST /log/activity returns 400 when service throws', async () => {
    const dto = { activity_type: 'gym', duration_min: 30 } as any;
    logService.createActivityLog = jest.fn().mockImplementation(() => { throw new Error('insert failed'); });

    await request(app.getHttpServer()).post('/log/activity').send(dto).expect(500);
  });

  it('GET /log/activity returns activity list for date', async () => {
    logService.getActivityLogs = jest.fn().mockResolvedValue([{ id: 'a-1', calories_burned: 120 }]);

    const res = await request(app.getHttpServer()).get('/log/activity?date=2026-05-09').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('a-1');
  });
});
