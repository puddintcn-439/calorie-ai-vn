import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { FoodModule } from './modules/food/food.module';
import { LogModule } from './modules/log/log.module';
import { UserModule } from './modules/user/user.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { InsightsModule } from './modules/insights/insights.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { CalorieTargetModule } from './modules/calorie-target/calorie-target.module';
import { CoachingModule } from './modules/coaching/coaching.module';
import { BodyProgressModule } from './modules/body-progress/body-progress.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    HealthModule,
    AuthModule,
    AiModule,
    FoodModule,
    LogModule,
    UserModule,
    TelemetryModule,
    InsightsModule,
    ReminderModule,
    SubscriptionModule,
    GamificationModule,
    CalorieTargetModule,
    CoachingModule,
    BodyProgressModule,
  ],
})
export class AppModule {}
