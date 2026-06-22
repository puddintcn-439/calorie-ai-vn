import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Request,
  UseGuards,
  ForbiddenException,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionTier } from '@calorie-ai/types';

class UpgradeSubscriptionDto {
  @ApiProperty({ enum: ['premium', 'pro'], description: 'Target subscription tier' })
  @IsEnum(['premium', 'pro'])
  tier: SubscriptionTier;

  @ApiProperty({ enum: ['stripe', 'in_app', 'trial'], description: 'Payment provider' })
  @IsEnum(['stripe', 'in_app', 'trial'])
  payment_provider: 'stripe' | 'in_app' | 'trial';
}

@ApiTags('Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current user subscription' })
  async getCurrentSubscription(@Request() req: any) {
    return this.subscription.getUserSubscription(req.user.id ?? req.user.sub);
  }

  @Get('features')
  @ApiOperation({ summary: 'Get available features for current tier' })
  async getAvailableFeatures(@Request() req: any) {
    return this.subscription.getUserFeatures(req.user.id ?? req.user.sub);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'Get all available subscription tiers' })
  async getSubscriptionTiers() {
    return {
      free: {
        name: 'Miễn phí',
        description: 'Bắt đầu theo dõi calo của bạn',
        price: { monthly: 0, yearly: 0 },
      },
      premium: {
        name: 'Premium',
        description: 'AI Coach và hỗ trợ AI tối ưu',
        price: { monthly: 9.99, yearly: 79.99 },
        tag: 'Most Popular',
      },
      pro: {
        name: 'Pro',
        description: 'Mọi thứ + HealthKit + Hỗ trợ ưu tiên',
        price: { monthly: 19.99, yearly: 159.99 },
        tag: 'Best Value',
      },
    };
  }

  @Post('upgrade')
  @ApiOperation({ summary: 'Upgrade subscription to premium or pro' })
  async upgradeSubscription(@Request() req: any, @Body() dto: UpgradeSubscriptionDto) {
    if (dto.tier === 'free') {
      throw new ForbiddenException('Cannot upgrade to free tier directly');
    }
    return this.subscription.upgradeSubscription(req.user.id ?? req.user.sub, dto);
  }

  @Delete('cancel')
  @ApiOperation({ summary: 'Cancel subscription (downgrade to free)' })
  async cancelSubscription(@Request() req: any) {
    return this.subscription.cancelSubscription(req.user.id ?? req.user.sub);
  }

  @Post('verify-feature/:feature')
  @ApiOperation({ summary: 'Check if user has access to a feature' })
  async verifyFeatureAccess(@Request() req: any, @Param('feature') feature: string) {
    const validFeatures = [
      'daily_insights',
      'meal_reminders',
      'ai_coach',
      'manual_food_search',
      'barcode_scanning',
      'weekly_reports',
      'correction_tracking',
      'healthkit_sync',
      'custom_goals',
      'priority_support',
    ];

    if (!validFeatures.includes(feature)) {
      throw new ForbiddenException('Invalid feature');
    }

    const hasAccess = await this.subscription.hasFeatureAccess(
      req.user.id ?? req.user.sub,
      feature as any,
    );
    return { feature, has_access: hasAccess };
  }
}
