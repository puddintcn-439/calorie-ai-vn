import { Module } from '@nestjs/common';
import { CalorieTargetService } from './calorie-target.service';
import { CalorieTargetController } from './calorie-target.controller';
import { UserModule } from '../user/user.module';
import { WeeklyAdaptiveService } from './weekly-adaptive.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [UserModule, SupabaseModule],
  controllers: [CalorieTargetController],
  providers: [CalorieTargetService, WeeklyAdaptiveService, RecommendationService],
  exports: [CalorieTargetService, WeeklyAdaptiveService, RecommendationService],
})
export class CalorieTargetModule {}

