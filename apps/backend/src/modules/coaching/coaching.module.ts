import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingSchedulerService } from './coaching.scheduler';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { CalorieTargetModule } from '../calorie-target/calorie-target.module';

@Module({
  imports: [ScheduleModule, SupabaseModule, CalorieTargetModule],
  controllers: [CoachingController],
  providers: [CoachingService, CoachingSchedulerService],
  exports: [CoachingService],
})
export class CoachingModule {}
