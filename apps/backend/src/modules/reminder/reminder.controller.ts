import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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
    return this.reminder.getReminderPreferences(req.user.sub);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update reminder preferences' })
  async updatePreferences(@Request() req: any, @Body() dto: UpdateReminderPreferencesDto) {
    return this.reminder.updateReminderPreferences(req.user.sub, dto);
  }

  @Post('nudge-test')
  @ApiOperation({ summary: 'Generate test nudge message for a meal' })
  async generateTestNudge(
    @Request() req: any,
    @Body() body: TestNudgeDto,
  ) {
    return this.reminder.generatePreviewNudge(req.user.sub, body.meal_type, body.calories_logged);
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
        { user_id: req.user.sub, token: body.token, platform: body.platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      );

    if (error) throw error;
    return { registered: true };
  }
}
