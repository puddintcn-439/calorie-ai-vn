import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminController } from '../admin.controller';
import { AdminGuard } from '../admin.guard';
import { AdminRoleGuard } from '../admin-role.guard';
import { AdminService } from '../admin.service';
import { AdminRevenueService } from '../admin-revenue.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';

const USER_ID = '4da564f2-6795-4b52-96a1-f0103f11a111';

describe('AdminController auth', () => {
  let app: INestApplication;
  const adminService = { getUserDetail: jest.fn() };

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
        { provide: AdminRevenueService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
        { provide: SupabaseService, useValue: { db } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'non-admin-user', sub: 'non-admin-user', email: 'user@example.com' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks authenticated non-admin users from admin user detail', async () => {
    await request(app.getHttpServer())
      .get(`/admin/users/${USER_ID}`)
      .expect(403);

    expect(adminService.getUserDetail).not.toHaveBeenCalled();
  });
});
