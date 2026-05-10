import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { SchemaGuardService } from './schema-guard.service';
import { MetricsModule } from '../common/metrics/metrics.module';

@Module({
  imports: [SupabaseModule, MetricsModule],
  controllers: [HealthController],
  providers: [HealthService, SchemaGuardService],
  exports: [HealthService],
})
export class HealthModule {}
