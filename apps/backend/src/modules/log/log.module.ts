import { Module } from '@nestjs/common';
import { LogController } from './log.controller';
import { LogService } from './log.service';
import { RoadmapController } from './roadmap.controller';
import { RoadmapService } from './roadmap.service';

@Module({
  controllers: [LogController, RoadmapController],
  providers: [LogService, RoadmapService],
})
export class LogModule {}
