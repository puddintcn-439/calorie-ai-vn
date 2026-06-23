import { Body, Controller, Get, Headers, Post, Query, Redirect, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
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

class PayosCheckoutDto {
  @ApiProperty({ enum: ['premium', 'pro'] })
  @IsIn(['premium', 'pro'])
  tier: 'premium' | 'pro';

  @ApiProperty({ enum: ['monthly', 'annual'] })
  @IsIn(['monthly', 'annual'])
  interval: 'monthly' | 'annual';

  @ApiProperty({ required: false, description: 'Validated app URL used after successful PayOS checkout.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  return_url?: string;

  @ApiProperty({ required: false, description: 'Validated app URL used after cancelled PayOS checkout.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cancel_url?: string;
}

class ReconcilePayosCheckoutDto {
  @ApiProperty({ description: 'PayOS order code returned by checkout.' })
  @IsInt()
  @Min(1)
  order_code: number;
}

class CreatePaymentIssueDto {
  @ApiProperty({
    enum: ['refund_request', 'duplicate_payment', 'payment_succeeded_but_not_activated', 'wrong_plan', 'other'],
  })
  @IsIn(['refund_request', 'duplicate_payment', 'payment_succeeded_but_not_activated', 'wrong_plan', 'other'])
  issue_type: 'refund_request' | 'duplicate_payment' | 'payment_succeeded_but_not_activated' | 'wrong_plan' | 'other';

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  invoice_id?: string;

  @ApiProperty({ required: false, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  user_message?: string;
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

  @Post('payos/reconcile')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reconcile the authenticated user PayOS order after returning from checkout' })
  reconcilePayosCheckout(@Request() req: any, @Body() body: ReconcilePayosCheckoutDto) {
    return this.billingService.reconcilePayosCheckout({
      userId: req.user.id ?? req.user.sub,
      orderCode: body.order_code,
    });
  }

  @Post('checkout/payos')
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a PayOS prepaid checkout link' })
  createPayosCheckout(@Request() req: any, @Body() body: PayosCheckoutDto) {
    return this.billingService.createPayosCheckout({
      userId: req.user.id ?? req.user.sub,
      email: req.user.email ?? null,
      tier: body.tier,
      interval: body.interval,
      returnUrl: body.return_url,
      cancelUrl: body.cancel_url,
      requestOrigin: req.headers?.origin,
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

  @Get('renewal-reminder')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user PayOS prepaid renewal reminder' })
  async getRenewalReminder(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    return this.billingService.getPayosRenewalReminder(userId);
  }

  @Post('payment-issues')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a current-user billing payment issue support case' })
  async createPaymentIssue(@Request() req: any, @Body() body: CreatePaymentIssueDto) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    return this.billingService.createPaymentIssue({
      userId,
      issueType: body.issue_type,
      invoiceId: body.invoice_id ?? null,
      userMessage: body.user_message ?? null,
    });
  }

  @Get('payment-issues')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List current-user billing payment issue support cases' })
  async getPaymentIssues(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    return this.billingService.listPaymentIssuesForUser(userId);
  }

  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Receive Stripe billing webhook events' })
  handleStripeWebhook(@Body() payload: any, @Headers() headers: Record<string, string | string[] | undefined>, @Request() req: any) {
    return this.billingService.handleStripeWebhook(payload, headers, req.rawBody);
  }

  @Post('webhooks/payos')
  @ApiOperation({ summary: 'Receive PayOS prepaid payment webhook events' })
  handlePayosWebhook(@Body() payload: any) {
    return this.billingService.handlePayosWebhook(payload);
  }

  @Get('return/payos')
  @Redirect()
  @ApiOperation({ summary: 'PayOS checkout return — redirects back to the app/web' })
  handlePayosReturn(@Query() query: Record<string, string>) {
    return { url: this.payosWebReturnUrl(query), statusCode: 302 };
  }

  @Get('cancel/payos')
  @Redirect()
  @ApiOperation({ summary: 'PayOS checkout cancel — redirects back to the app/web' })
  handlePayosCancel(@Query() query: Record<string, string>) {
    return { url: this.payosWebReturnUrl(query), statusCode: 302 };
  }

  private payosWebReturnUrl(query: Record<string, string>) {
    const base = process.env.PAYOS_WEB_RETURN_URL || 'http://localhost:19006/paywall';
    // Use string concat so custom schemes (calorieai://) are supported alongside http(s)
    const queryString = new URLSearchParams(query).toString();
    if (!queryString) return base;
    return base.includes('?') ? `${base}&${queryString}` : `${base}?${queryString}`;
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
