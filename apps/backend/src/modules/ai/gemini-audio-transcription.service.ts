import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm',
]);

@Injectable()
export class GeminiAudioTranscriptionService {
  private readonly primary?: GoogleGenerativeAI;
  private readonly backup?: GoogleGenerativeAI;
  private readonly modelName: string;

  constructor(private readonly config: ConfigService) {
    const primaryKey = this.config.get<string>('GEMINI_API_KEY_PRIMARY') ?? this.config.get<string>('GEMINI_API_KEY');
    const backupKey = this.config.get<string>('GEMINI_API_KEY_BACKUP');
    if (primaryKey) this.primary = new GoogleGenerativeAI(primaryKey);
    if (backupKey) this.backup = new GoogleGenerativeAI(backupKey);
    this.modelName = this.config.get<string>('AI_AUDIO_MODEL') ?? this.config.get<string>('AI_MODEL') ?? 'gemini-2.5-flash';
  }

  static isSupportedMimeType(mimeType: string | undefined): boolean {
    return SUPPORTED_AUDIO_MIME_TYPES.has(String(mimeType ?? '').toLowerCase());
  }

  async transcribe(input: { buffer: Buffer; mimeType: string; locale?: string }): Promise<{ transcript: string; provider: 'primary' | 'backup' }> {
    if (!GeminiAudioTranscriptionService.isSupportedMimeType(input.mimeType)) {
      throw new UnprocessableEntityException('Unsupported audio format. Use m4a, mp3, wav, or webm.');
    }
    if (!input.buffer?.length) throw new UnprocessableEntityException('Audio file is required.');

    const audioPart: Part = { inlineData: { data: input.buffer.toString('base64'), mimeType: input.mimeType } };
    const prompt = `Transcribe this spoken food-log audio. Return only the transcript, no explanation. Expected locale: ${input.locale ?? 'auto-detect'}. If unintelligible, return an empty string.`;
    const providers: Array<{ label: 'primary' | 'backup'; client?: GoogleGenerativeAI }> = [
      { label: 'primary', client: this.primary },
      { label: 'backup', client: this.backup },
    ];
    let lastError: unknown;
    for (const provider of providers) {
      if (!provider.client) continue;
      try {
        const model = provider.client.getGenerativeModel({ model: this.modelName, generationConfig: { temperature: 0, maxOutputTokens: 512 } });
        const result = await model.generateContent([prompt, audioPart]);
        const transcript = result.response.text().replace(/\s+/g, ' ').trim();
        if (transcript.length < 2) throw new UnprocessableEntityException('Could not understand speech. Please try again or enter text manually.');
        return { transcript, provider: provider.label };
      } catch (error) {
        if (error instanceof UnprocessableEntityException) throw error;
        lastError = error;
      }
    }
    throw new ServiceUnavailableException(`Voice transcription is temporarily unavailable${lastError ? '.' : ''}`);
  }
}
