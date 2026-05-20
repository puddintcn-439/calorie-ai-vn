import { Controller, Post, Body, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ScanTextDto } from './dto/ai.dto';

@ApiTags('AI-DEBUG')
@Controller('ai-debug')
export class AiDebugController {
  constructor(private readonly aiService: AiService) {}

  @Post('scan/text')
  @HttpCode(HttpStatus.OK)
  async scanTextNoAuth(@Body() dto: ScanTextDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not allowed in production');
    }

    return this.aiService.scanText(dto.text);
  }
}
