import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRevenueService } from './admin-revenue.service';
import { AdminGuard } from './admin.guard';
import { AdminRoleGuard } from './admin-role.guard';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { AiModule } from '../ai/ai.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [SupabaseModule, AiModule, BillingModule, NotificationsModule, SupportModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRevenueService, AdminGuard, AdminRoleGuard],
})
export class AdminModule {}
