import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AiController } from '../ai.controller';
import { AiService } from '../ai.service';
import { AiUsageService } from '../ai-usage.service';
import { GeminiAudioTranscriptionService } from '../gemini-audio-transcription.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserThrottlerGuard } from '../guards/user-throttler.guard';

const scanResponse = {
  success: true,
  items: [
    {
      name: 'Beef noodle soup',
      name_vi: 'Bún bò',
      category: 'noodle',
      quantity: 1,
      unit: 'bowl',
      estimated_grams: 450,
      calories: 520,
      protein_g: 25,
      carbs_g: 62,
      fat_g: 18,
      confidence: 0.9,
    },
  ],
  total_calories: 520,
  total_protein_g: 25,
  total_carbs_g: 62,
  total_fat_g: 18,
  ai_confidence: 0.9,
  metadata: { parse_mode: 'voice' },
  processing_ms: 120,
};

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.headers.authorization !== 'Bearer test-token') {
      throw new UnauthorizedException();
    }
    request.user = { id: 'user-1' };
    return true;
  }
}

describe('AiController voice audio', () => {
  let app: INestApplication;
  const aiService = {
    scanVoice: jest.fn(),
  };
  const aiUsageService = {
    reserveUsage: jest.fn(),
    finalizeUsage: jest.fn(),
  };
  const transcriptionService = {
    transcribe: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    aiService.scanVoice.mockResolvedValue(scanResponse);
    aiUsageService.reserveUsage.mockResolvedValue({
      id: 'usage-1',
      provider: 'gemini',
      model: 'gemini-test',
      estimated_cost_usd: 0.001,
    });
    aiUsageService.finalizeUsage.mockResolvedValue(undefined);
    transcriptionService.transcribe.mockResolvedValue({
      transcript: 'một tô bún bò',
      provider: 'primary',
      model: 'gemini-audio-test',
      attempts: 1,
      estimatedCostUsd: 0.0015,
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: aiService },
        { provide: AiUsageService, useValue: aiUsageService },
        { provide: GeminiAudioTranscriptionService, useValue: transcriptionService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .overrideGuard(UserThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated voice-audio requests', async () => {
    await request(app.getHttpServer())
      .post('/ai/scan/voice-audio')
      .attach('audio', Buffer.from('voice'), {
        filename: 'voice.m4a',
        contentType: 'audio/m4a',
      })
      .expect(401);

    expect(transcriptionService.transcribe).not.toHaveBeenCalled();
  });

  it('rejects a missing audio file with 422', async () => {
    await request(app.getHttpServer())
      .post('/ai/scan/voice-audio')
      .set('Authorization', 'Bearer test-token')
      .field('locale', 'vi-VN')
      .expect(422);

    expect(transcriptionService.transcribe).not.toHaveBeenCalled();
  });

  it('rejects unsupported MIME types with 422', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/scan/voice-audio')
      .set('Authorization', 'Bearer test-token')
      .attach('audio', Buffer.from('not-audio'), {
        filename: 'voice.txt',
        contentType: 'text/plain',
      })
      .expect(422);

    expect(response.text).not.toContain('not-audio');
    expect(transcriptionService.transcribe).not.toHaveBeenCalled();
  });

  it('rejects audio larger than 5 MB before transcription', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/scan/voice-audio')
      .set('Authorization', 'Bearer test-token')
      .attach('audio', Buffer.alloc(5 * 1024 * 1024 + 1, 1), {
        filename: 'voice.m4a',
        contentType: 'audio/m4a',
      });

    expect(response.status).toBe(413);
    expect(response.body.message).toBe('Audio file must be 5 MB or smaller.');
    expect(transcriptionService.transcribe).not.toHaveBeenCalled();
  });

  it('transcribes valid audio, parses food, and tracks scan_voice usage', async () => {
    const response = await request(app.getHttpServer())
      .post('/ai/scan/voice-audio')
      .set('Authorization', 'Bearer test-token')
      .field('locale', 'vi-VN')
      .field('timezone', 'Asia/Ho_Chi_Minh')
      .field('meal_hint', 'lunch')
      .attach('audio', Buffer.from('safe-audio-bytes'), {
        filename: 'voice.m4a',
        contentType: 'audio/m4a',
      })
      .expect(200);

    expect(aiUsageService.reserveUsage).toHaveBeenCalledWith('user-1', 'scan_voice');
    expect(transcriptionService.transcribe).toHaveBeenCalledWith(expect.objectContaining({
      buffer: expect.any(Buffer),
      mimeType: 'audio/m4a',
      locale: 'vi-VN',
    }));
    expect(aiService.scanVoice).toHaveBeenCalledWith(
      'một tô bún bò',
      {
        locale: 'vi-VN',
        timezone: 'Asia/Ho_Chi_Minh',
        meal_hint: 'lunch',
        context: {
          source: 'voice_audio',
          device_language: 'vi',
        },
      },
      'user-1',
    );
    expect(response.body).toMatchObject({
      success: true,
      transcript: 'một tô bún bò',
      metadata: {
        parse_mode: 'voice',
        input_mode: 'voice_audio',
        transcription_provider: 'primary',
        transcription_model: 'gemini-audio-test',
        transcription_attempts: 1,
        usage_accounting: {
          quota_events: 1,
          estimated_cost_usd: 0.0027,
        },
      },
    });
    expect(aiUsageService.reserveUsage).toHaveBeenCalledTimes(1);
    expect(aiUsageService.finalizeUsage).toHaveBeenCalledWith(
      'usage-1',
      expect.objectContaining({
        status: 'success',
        provider: 'gemini_voice_audio:primary',
        model: 'gemini-audio-test+gemini-test',
        estimatedCostUsd: 0.0027,
      }),
    );
  });

  it('accounts for both transcription attempts without reserving quota twice', async () => {
    transcriptionService.transcribe.mockResolvedValueOnce({
      transcript: 'một tô bún bò',
      provider: 'backup',
      model: 'gemini-audio-test',
      attempts: 2,
      estimatedCostUsd: 0.003,
    });

    const response = await request(app.getHttpServer())
      .post('/ai/scan/voice-audio')
      .set('Authorization', 'Bearer test-token')
      .attach('audio', Buffer.from('safe-audio-bytes'), {
        filename: 'voice.m4a',
        contentType: 'audio/m4a',
      })
      .expect(200);

    expect(aiUsageService.reserveUsage).toHaveBeenCalledTimes(1);
    expect(aiUsageService.reserveUsage).toHaveBeenCalledWith('user-1', 'scan_voice');
    expect(aiUsageService.finalizeUsage).toHaveBeenCalledWith(
      'usage-1',
      expect.objectContaining({
        provider: 'gemini_voice_audio:backup',
        estimatedCostUsd: 0.0042,
      }),
    );
    expect(response.body.metadata.usage_accounting).toEqual({
      quota_events: 1,
      estimated_cost_usd: 0.0042,
    });
  });

  it('keeps the existing transcript endpoint working without transcription', async () => {
    await request(app.getHttpServer())
      .post('/ai/scan/voice')
      .set('Authorization', 'Bearer test-token')
      .send({
        transcript: 'hai quả trứng',
        locale: 'vi-VN',
        meal_hint: 'breakfast',
      })
      .expect(200);

    expect(transcriptionService.transcribe).not.toHaveBeenCalled();
    expect(aiService.scanVoice).toHaveBeenCalledWith(
      'hai quả trứng',
      expect.objectContaining({
        locale: 'vi-VN',
        meal_hint: 'breakfast',
      }),
      'user-1',
    );
  });

  it('does not expose raw audio or base64 audio in responses or console output', async () => {
    const privateMarker = 'PRIVATE_AUDIO_MARKER_42';
    const privateBase64 = Buffer.from(privateMarker).toString('base64');
    const sensitiveTranscript = 'sensitive meal transcript';
    transcriptionService.transcribe.mockResolvedValueOnce({
      transcript: sensitiveTranscript,
      provider: 'primary',
      model: 'gemini-audio-test',
      attempts: 1,
      estimatedCostUsd: 0.0015,
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    try {
      const response = await request(app.getHttpServer())
        .post('/ai/scan/voice-audio')
        .set('Authorization', 'Bearer test-token')
        .attach('audio', Buffer.from(privateMarker), {
          filename: 'private.m4a',
          contentType: 'audio/m4a',
        })
        .expect(200);

      const responseOutput = JSON.stringify(response.body);
      const consoleOutput = JSON.stringify([
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(response.body.transcript).toBe(sensitiveTranscript);
      expect(responseOutput).not.toContain(privateMarker);
      expect(responseOutput).not.toContain(privateBase64);
      expect(consoleOutput).not.toContain(privateMarker);
      expect(consoleOutput).not.toContain(privateBase64);
      expect(consoleOutput).not.toContain(sensitiveTranscript);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
