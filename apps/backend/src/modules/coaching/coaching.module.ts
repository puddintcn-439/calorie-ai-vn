import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { CoachingSchedulerService } from './coaching.scheduler';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [ScheduleModule.forRoot(), SupabaseModule],
  controllers: [CoachingController],
  providers: [CoachingService, CoachingSchedulerService],
  exports: [CoachingService],
})
export class CoachingModule {}
