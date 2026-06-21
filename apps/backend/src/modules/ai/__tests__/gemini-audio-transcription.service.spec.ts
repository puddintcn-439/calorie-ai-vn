import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiQueueService } from '../ai.queue.service';
import { GeminiAudioTranscriptionService } from '../gemini-audio-transcription.service';

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(),
}));

type GenerateContent = jest.Mock<Promise<{ response: { text: () => string } }>>;

function resolvedTranscript(transcript: string): ReturnType<GenerateContent> {
  return Promise.resolve({ response: { text: () => transcript } });
}

describe('GeminiAudioTranscriptionService', () => {
  const generateByKey = new Map<string, GenerateContent>();
  const queue = {
    execute: jest.fn(async (_opName: string, action: () => Promise<unknown>) => action()),
  } as unknown as AiQueueService;

  function makeService(options: { primary?: boolean; backup?: boolean } = { primary: true, backup: true }) {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'GEMINI_API_KEY_PRIMARY') return options.primary ? 'primary-key' : undefined;
        if (key === 'GEMINI_API_KEY_BACKUP') return options.backup ? 'backup-key' : undefined;
        if (key === 'AI_AUDIO_MODEL') return 'gemini-audio-test';
        if (key === 'AI_AUDIO_TIMEOUT_MS') return '25000';
        return undefined;
      }),
    } as unknown as ConfigService;
    return new GeminiAudioTranscriptionService(config, queue);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    generateByKey.clear();
    (GoogleGenerativeAI as unknown as jest.Mock).mockImplementation((key: string) => ({
      getGenerativeModel: jest.fn((_params, requestOptions) => ({
        generateContent: generateByKey.get(key),
        requestOptions,
      })),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts the Expo AV iOS and Android MPEG-4 AAC MIME labels', () => {
    expect(GeminiAudioTranscriptionService.isSupportedMimeType('audio/m4a')).toBe(true);
    expect(GeminiAudioTranscriptionService.isSupportedMimeType('audio/mp4')).toBe(true);
  });

  it('falls back to backup when the primary transcription times out', async () => {
    jest.useFakeTimers();
    generateByKey.set('primary-key', jest.fn(() => new Promise(() => {})) as GenerateContent);
    generateByKey.set('backup-key', jest.fn(() => resolvedTranscript('một tô phở')) as GenerateContent);
    const service = makeService();

    const promise = service.transcribe({
      buffer: Buffer.from('private-audio'),
      mimeType: 'audio/m4a',
      locale: 'vi-VN',
    });
    await jest.advanceTimersByTimeAsync(25000);

    await expect(promise).resolves.toMatchObject({
      transcript: 'một tô phở',
      provider: 'backup',
      model: 'gemini-audio-test',
      attempts: 2,
      estimatedCostUsd: 0.003,
    });
    expect(queue.execute).toHaveBeenCalledWith('voiceAudioTranscription', expect.any(Function));
  });

  it('returns a safe unavailable error when both providers are not configured', async () => {
    const service = makeService({ primary: false, backup: false });

    await expect(service.transcribe({
      buffer: Buffer.from('private-audio'),
      mimeType: 'audio/m4a',
    })).rejects.toMatchObject({
      status: 503,
      message: 'Voice transcription is temporarily unavailable. Please try again or enter text manually.',
    });
  });

  it('returns a safe unavailable error when both configured providers fail', async () => {
    const privateProviderError = 'provider failed with PRIVATE_AUDIO_PROVIDER_MARKER';
    generateByKey.set('primary-key', jest.fn(() => Promise.reject(new Error(privateProviderError))) as GenerateContent);
    generateByKey.set('backup-key', jest.fn(() => Promise.reject(new Error(privateProviderError))) as GenerateContent);
    const service = makeService();

    await expect(service.transcribe({
      buffer: Buffer.from('private-audio'),
      mimeType: 'audio/m4a',
    })).rejects.toMatchObject({
      status: 503,
      message: 'Voice transcription is temporarily unavailable. Please try again or enter text manually.',
    });
  });

  it('returns a safe timeout error when both providers time out', async () => {
    jest.useFakeTimers();
    generateByKey.set('primary-key', jest.fn(() => new Promise(() => {})) as GenerateContent);
    generateByKey.set('backup-key', jest.fn(() => new Promise(() => {})) as GenerateContent);
    const service = makeService();

    const promise = service.transcribe({
      buffer: Buffer.from('PRIVATE_AUDIO_TIMEOUT_MARKER'),
      mimeType: 'audio/m4a',
    });
    let capturedError: unknown;
    const handledPromise = promise.catch((error) => {
      capturedError = error;
      return null;
    });
    await jest.advanceTimersByTimeAsync(25000);
    await jest.advanceTimersByTimeAsync(25000);

    await handledPromise;
    expect(capturedError).toMatchObject({
      status: 503,
      message: 'Voice transcription timed out. Please try again or enter text manually.',
    });
    expect(GeminiAudioTranscriptionService.getSafeUsageFromError(capturedError)).toEqual({
      model: 'gemini-audio-test',
      attempts: 2,
      estimatedCostUsd: 0.003,
      category: 'timeout',
    });
  });

  it('does not write raw audio, base64 audio, or transcript content to logs', async () => {
    const privateAudio = 'PRIVATE_AUDIO_LOG_MARKER';
    const privateBase64 = Buffer.from(privateAudio).toString('base64');
    const sensitiveTranscript = 'sensitive transcript content';
    generateByKey.set('primary-key', jest.fn(() => resolvedTranscript(sensitiveTranscript)) as GenerateContent);
    const service = makeService({ primary: true, backup: false });
    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    try {
      const result = await service.transcribe({
        buffer: Buffer.from(privateAudio),
        mimeType: 'audio/m4a',
      });
      expect(result.transcript).toBe(sensitiveTranscript);
      const output = JSON.stringify([
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ]);
      expect(output).not.toContain(privateAudio);
      expect(output).not.toContain(privateBase64);
      expect(output).not.toContain(sensitiveTranscript);
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
