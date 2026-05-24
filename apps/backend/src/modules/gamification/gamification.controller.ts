import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GamificationService } from './gamification.service';

@ApiTags('Gamification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get streaks and badge summary for the current user' })
  getSummary(@Request() req: any, @Query('tz_offset_minutes') tzOffsetMinutes?: string) {
    const tzOffset = Number.isFinite(Number(tzOffsetMinutes)) ? Number(tzOffsetMinutes) : 0;
    return this.gamificationService.getSummary(req.user.id ?? req.user.sub, tzOffset);
  }
}
