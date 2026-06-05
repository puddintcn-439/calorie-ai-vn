import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Request,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ReminderFeedbackEventDto } from '@calorie-ai/types';
import { ReminderService } from './reminder.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class UpdateReminderPreferencesDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  breakfast_reminder_enabled?: boolean;

  @ApiProperty({ required: false, example: '07:00' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  breakfast_reminder_time?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  lunch_reminder_enabled?: boolean;

  @ApiProperty({ required: false, example: '12:00' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  lunch_reminder_time?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  dinner_reminder_enabled?: boolean;

  @ApiProperty({ required: false, example: '19:00' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  dinner_reminder_time?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  snack_reminder_enabled?: boolean;

  @ApiProperty({ required: false, example: '15:00' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  snack_reminder_time?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  allow_push_notifications?: boolean;

  @ApiProperty({ required: false, enum: ['encouraging', 'warning', 'neutral'] })
  @IsEnum(['encouraging', 'warning', 'neutral'])
  @IsOptional()
  nudge_motivation_style?: 'encouraging' | 'warning' | 'neutral';
}

class TestNudgeDto {
  @ApiProperty({ enum: ['breakfast', 'lunch', 'dinner', 'snack'] })
  @IsEnum(['breakfast', 'lunch', 'dinner', 'snack'])
  meal_type!: 'breakfast' | 'lunch' | 'dinner' | 'snack';

  @ApiProperty({ required: false, example: 320 })
  @IsNumber()
  @IsOptional()
  calories_logged?: number;
}

class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  token!: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsEnum(['ios', 'android', 'web'])
  platform!: 'ios' | 'android' | 'web';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  device_id?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  app_version?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ required: false, example: -420 })
  @IsNumber()
  @IsOptional()
  timezone_offset_minutes?: number;
}

class UnregisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  token!: string;
}

class ReminderEventDto implements ReminderFeedbackEventDto {
  @ApiProperty({ enum: ['opened', 'acted'] })
  @IsEnum(['opened', 'acted'])
  event!: 'opened' | 'acted';

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  reminder_log_id?: string;

  @ApiProperty({ required: false, enum: ['breakfast', 'lunch', 'dinner', 'snack'] })
  @IsEnum(['breakfast', 'lunch', 'dinner', 'snack'])
  @IsOptional()
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';

  @ApiProperty({ required: false, example: '2026-06-05' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  local_date?: string;

  @ApiProperty({ required: false, example: 'food_log' })
  @IsString()
  @IsOptional()
  action_type?: string;
}

@ApiTags('Reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class ReminderController {
  constructor(
    private reminder: ReminderService,
    private supabase: SupabaseService,
  ) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Get current reminder preferences' })
  async getPreferences(@Request() req: any) {
    return this.reminder.getReminderPreferences(req.user.id ?? req.user.sub);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update reminder preferences' })
  async updatePreferences(@Request() req: any, @Body() dto: UpdateReminderPreferencesDto) {
    return this.reminder.updateReminderPreferences(req.user.id ?? req.user.sub, dto);
  }

  @Post('nudge-test')
  @ApiOperation({ summary: 'Generate test nudge message for a meal' })
  async generateTestNudge(
    @Request() req: any,
    @Body() body: TestNudgeDto,
  ) {
    return this.reminder.generatePreviewNudge(req.user.id ?? req.user.sub, body.meal_type, body.calories_logged);
  }

  @Post('events')
  @ApiOperation({ summary: 'Record reminder open/action feedback' })
  async recordReminderEvent(@Request() req: any, @Body() body: ReminderEventDto) {
    return this.reminder.recordReminderEvent(req.user.id ?? req.user.sub, body);
  }

  @Get('effectiveness')
  @ApiOperation({ summary: 'Get reminder open and action rates' })
  async getReminderEffectiveness(@Request() req: any, @Query('days') days?: string) {
    return this.reminder.getReminderEffectiveness(req.user.id ?? req.user.sub, Number(days ?? 30));
  }

  @Post('push-token')
  @ApiOperation({ summary: 'Register device push token for notifications' })
  async registerPushToken(@Request() req: any, @Body() body: RegisterPushTokenDto) {
    if (!body.token.startsWith('ExponentPushToken[') && !body.token.startsWith('ExpoPushToken[')) {
      throw new BadRequestException('Invalid Expo push token format');
    }

    const { error } = await this.supabase.db
      .from('push_notification_tokens')
      .upsert(
        {
          user_id: req.user.id ?? req.user.sub,
          token: body.token,
          platform: body.platform,
          device_id: body.device_id,
          app_version: body.app_version,
          timezone: body.timezone,
          timezone_offset_minutes: body.timezone_offset_minutes,
          active: true,
          last_registered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );

    if (error) {
      const message = String(error?.message ?? error?.details ?? '');
      if (message.includes('public.push_notification_tokens') && message.includes('schema cache')) {
        return { registered: false, reason: 'push_token_table_missing' };
      }
      throw error;
    }
    return { registered: true };
  }

  @Delete('push-token')
  @ApiOperation({ summary: 'Deactivate device push token for the signed-in user' })
  async unregisterPushToken(@Request() req: any, @Body() body: UnregisterPushTokenDto) {
    const { error } = await this.supabase.db
      .from('push_notification_tokens')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id ?? req.user.sub)
      .eq('token', body.token);

    if (error) {
      const message = String(error?.message ?? error?.details ?? '');
      if (message.includes('public.push_notification_tokens') && message.includes('schema cache')) {
        return { unregistered: false, reason: 'push_token_table_missing' };
      }
      throw error;
    }

    return { unregistered: true };
  }

  @Post('push-test')
  @ApiOperation({ summary: 'Send test push notification' })
  async sendTestPush(@Request() req: any, @Body() body: TestNudgeDto) {
    const userId = req.user.id ?? req.user.sub;
    const nudge = await this.reminder.generatePreviewNudge(userId, body.meal_type, body.calories_logged ?? 0);
    const sent = await this.reminder.sendNudgePush(userId, nudge);
    return { sent, nudge };
  }
}
