import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupportCategory, SupportService } from './support.service';

class CreateSupportRequestDto {
  @IsIn(['account', 'technical', 'ai_result', 'health_data', 'billing', 'feedback', 'other'])
  category: SupportCategory;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  app_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  platform?: string;
}

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('requests')
  @ApiOperation({ summary: 'List support requests for the authenticated user' })
  list(@Request() req: any) {
    return this.supportService.listRequests(req.user.id);
  }

  @Post('requests')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Create a support request for the authenticated user' })
  create(@Request() req: any, @Body() body: CreateSupportRequestDto) {
    return this.supportService.createRequest({
      userId: req.user.id,
      category: body.category,
      subject: body.subject,
      message: body.message,
      appVersion: body.app_version,
      platform: body.platform,
    });
  }
}
