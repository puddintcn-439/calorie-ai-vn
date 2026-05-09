import { Module } from '@nestjs/common';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [SupabaseModule, GamificationModule],
  controllers: [ReminderController],
  providers: [ReminderService],
  exports: [ReminderService],
})
export class ReminderModule {}
