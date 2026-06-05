import { Module } from '@nestjs/common';
import { LogController, TodayController } from './log.controller';
import { LogService } from './log.service';
import { ActivityPreferenceController, RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';

@Module({
  controllers: [LogController, TodayController, RoadmapController, ActivityPreferenceController],
  providers: [LogService, RoadmapService],
})
export class LogModule {}
