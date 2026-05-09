import { Module } from '@nestjs/common';
import { BodyProgressController } from './body-progress.controller';
import { BodyProgressService } from './body-progress.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [BodyProgressController],
  providers: [BodyProgressService],
  exports: [BodyProgressService],
})
export class BodyProgressModule {}
