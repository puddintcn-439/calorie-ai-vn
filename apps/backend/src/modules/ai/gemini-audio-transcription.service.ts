import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { AiQueueService } from './ai.queue.service';
import { VOICE_TRANSCRIPTION_ESTIMATED_COST_USD } from './ai-usage.policy';

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm',
]);

type TranscriptionProvider = 'primary' | 'backup';

export type VoiceTranscriptionResult = {
  transcript: string;
  provider: TranscriptionProvider;
  model: string;
  attempts: number;
  estimatedCostUsd: number;
};

type SafeVoiceUsage = {
  model: string;
  attempts: number;
  estimatedCostUsd: number;
  category: 'timeout' | 'provider_unavailable' | 'unintelligible';
};

const SAFE_USAGE_PROPERTY = 'voiceTranscriptionUsage';
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 28000;

@Injectable()
export class GeminiAudioTranscriptionService {
  private readonly primary?: GoogleGenerativeAI;
  private readonly backup?: GoogleGenerativeAI;
  private readonly modelName: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly aiQueue: AiQueueService,
  ) {
    const primaryKey = this.config.get<string>('GEMINI_API_KEY_PRIMARY') ?? this.config.get<string>('GEMINI_API_KEY');
    const backupKey = this.config.get<string>('GEMINI_API_KEY_BACKUP');
    if (primaryKey) this.primary = new GoogleGenerativeAI(primaryKey);
    if (backupKey) this.backup = new GoogleGenerativeAI(backupKey);
    this.modelName = this.config.get<string>('AI_AUDIO_MODEL') ?? this.config.get<string>('AI_MODEL') ?? 'gemini-2.5-flash';
    const configuredTimeout = Number(this.config.get<string>('AI_AUDIO_TIMEOUT_MS') ?? DEFAULT_TRANSCRIPTION_TIMEOUT_MS);
    this.timeoutMs = Math.min(30000, Math.max(25000, Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_TRANSCRIPTION_TIMEOUT_MS));
  }

  static isSupportedMimeType(mimeType: string | undefined): boolean {
    return SUPPORTED_AUDIO_MIME_TYPES.has(String(mimeType ?? '').toLowerCase());
  }

  static getSafeUsageFromError(error: unknown): SafeVoiceUsage | null {
    const usage = (error as Record<string, unknown> | null)?.[SAFE_USAGE_PROPERTY];
    if (!usage || typeof usage !== 'object') return null;
    return usage as SafeVoiceUsage;
  }

  async transcribe(input: { buffer: Buffer; mimeType: string; locale?: string }): Promise<VoiceTranscriptionResult> {
    if (!GeminiAudioTranscriptionService.isSupportedMimeType(input.mimeType)) {
      throw new UnprocessableEntityException('Unsupported audio format. Use m4a, mp3, wav, or webm.');
    }
    if (!input.buffer?.length) throw new UnprocessableEntityException('Audio file is required.');

    return this.aiQueue.execute('voiceAudioTranscription', async () => {
      const audioPart: Part = { inlineData: { data: input.buffer.toString('base64'), mimeType: input.mimeType } };
      const prompt = `Transcribe this spoken food-log audio. Return only the transcript, no explanation. Expected locale: ${input.locale ?? 'auto-detect'}. If unintelligible, return an empty string.`;
      const configuredProviders: Array<{ label: TranscriptionProvider; client?: GoogleGenerativeAI }> = [
        { label: 'primary', client: this.primary },
        { label: 'backup', client: this.backup },
      ];
      const providers = configuredProviders.filter(
        (provider): provider is { label: TranscriptionProvider; client: GoogleGenerativeAI } => Boolean(provider.client),
      );
      let attempts = 0;
      let lastCategory: SafeVoiceUsage['category'] = 'provider_unavailable';
      const deadline = Date.now() + this.timeoutMs;

      for (let index = 0; index < providers.length; index += 1) {
        const provider = providers[index];
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          lastCategory = 'timeout';
          break;
        }
        const reserveForBackupMs = index === 0 && providers.length > 1
          ? Math.min(10000, Math.floor(this.timeoutMs * 0.4))
          : 0;
        const attemptTimeoutMs = Math.max(1000, remainingMs - reserveForBackupMs);
        attempts += 1;
        try {
          const model = provider.client.getGenerativeModel(
            { model: this.modelName, generationConfig: { temperature: 0, maxOutputTokens: 512 } },
            { timeout: attemptTimeoutMs },
          );
          const result = await this.withTimeout(model.generateContent([prompt, audioPart]), attemptTimeoutMs);
          const transcript = result.response.text().replace(/\s+/g, ' ').trim();
          if (transcript.length < 2) {
            const error = new UnprocessableEntityException('Could not understand speech. Please try again or enter text manually.');
            this.attachSafeUsage(error, attempts, 'unintelligible');
            throw error;
          }
          return {
            transcript,
            provider: provider.label,
            model: this.modelName,
            attempts,
            estimatedCostUsd: VOICE_TRANSCRIPTION_ESTIMATED_COST_USD * attempts,
          };
        } catch (error) {
          if (error instanceof UnprocessableEntityException) throw error;
          lastCategory = this.isTimeoutError(error) ? 'timeout' : 'provider_unavailable';
        }
      }

      const message = lastCategory === 'timeout'
        ? 'Voice transcription timed out. Please try again or enter text manually.'
        : 'Voice transcription is temporarily unavailable. Please try again or enter text manually.';
      const error = new ServiceUnavailableException(message);
      this.attachSafeUsage(error, attempts, lastCategory);
      throw error;
    });
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('VOICE_TRANSCRIPTION_TIMEOUT')), timeoutMs);
      (timeoutId as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private isTimeoutError(error: unknown): boolean {
    const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
    return message.includes('timeout') || message.includes('timed out');
  }

  private attachSafeUsage(
    error: Error,
    attempts: number,
    category: SafeVoiceUsage['category'],
  ): void {
    Object.defineProperty(error, SAFE_USAGE_PROPERTY, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: {
        model: this.modelName,
        attempts,
        estimatedCostUsd: VOICE_TRANSCRIPTION_ESTIMATED_COST_USD * attempts,
        category,
      } satisfies SafeVoiceUsage,
    });
  }
}
