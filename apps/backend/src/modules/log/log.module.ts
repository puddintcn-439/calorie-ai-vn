import { Module } from '@nestjs/common';
import { LogController, TodayController } from './log.controller';
import { LogService } from './log.service';
import { ActivityPreferenceController, RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';
import { CalorieTargetModule } from '../calorie-target/calorie-target.module';

@Module({
  imports: [CalorieTargetModule],
  controllers: [LogController, TodayController, RoadmapController, ActivityPreferenceController],
  providers: [LogService, RoadmapService],
})
export class LogModule {}
