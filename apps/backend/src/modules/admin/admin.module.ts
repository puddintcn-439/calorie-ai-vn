import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [SupabaseModule, AiModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
