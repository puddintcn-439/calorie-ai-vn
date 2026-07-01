import {
  Body,
  Controller,
  Delete,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsIn, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrivacyService } from './privacy.service';

class DeleteAccountDto {
  @IsString()
  @MinLength(6)
  password: string;

  @IsIn(['DELETE'])
  confirmation: 'DELETE';
}

@ApiTags('Privacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export the authenticated user personal data as JSON' })
  exportData(@Request() req: any) {
    return this.privacyService.exportUserData(req.user.id, req.user.email);
  }

  @Delete('account')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Permanently delete the authenticated account after password confirmation' })
  deleteAccount(@Request() req: any, @Body() body: DeleteAccountDto) {
    return this.privacyService.deleteAccount(req.user.id, req.user.email, body.password);
  }
}
