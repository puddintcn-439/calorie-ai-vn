import { Module } from '@nestjs/common';
import { FoodController } from './food.controller';
import { FoodService } from './food.service';
import { FoodIngestionService } from './food-ingestion.service';
import { FoodIngestionController } from './food-ingestion.controller';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [FoodController, FoodIngestionController],
  providers: [FoodService, FoodIngestionService],
  exports: [FoodService],
})
export class FoodModule {}
