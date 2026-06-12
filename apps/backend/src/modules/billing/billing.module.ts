import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [SupabaseModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
