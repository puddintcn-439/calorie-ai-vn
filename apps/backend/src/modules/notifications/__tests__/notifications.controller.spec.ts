import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from '../notifications.service';

describe('NotificationsController', () => {
  let app: INestApplication;
  const notificationsService = {
    listUserNotifications: jest.fn(),
    markUserNotificationRead: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: notificationsService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'user-1', sub: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await app.close();
  });

  it('GET /notifications lists current user notifications', async () => {
    notificationsService.listUserNotifications.mockResolvedValue({
      notifications: [{ id: 'note-1', type: 'billing.payment_issue.created', title: 'A', body: 'B' }],
    });

    await request(app.getHttpServer())
      .get('/notifications')
      .expect(200);

    expect(notificationsService.listUserNotifications).toHaveBeenCalledWith('user-1');
  });

  it('PATCH /notifications/:id/read marks current user notification read', async () => {
    notificationsService.markUserNotificationRead.mockResolvedValue({ id: 'note-1', read_at: '2026-06-12T00:00:00.000Z' });

    await request(app.getHttpServer())
      .patch('/notifications/note-1/read')
      .expect(200);

    expect(notificationsService.markUserNotificationRead).toHaveBeenCalledWith('user-1', 'note-1');
  });

  it('PATCH /notifications/:id/read returns 404 for another user notification', async () => {
    notificationsService.markUserNotificationRead.mockResolvedValue(null);

    await request(app.getHttpServer())
      .patch('/notifications/note-2/read')
      .expect(404);
  });
});
