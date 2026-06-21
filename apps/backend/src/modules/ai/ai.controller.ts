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
  UnprocessableEntityException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import {
  ScanImageDto,
  ScanTextDto,
  CoachMessageDto,
  RefineScanDto,
  ScanVoiceDto,
  ScanVoiceAudioDto,
  ScanReceiptDto,
} from './dto/ai.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from './guards/user-throttler.guard';
import { stripImageMetadata } from '../../common/privacy/image-privacy.util';
import { AiUsageService } from './ai-usage.service';
import { AiUsageFeature, AIScanResponse, AICoachResponse } from '@calorie-ai/types';
import { GeminiAudioTranscriptionService } from './gemini-audio-transcription.service';

type UploadedBinaryFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

const MAX_VOICE_AUDIO_BYTES = 5 * 1024 * 1024;

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, UserThrottlerGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiUsageService: AiUsageService,
    private readonly audioTranscriptionService: GeminiAudioTranscriptionService,
  ) {}

  private resolveUserId(req: any): string {
    const userId: string | undefined = req?.user?.id ?? req?.user?.sub;
    if (!userId) {
      throw new Error('Authenticated user not found');
    }
    return userId;
  }

  private inferAiStatus(response: AIScanResponse | AICoachResponse): 'success' | 'fallback' | 'failed' {
    if ('success' in response) {
      if (response.success === false) {
        const fallbackReason = String(response.metadata?.ai_fallback ?? '');
        return fallbackReason ? 'fallback' : 'failed';
      }
      return 'success';
    }

    return 'success';
  }

  private async runTrackedAiRequest<T extends AIScanResponse | AICoachResponse>(
    userId: string,
    feature: AiUsageFeature,
    action: () => Promise<T>,
  ): Promise<T> {
    const reservation = await this.aiUsageService.reserveUsage(userId, feature);

    try {
      const response = await action();
      const status = this.inferAiStatus(response);
      await this.aiUsageService.finalizeUsage(reservation.id!, {
        status,
        provider: reservation.provider,
        model: reservation.model,
        cacheHit: 'metadata' in response ? Boolean(response.metadata?.cache_hit) : false,
        estimatedCostUsd: reservation.estimated_cost_usd,
        errorCategory: 'metadata' in response && response.success === false ? String(response.metadata?.ai_fallback ?? 'ai_fallback') : null,
      });
      return response;
    } catch (error) {
      await this.aiUsageService.finalizeUsage(reservation.id!, {
        status: 'failed',
        provider: reservation.provider,
        model: reservation.model,
        cacheHit: false,
        estimatedCostUsd: reservation.estimated_cost_usd,
        errorCategory: 'error',
        errorMessage: String((error as any)?.message ?? error),
      });
      throw error;
    }
  }

  @Post('scan/image')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  async scanImage(
    @UploadedFile() file: UploadedBinaryFile,
    @Request() req: any,
  ) {
    const userId = this.resolveUserId(req);
    const sanitizedBuffer = stripImageMetadata(file.buffer, file.mimetype);
    const base64 = sanitizedBuffer.toString('base64');
    return this.runTrackedAiRequest(userId, 'scan_image', () => this.aiService.scanImage(base64, file.mimetype, userId));
  }

  @Post('scan/text')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async scanText(@Body() dto: ScanTextDto, @Request() req: any) {
    const userId = this.resolveUserId(req);
    return this.runTrackedAiRequest(userId, 'scan_text', () => this.aiService.scanText(dto.text, userId));
  }

  @Post('scan/voice')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async scanVoice(@Body() dto: ScanVoiceDto, @Request() req: any) {
    if (!dto.transcript?.trim() || dto.transcript.trim().length < 2) {
      throw new UnprocessableEntityException('Transcript must be at least 2 characters');
    }
    const userId = this.resolveUserId(req);
    return this.runTrackedAiRequest(userId, 'scan_voice', () => this.aiService.scanVoice(dto.transcript, {
      locale: dto.locale,
      timezone: dto.timezone,
      meal_hint: dto.meal_hint,
      context: dto.context,
    }, userId));
  }

  @Post('scan/voice-audio')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(FileInterceptor('audio', {
    limits: { fileSize: MAX_VOICE_AUDIO_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!GeminiAudioTranscriptionService.isSupportedMimeType(file.mimetype)) {
        callback(new UnprocessableEntityException('Unsupported audio format. Use m4a, mp3, wav, or webm.'), false);
        return;
      }
      callback(null, true);
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: { type: 'string', format: 'binary' },
        locale: { type: 'string', example: 'vi-VN' },
        timezone: { type: 'string', example: 'Asia/Ho_Chi_Minh' },
        meal_hint: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
      },
    },
  })
  async scanVoiceAudio(
    @UploadedFile() file: UploadedBinaryFile | undefined,
    @Body() dto: ScanVoiceAudioDto,
    @Request() req: any,
  ) {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException('Audio file is required.');
    }
    if (!GeminiAudioTranscriptionService.isSupportedMimeType(file.mimetype)) {
      throw new UnprocessableEntityException('Unsupported audio format. Use m4a, mp3, wav, or webm.');
    }

    const userId = this.resolveUserId(req);
    return this.runTrackedAiRequest(userId, 'scan_voice', async () => {
      const transcription = await this.audioTranscriptionService.transcribe({
        buffer: file.buffer,
        mimeType: file.mimetype,
        locale: dto.locale,
      });
      const response = await this.aiService.scanVoice(transcription.transcript, {
        locale: dto.locale,
        timezone: dto.timezone,
        meal_hint: dto.meal_hint,
        context: {
          source: 'voice_audio',
          device_language: dto.locale?.split('-')[0],
        },
      }, userId);

      return {
        ...response,
        transcript: transcription.transcript,
        metadata: {
          ...(response.metadata ?? {}),
          input_mode: 'voice_audio',
          transcription_provider: transcription.provider,
        },
      };
    });
  }

  @Post('scan/receipt')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 15 } })
  @UseInterceptors(FileInterceptor('receipt_image'))
  @ApiConsumes('multipart/form-data')
  async scanReceipt(
    @UploadedFile() file: UploadedBinaryFile,
    @Body() dto: ScanReceiptDto,
    @Request() req: any,
  ) {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException('Receipt image is required');
    }
    const userId = this.resolveUserId(req);
    const sanitizedBuffer = stripImageMetadata(file.buffer, file.mimetype);
    return this.runTrackedAiRequest(userId, 'scan_receipt', () => this.aiService.scanReceipt(sanitizedBuffer.toString('base64'), file.mimetype, {
      locale: dto.locale,
      currency: dto.currency,
      merchant_hint: dto.merchant_hint,
      meal_hint: dto.meal_hint,
    }, userId));
  }

  @Post('scan/refine')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async refineScan(@Body() dto: RefineScanDto, @Request() req: any) {
    const userId = this.resolveUserId(req);
    return this.runTrackedAiRequest(userId, 'scan_refine', () => this.aiService.refineScan(dto.original_items_summary, dto.context, userId));
  }

  @Post('coach')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async coachMessage(@Body() dto: CoachMessageDto, @Request() req: any) {
    const userId = this.resolveUserId(req);
    return this.runTrackedAiRequest(userId, 'coach', () => this.aiService.getCoachReply(dto.message, {
      today_calories: dto.today_calories,
      target_calories: dto.target_calories,
      health_score: dto.health_score,
      reminder_effectiveness: dto.reminder_effectiveness,
      success_forecast: dto.success_forecast,
      behavior_memory: dto.behavior_memory,
      intervention_analytics: dto.intervention_analytics,
      dynamic_intervention: dto.dynamic_intervention,
    }, userId));
  }
}
