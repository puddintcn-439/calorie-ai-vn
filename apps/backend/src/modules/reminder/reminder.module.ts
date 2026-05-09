import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { ReminderSchedulerService } from './reminder.scheduler';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { GamificationModule } from '../gamification/gamification.module';
import { FirebaseModule } from '../../common/firebase/firebase.module';

@Module({
  imports: [ScheduleModule.forRoot(), SupabaseModule, GamificationModule, FirebaseModule],
  controllers: [ReminderController],
  providers: [ReminderService, ReminderSchedulerService],
  exports: [ReminderService],
})
export class ReminderModule {}
