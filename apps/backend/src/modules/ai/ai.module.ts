import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiDebugController } from './ai.debug.controller';
import { AiQueueService } from './ai.queue.service';

@Module({
  controllers: [AiController, AiDebugController],
  providers: [AiService, AiQueueService],
  exports: [AiService, AiQueueService],
})
export class AiModule {}
