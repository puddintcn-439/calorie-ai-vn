import { Body, Controller, Get, Headers, Post, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

class StripeCheckoutDto {
  @ApiProperty({ enum: ['premium', 'pro'] })
  @IsIn(['premium', 'pro'])
  tier: 'premium' | 'pro';

  @ApiProperty({ enum: ['monthly', 'annual'] })
  @IsIn(['monthly', 'annual'])
  interval: 'monthly' | 'annual';
}

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout/stripe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe Checkout subscription session' })
  createStripeCheckout(@Request() req: any, @Body() body: StripeCheckoutDto) {
    return this.billingService.createStripeCheckoutSession({
      userId: req.user.id ?? req.user.sub,
      email: req.user.email ?? null,
      tier: body.tier,
      interval: body.interval,
    });
  }

  @Get('entitlement')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user billing entitlement' })
  async getEntitlement(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    const entitlement = await this.billingService.getUserEntitlement(userId);
    return {
      user_id: entitlement.user_id,
      tier: entitlement.tier,
      source: entitlement.source,
      provider: entitlement.provider,
      active_until: entitlement.active_until ?? null,
    };
  }

  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Receive Stripe billing webhook events' })
  handleStripeWebhook(@Body() payload: any, @Headers() headers: Record<string, string | string[] | undefined>, @Request() req: any) {
    return this.billingService.handleStripeWebhook(payload, headers, req.rawBody);
  }

  @Post('webhooks/app-store')
  @ApiOperation({ summary: 'Receive App Store billing webhook events' })
  handleAppStoreWebhook(@Body() payload: any, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.billingService.handleAppStoreWebhook(payload, headers);
  }

  @Post('webhooks/google-play')
  @ApiOperation({ summary: 'Receive Google Play billing webhook events' })
  handleGooglePlayWebhook(@Body() payload: any, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.billingService.handleGooglePlayWebhook(payload, headers);
  }
}
