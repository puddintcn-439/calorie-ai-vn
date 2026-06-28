import { Module } from '@nestjs/common';
import { CalorieTargetService } from './calorie-target.service';
import { CalorieTargetController } from './calorie-target.controller';
import { UserModule } from '../user/user.module';
import { WeeklyAdaptiveService } from './weekly-adaptive.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { RecommendationService } from './recommendation.service';
import { NutritionRecommendationEngine } from './nutrition-recommendation.engine';

@Module({
  imports: [UserModule, SupabaseModule],
  controllers: [CalorieTargetController],
  providers: [CalorieTargetService, WeeklyAdaptiveService, RecommendationService, NutritionRecommendationEngine],
  exports: [CalorieTargetService, WeeklyAdaptiveService, RecommendationService, NutritionRecommendationEngine],
})
export class CalorieTargetModule {}

