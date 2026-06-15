import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminController } from '../admin.controller';
import { AdminGuard } from '../admin.guard';
import { AdminRoleGuard } from '../admin-role.guard';
import { AdminService } from '../admin.service';
import { AdminRevenueService } from '../admin-revenue.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

describe('AdminController (admin access)', () => {
  let app: INestApplication;
  const adminService = {
    getUsers: jest.fn().mockResolvedValue({ users: [], total: 0 }),
    getUserDetail: jest.fn().mockResolvedValue({}),
    getPaymentIssues: jest.fn().mockResolvedValue({ issues: [] }),
  } as Partial<AdminService> as AdminService;

  const adminRevenueService = {
    getRevenue: jest.fn().mockResolvedValue({ revenue: {} }),
  } as Partial<AdminRevenueService> as AdminRevenueService;

  beforeAll(async () => {
    const db = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminGuard,
        AdminRoleGuard,
        Reflector,
        { provide: AdminService, useValue: adminService },
        { provide: AdminRevenueService, useValue: adminRevenueService },
        { provide: ConfigService, useValue: { get: jest.fn((k: string) => k === 'ADMIN_EMAILS' ? 'admin@example.com' : '') } },
        { provide: SupabaseService, useValue: { db } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'admin-1', sub: 'admin-1', email: 'admin@example.com' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app && typeof app.close === 'function') {
      await app.close();
    }
  });

  it('allows admin to access /admin/revenue', async () => {
    await request(app.getHttpServer()).get('/admin/revenue').expect(200);
    expect(adminRevenueService.getRevenue).toHaveBeenCalled();
  });

  it('allows admin to fetch user detail', async () => {
    const userId = '4da564f2-6795-4b52-96a1-f0103f11a111';
    (adminService.getUserDetail as jest.Mock).mockResolvedValueOnce({ profile: { id: userId } });

    await request(app.getHttpServer()).get(`/admin/users/${userId}`).expect(200);
    expect(adminService.getUserDetail).toHaveBeenCalledWith(userId);
  });

  it('allows admin to list users with filters', async () => {
    (adminService.getUsers as jest.Mock).mockResolvedValueOnce({ users: [], total: 0 });

    await request(app.getHttpServer())
      .get('/admin/users?search=alpha%40example.com&plan=premium&page=2&pageSize=25')
      .expect(200);

    expect(adminService.getUsers).toHaveBeenCalledWith(expect.objectContaining({
      search: 'alpha@example.com',
      plan: 'premium',
      page: '2',
      pageSize: '25',
    }));
  });

  it('allows admin to list payment issues', async () => {
    (adminService.getPaymentIssues as jest.Mock).mockResolvedValueOnce({ issues: [{ id: 'case-1' }] });

    await request(app.getHttpServer()).get('/admin/payment-issues').expect(200);
    expect(adminService.getPaymentIssues).toHaveBeenCalled();
  });
});
