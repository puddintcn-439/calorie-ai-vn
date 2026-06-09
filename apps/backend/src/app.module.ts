import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisThrottlerStorageService } from './common/throttler/redis-throttler-storage.service';
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
import { MetricsModule } from './common/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Use Redis-backed Throttler storage when REDIS_URL is explicitly provided.
    // Otherwise fall back to the default in-memory storage to allow local
    // development without Docker.
    ...(process.env.REDIS_URL
      ? [
          ThrottlerModule.forRootAsync({
            useFactory: async () => {
              const redisUrl = process.env.REDIS_URL as string;
              const redisClient = new Redis(redisUrl);
              const storage = new RedisThrottlerStorageService(redisClient);
              return { throttlers: [{ ttl: 60000, limit: 60, storage }] } as any;
            },
          }),
        ]
      : [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 60 }] } as any)]),
    MetricsModule,
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
