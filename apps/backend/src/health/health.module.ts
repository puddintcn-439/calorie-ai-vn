import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { SupabaseModule } from '../common/supabase/supabase.module';
import { SchemaGuardService } from './schema-guard.service';

@Module({
  imports: [SupabaseModule],
  controllers: [HealthController],
  providers: [HealthService, SchemaGuardService],
  exports: [HealthService],
})
export class HealthModule {}
