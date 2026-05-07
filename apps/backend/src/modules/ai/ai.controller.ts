import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { ScanImageDto, ScanTextDto, CoachMessageDto, RefineScanDto } from './dto/ai.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('scan/image')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  async scanImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    const base64 = file.buffer.toString('base64');
    return this.aiService.scanImage(base64, file.mimetype);
  }

  @Post('scan/text')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async scanText(@Body() dto: ScanTextDto) {
    return this.aiService.scanText(dto.text);
  }

  @Post('scan/refine')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async refineScan(@Body() dto: RefineScanDto) {
    return this.aiService.refineScan(dto.original_items_summary, dto.context);
  }

  @Post('coach')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async coachMessage(@Body() dto: CoachMessageDto, @Request() req: any) {
    return this.aiService.getCoachReply(dto.message, {
      today_calories: dto.today_calories,
      target_calories: dto.target_calories,
    });
  }
}
