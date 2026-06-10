import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiDebugController } from './ai.debug.controller';
import { AiUsageController } from './ai-usage.controller';
import { AiQueueService } from './ai.queue.service';
import { AiUsageService } from './ai-usage.service';
import { SubscriptionModule } from '../subscription/subscription.module';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [SupabaseModule, SubscriptionModule],
  controllers: [AiController, AiDebugController, AiUsageController],
  providers: [AiService, AiQueueService, AiUsageService],
  exports: [AiService, AiQueueService, AiUsageService],
})
export class AiModule {}
