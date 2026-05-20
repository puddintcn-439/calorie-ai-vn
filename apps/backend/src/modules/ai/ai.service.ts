import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import {
  AIScanResponse,
  AIDetectedItem,
  AICoachResponse,
  AIUnresolvedItem,
} from '@calorie-ai/types';
import { createHash, randomUUID } from 'crypto';
import { MetricsService } from '../../common/metrics/metrics.service';
import { AiQueueService } from './ai.queue.service';

type EvidenceProvider = 'google' | 'tavily';

interface WebEvidence {
  provider: EvidenceProvider;
  digest: string;
  sources: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;
  private providerTimeoutMs: number;
  private providerRetries: number;
  private providerMaxConcurrency: number;
  private providerCurrent = 0;
  private providerWaiters: Array<() => void> = [];
  private textScanCache = new Map<string, { expiresAt: number; response: AIScanResponse }>();
  private static readonly TEXT_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly AI_FALLBACK_MESSAGE =
    'Coach AI đang bận do giới hạn quota. Tạm thời bạn ưu tiên 1 phần protein nạc + nhiều rau và giữ bữa tối trong khoảng calo còn lại nhé.';
  private static readonly MAX_GOOGLE_REFERENCES = 3;
  private static readonly MAX_TAVILY_REFERENCES = 3;
  private static readonly MIN_RANGE_RATIO = 0.1;
  private static readonly MAX_RANGE_RATIO = 0.35;
  private static readonly IMAGE_CACHE_TTL_MS = 10 * 60 * 1000;
  private static readonly ALLOWED_CATEGORIES = new Set([
    'rice_dish',
    'noodle',
    'meat',
    'seafood',
    'vegetable',
    'fruit',
    'drink',
    'snack',
    'dessert',
    'fast_food',
    'other',
  ]);
  private imageScanCache = new Map<string, { expiresAt: number; response: AIScanResponse }>();

  constructor(
    private config: ConfigService,
    private metrics: MetricsService,
    private aiQueue?: AiQueueService,
  ) {
    const simulateEnv = this.config.get('AI_SIMULATE_LOCAL_RESPONSE');
    const simulate = simulateEnv === true || String(simulateEnv ?? '').toLowerCase() === 'true' || String(simulateEnv) === '1';
    if (!simulate) {
      this.genAI = new GoogleGenerativeAI(this.config.getOrThrow('GEMINI_API_KEY'));
    } else {
      // In simulation mode we avoid instantiating the real provider client.
      // generateWithTiming short-circuits when simulation is enabled.
      this.genAI = {} as unknown as GoogleGenerativeAI;
    }
    this.providerTimeoutMs = Number(this.config.get('AI_PROVIDER_TIMEOUT_MS') ?? 5000);
    this.providerRetries = Number(this.config.get('AI_PROVIDER_RETRIES') ?? 1);
    this.providerMaxConcurrency = Number(this.config.get('AI_PROVIDER_MAX_CONCURRENCY') ?? 3);
    // If AiQueueService is not injected (unit tests or legacy), provide a passthrough
    if (!this.aiQueue) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.aiQueue = { execute: async <T>(_opName: string, fn: () => Promise<T>) => fn() } as unknown as AiQueueService;
    }
  }

  async scanImage(imageBase64: string, mimeType = 'image/jpeg'): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.createDeterministicModel();
    const cacheKey = this.buildImageCacheKey(imageBase64, mimeType);
    const cached = this.getCachedImageScan(cacheKey);
    if (cached) {
      return this.cloneResponseWithMetadata(cached, { cache_hit: true, cache_key: cacheKey.slice(0, 12) });
    }

    const imagePart: Part = {
      inlineData: { data: imageBase64, mimeType },
    };

    const prompt = FOOD_SCAN_PROMPT;

    try {
      const { result: firstPassResult, durationMs: firstPassMs } = await this.generateWithTiming(
        model,
        [prompt, imagePart],
        'scanImage:first_pass',
      );
      const firstPassText = firstPassResult.response.text();
      const firstPassResponse = this.parseAIResponse(firstPassText, Date.now() - start, {
        cache_hit: false,
        cache_key: cacheKey.slice(0, 12),
        provider_duration_ms: firstPassMs,
      });

      const shouldUseWebEvidence = this.shouldUseImageWebEvidence() && firstPassResponse.items.length > 0;
      if (!shouldUseWebEvidence) {
        this.setCachedImageScan(cacheKey, firstPassResponse);
        this.metrics.recordAiScan(true);
        return firstPassResponse;
      }

      const evidenceQuery = this.buildImageEvidenceQuery(firstPassResponse.items);
      const webEvidence = evidenceQuery
        ? await this.fetchWebNutritionEvidence(`${evidenceQuery} calories nutrition label`)
        : null;

      if (!webEvidence) {
        const responseWithoutEvidence = this.cloneResponseWithMetadata(firstPassResponse, {
          web_evidence_used: false,
        });
        this.setCachedImageScan(cacheKey, responseWithoutEvidence);
        this.metrics.recordAiScan(true);
        return responseWithoutEvidence;
      }

      try {
        const candidateItems = firstPassResponse.items
          .slice(0, 4)
          .map((item) => item.name_vi ?? item.name)
          .join(', ');
        const enhancedPrompt = this.withWebEvidencePrompt(
          `${FOOD_SCAN_PROMPT}\n\nMon co kha nang trong anh: ${candidateItems}\nUu tien doi chieu va hieu chinh calories theo du lieu tham khao khi phu hop.`,
          webEvidence.digest,
        );

        const { result: secondPassResult, durationMs: secondPassMs } = await this.generateWithTiming(
          model,
          [enhancedPrompt, imagePart],
          'scanImage:second_pass',
        );
        const secondPassText = secondPassResult.response.text();
        const responseWithEvidence = this.parseAIResponse(secondPassText, Date.now() - start, {
          cache_hit: false,
          cache_key: cacheKey.slice(0, 12),
          web_evidence_used: true,
          web_provider: webEvidence.provider,
          web_sources: webEvidence.sources,
          provider_duration_ms: secondPassMs,
        });

        this.setCachedImageScan(cacheKey, responseWithEvidence);
        this.metrics.recordAiScan(true);
        return responseWithEvidence;
      } catch (evidenceError) {
        this.logger.warn('Image second pass with web evidence failed, fallback to first pass', evidenceError as Error);
        const fallbackResponse = this.cloneResponseWithMetadata(firstPassResponse, {
          web_evidence_used: false,
          web_provider_attempted: webEvidence.provider,
        });
        this.setCachedImageScan(cacheKey, fallbackResponse);
        this.metrics.recordAiScan(true);
        return fallbackResponse;
      }
    } catch (error) {
      this.logger.error('Gemini scan failed', error);
      this.metrics.recordAiScan(false);
      const isTimeout = String(error ?? '').includes('AI_TIMEOUT');
      if (isTimeout) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'timeout',
          parse_mode: 'image',
          provider_duration_ms: this.providerTimeoutMs,
        });
      }
      if (this.isQuotaOrRateLimitError(error)) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'quota_or_rate_limited',
          parse_mode: 'image',
        });
      }
      throw error;
    }
  }

  async scanText(textInput: string): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.createDeterministicModel();
    const cacheKey = createHash('sha256').update(textInput.trim()).digest('hex');
    const cached = this.getCachedTextScan(cacheKey);
    if (cached) {
      return this.cloneResponseWithMetadata(cached, { cache_hit: true, cache_key: cacheKey.slice(0, 12) });
    }

    const webEvidence = await this.fetchWebNutritionEvidence(`${textInput} calories nutrition label`);

    const prompt = this.withWebEvidencePrompt(`${FOOD_TEXT_PROMPT}\n\nNgười dùng nhập: "${textInput}"`, webEvidence?.digest);

    try {
      const { result, durationMs } = await this.generateWithTiming(model, prompt, 'scanText');
      const text = result.response.text();
      const response = this.parseAIResponse(text, Date.now() - start, {
        web_evidence_used: Boolean(webEvidence),
        web_provider: webEvidence?.provider,
        web_sources: webEvidence?.sources,
        provider_duration_ms: durationMs,
      });
      this.setCachedTextScan(cacheKey, response);
      this.metrics.recordAiScan(true);
      return response;
    } catch (error) {
      this.logger.error('Gemini text scan failed', error);
      this.metrics.recordAiScan(false);
      const isTimeout = String(error ?? '').includes('AI_TIMEOUT');
      if (isTimeout) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'timeout',
          parse_mode: 'text',
          provider_duration_ms: this.providerTimeoutMs,
          web_evidence_used: Boolean(webEvidence),
          web_provider: webEvidence?.provider,
        });
      }
      if (this.isQuotaOrRateLimitError(error)) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'quota_or_rate_limited',
          parse_mode: 'text',
          web_evidence_used: Boolean(webEvidence),
          web_provider: webEvidence?.provider,
        });
      }
      throw error;
    }
  }

  async scanVoice(
    transcript: string,
    options?: {
      locale?: string;
      timezone?: string;
      meal_hint?: string;
      context?: { source?: string; device_language?: string };
    },
  ): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.createDeterministicModel();
    const sanitizedTranscript = transcript.replace(/[\x00-\x1F\x7F]/g, ' ').trim();

    const prompt = `${FOOD_VOICE_PROMPT}

Context:
- locale: ${options?.locale ?? 'unknown'}
- timezone: ${options?.timezone ?? 'unknown'}
- meal_hint: ${options?.meal_hint ?? 'unknown'}
- source: ${options?.context?.source ?? 'unknown'}

User transcript: "${sanitizedTranscript}"`;

    try {
      const { result, durationMs } = await this.generateWithTiming(model, prompt, 'scanVoice');
      const text = result.response.text();
      return this.parseAIResponse(text, Date.now() - start, {
        parse_mode: 'voice_transcript',
        locale_used: options?.locale,
        provider_duration_ms: durationMs,
      });
    } catch (error) {
      this.logger.error('Gemini voice scan failed', error);
      const isTimeout = String(error ?? '').includes('AI_TIMEOUT');
      if (isTimeout) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'timeout',
          parse_mode: 'voice_transcript',
          locale_used: options?.locale,
          provider_duration_ms: this.providerTimeoutMs,
        });
      }
      if (this.isQuotaOrRateLimitError(error)) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'quota_or_rate_limited',
          parse_mode: 'voice_transcript',
          locale_used: options?.locale,
        });
      }
      throw error;
    }
  }

  async scanReceipt(
    imageBase64: string,
    mimeType = 'image/jpeg',
    options?: {
      locale?: string;
      currency?: string;
      merchant_hint?: string;
      meal_hint?: string;
    },
  ): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.createDeterministicModel();

    const imagePart: Part = {
      inlineData: { data: imageBase64, mimeType },
    };

    const prompt = `${FOOD_RECEIPT_PROMPT}

Context:
- locale: ${options?.locale ?? 'unknown'}
- currency: ${options?.currency ?? 'unknown'}
- merchant_hint: ${options?.merchant_hint ?? 'unknown'}
- meal_hint: ${options?.meal_hint ?? 'unknown'}`;

    try {
      const { result, durationMs } = await this.generateWithTiming(model, [prompt, imagePart], 'scanReceipt');
      const text = result.response.text();
      return this.parseAIResponse(text, Date.now() - start, {
        parse_mode: 'receipt_ocr',
        locale_used: options?.locale,
        currency: options?.currency,
        merchant: options?.merchant_hint,
        provider_duration_ms: durationMs,
      });
    } catch (error) {
      this.logger.error('Gemini receipt scan failed', error);
      const isTimeout = String(error ?? '').includes('AI_TIMEOUT');
      if (isTimeout) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'timeout',
          parse_mode: 'receipt_ocr',
          locale_used: options?.locale,
          provider_duration_ms: this.providerTimeoutMs,
        });
      }
      if (this.isQuotaOrRateLimitError(error)) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'quota_or_rate_limited',
          parse_mode: 'receipt_ocr',
          locale_used: options?.locale,
        });
      }
      throw error;
    }
  }

  async refineScan(originalItemsSummary: string | undefined, context: string): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.createDeterministicModel();
    const summary = originalItemsSummary?.trim() || 'Khong co tom tat mon an ban dau.';
    const webEvidence = await this.fetchWebNutritionEvidence(
      `${summary} ${context} calories nutrition label`,
    );

    const prompt = this.withWebEvidencePrompt(`${FOOD_REFINE_PROMPT}

Kết quả scan ban đầu:
${summary}

Thông tin bổ sung: "${context}"

Điều chỉnh lại ước lượng dựa trên thông tin bổ sung.`, webEvidence?.digest);

    try {
      const { result, durationMs } = await this.generateWithTiming(model, prompt, 'refineScan');
      const text = result.response.text();
      return this.parseAIResponse(text, Date.now() - start, {
        web_evidence_used: Boolean(webEvidence),
        web_provider: webEvidence?.provider,
        web_sources: webEvidence?.sources,
        provider_duration_ms: durationMs,
      });
    } catch (error) {
      this.logger.error('Gemini refine scan failed', error);
      const isTimeout = String(error ?? '').includes('AI_TIMEOUT');
      if (isTimeout) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'timeout',
          parse_mode: 'refine',
          web_evidence_used: Boolean(webEvidence),
          web_provider: webEvidence?.provider,
          provider_duration_ms: this.providerTimeoutMs,
        });
      }
      if (this.isQuotaOrRateLimitError(error)) {
        return this.buildAiUnavailableScanResponse(Date.now() - start, {
          reason: 'quota_or_rate_limited',
          parse_mode: 'refine',
          web_evidence_used: Boolean(webEvidence),
          web_provider: webEvidence?.provider,
        });
      }
      throw error;
    }
  }

  private async fetchWebNutritionEvidence(rawQuery: string): Promise<WebEvidence | null> {
    const googleEnabled = (this.config.get<string>('GOOGLE_SEARCH_ENABLED') ?? 'true') === 'true';
    const tavilyEnabled = (this.config.get<string>('TAVILY_SEARCH_ENABLED') ?? 'true') === 'true';
    if (!googleEnabled && !tavilyEnabled) {
      return null;
    }

    if (googleEnabled) {
      const googleEvidence = await this.fetchGoogleNutritionEvidence(rawQuery);
      if (googleEvidence) {
        return googleEvidence;
      }
    }

    if (tavilyEnabled) {
      return this.fetchTavilyNutritionEvidence(rawQuery);
    }

    return null;
  }

  private shouldUseImageWebEvidence(): boolean {
    return (this.config.get<string>('IMAGE_WEB_EVIDENCE_ENABLED') ?? 'true') === 'true';
  }

  private buildImageEvidenceQuery(items: AIDetectedItem[]): string {
    return items
      .slice(0, 4)
      .map((item) => item.name_vi?.trim() || item.name?.trim())
      .filter((name): name is string => Boolean(name))
      .join(', ');
  }

  private async fetchGoogleNutritionEvidence(rawQuery: string): Promise<WebEvidence | null> {
    const enabled = (this.config.get<string>('GOOGLE_SEARCH_ENABLED') ?? 'true') === 'true';
    const apiKey = this.config.get<string>('GOOGLE_SEARCH_API_KEY');
    const searchEngineId = this.config.get<string>('GOOGLE_SEARCH_CX');

    if (!enabled || !apiKey || !searchEngineId) {
      return null;
    }

    const query = rawQuery.trim().slice(0, 220);
    if (!query) {
      return null;
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', searchEngineId);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(AiService.MAX_GOOGLE_REFERENCES));
    url.searchParams.set('hl', 'vi');
    url.searchParams.set('gl', 'vn');

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        this.logger.warn(`Google search lookup failed with status ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as {
        items?: Array<{ title?: string; snippet?: string; link?: string }>;
      };

      const items = (payload.items ?? []).slice(0, AiService.MAX_GOOGLE_REFERENCES);
      if (!items.length) {
        return null;
      }

      const digest = items
        .map((item, index) => {
          const title = item.title?.trim() || 'Untitled';
          const snippet = item.snippet?.trim() || 'No snippet';
          const link = item.link?.trim() || 'No URL';
          return `${index + 1}. ${title}\nSnippet: ${snippet}\nURL: ${link}`;
        })
        .join('\n\n');

      const sources = items
        .map((item) => item.link?.trim())
        .filter((value): value is string => Boolean(value));

      return { provider: 'google', digest, sources };
    } catch (error) {
      this.logger.warn('Google search lookup failed', error as Error);
      return null;
    }
  }

  private async fetchTavilyNutritionEvidence(rawQuery: string): Promise<WebEvidence | null> {
    const enabled = (this.config.get<string>('TAVILY_SEARCH_ENABLED') ?? 'true') === 'true';
    const apiKey = this.config.get<string>('TAVILY_API_KEY');

    if (!enabled || !apiKey) {
      return null;
    }

    const query = rawQuery.trim().slice(0, 220);
    if (!query) {
      return null;
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'basic',
          max_results: AiService.MAX_TAVILY_REFERENCES,
          include_answer: false,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Tavily search lookup failed with status ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as {
        results?: Array<{ title?: string; content?: string; url?: string }>;
      };

      const items = (payload.results ?? []).slice(0, AiService.MAX_TAVILY_REFERENCES);
      if (!items.length) {
        return null;
      }

      const digest = items
        .map((item, index) => {
          const title = item.title?.trim() || 'Untitled';
          const snippet = item.content?.trim() || 'No snippet';
          const link = item.url?.trim() || 'No URL';
          return `${index + 1}. ${title}\nSnippet: ${snippet}\nURL: ${link}`;
        })
        .join('\n\n');

      const sources = items
        .map((item) => item.url?.trim())
        .filter((value): value is string => Boolean(value));

      return { provider: 'tavily', digest, sources };
    } catch (error) {
      this.logger.warn('Tavily search lookup failed', error as Error);
      return null;
    }
  }

  private withWebEvidencePrompt(basePrompt: string, webEvidenceDigest?: string): string {
    if (!webEvidenceDigest) {
      return basePrompt;
    }

    return `${basePrompt}

Du lieu tham khao tu web search (co the co nhieu nguon khac nhau):
${webEvidenceDigest}

Yeu cau bo sung:
- So sanh thong tin tu nguon web voi nhan dien ban dau.
- Uu tien dinh duong tu nhan san pham chinh hang hoac trang dinh duong uy tin.
- Neu nguon mau thuan, chon gia tri bao thu va giam confidence.
- Van phai tra ve JSON dung schema da yeu cau, khong them text ngoai JSON.`;
  }

  async getCoachReply(
    message: string,
    context: { today_calories: number; target_calories: number },
  ): Promise<AICoachResponse> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `${COACH_SYSTEM_PROMPT}

Thông tin người dùng hôm nay:
- Đã ăn: ${context.today_calories} kcal
- Mục tiêu: ${context.target_calories} kcal
- Còn lại: ${context.target_calories - context.today_calories} kcal

Người dùng hỏi: "${message}"

Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Không quá 3 câu.`;

    try {
      const { result, durationMs } = await this.generateWithTiming(model, prompt, 'getCoachReply');
      const text = result.response.text();
      this.logger.debug(`[AI-PROVIDER] coach duration_ms=${durationMs}`);

      return {
        message: text.trim(),
        suggestions: [],
      };
    } catch (error) {
      this.logger.error('Gemini coach failed', error);

      const isTimeout = String(error ?? '').includes('AI_TIMEOUT');
      // Prevent UI-breaking 500 responses when Gemini key is valid but quota is unavailable or timeout
      if (isTimeout || this.isQuotaOrRateLimitError(error)) {
        return {
          message: AiService.AI_FALLBACK_MESSAGE,
          suggestions: [
            'Mon uu tien: uc ga, trung, dau hu + rau luoc',
            `Con lai ${Math.max(0, context.target_calories - context.today_calories)} kcal hom nay`,
          ],
        };
      }

      throw error;
    }
  }

  private isQuotaOrRateLimitError(error: unknown): boolean {
    const msg = String(error ?? '').toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('quota exceeded') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests')
    );
  }

  private buildAiUnavailableScanResponse(
    processingMs: number,
    metadata?: Record<string, unknown>,
  ): AIScanResponse {
    return {
      success: false,
      scan_id: randomUUID(),
      items: [],
      total_calories: 0,
      total_calories_min: 0,
      total_calories_max: 0,
      total_protein_g: 0,
      total_carbs_g: 0,
      total_fat_g: 0,
      ai_confidence: 0,
      metadata: {
        ai_fallback: 'quota_or_rate_limited',
        ...(metadata ?? {}),
      },
      processing_ms: processingMs,
    };
  }

  private parseAIResponse(
    rawText: string,
    processingMs: number,
    metadata?: Record<string, unknown>,
  ): AIScanResponse {
    try {
      // Extract JSON block from markdown code fences if present
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      const parsed = JSON.parse(jsonStr.trim());

      const items: AIDetectedItem[] = (parsed.items ?? []).map((item: any) => {
        const caloriesRaw = Number(item.calories) || 0;
        const confidenceRaw = Number(item.confidence) || 0.7;
        const caloriesRange = this.buildCaloriesRange(caloriesRaw, confidenceRaw, item.calories_min, item.calories_max);
        const category = this.normalizeCategory(item.category ?? item.name ?? 'other');

        return {
          ...caloriesRange,
          name: item.name ?? '',
          name_vi: item.name_vi ?? item.name ?? '',
          category,
          quantity: this.clampNumber(item.quantity ?? 1, 1, 100, 1),
          unit: String(item.unit ?? 'gram'),
          estimated_grams: this.clampNumber(item.estimated_grams ?? 100, 10, 5000, 100),
          protein_g: this.clampNumber(item.protein_g ?? 0, 0, 1000, 0),
          carbs_g: this.clampNumber(item.carbs_g ?? 0, 0, 1000, 0),
          fat_g: this.clampNumber(item.fat_g ?? 0, 0, 1000, 0),
          fiber_g: this.numOpt(item.fiber_g),
          sugar_g: this.numOpt(item.sugar_g),
          saturated_fat_g: this.numOpt(item.saturated_fat_g),
          sodium_mg: this.numOpt(item.sodium_mg),
          confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.7)),
        } as AIDetectedItem;
      });

      const unresolvedItems: AIUnresolvedItem[] = (parsed.unresolved_items ?? []).map(
        (item: any) => ({
          raw_text: String(item.raw_text ?? ''),
          reason: String(item.reason ?? 'unknown_item'),
          confidence: Number(item.confidence) || 0,
        }),
      );

      return {
        success: true,
        scan_id: randomUUID(),
        items,
        unresolved_items: unresolvedItems.length ? unresolvedItems : undefined,
        total_calories: items.reduce((s, i) => s + i.calories, 0),
        total_calories_min: items.reduce((s, i) => s + (i.calories_min ?? i.calories), 0),
        total_calories_max: items.reduce((s, i) => s + (i.calories_max ?? i.calories), 0),
        total_protein_g: items.reduce((s, i) => s + i.protein_g, 0),
        total_carbs_g: items.reduce((s, i) => s + i.carbs_g, 0),
        total_fat_g: items.reduce((s, i) => s + i.fat_g, 0),
        ai_confidence: items.reduce((s, i) => s + i.confidence, 0) / (items.length || 1),
        metadata,
        raw_ai_response: process.env.NODE_ENV !== 'production' ? rawText : undefined,
        processing_ms: processingMs,
      };
    } catch (err) {
      this.logger.warn('Failed to parse AI response JSON', rawText);
      return {
        success: false,
        scan_id: randomUUID(),
        items: [],
        total_calories: 0,
        total_calories_min: 0,
        total_calories_max: 0,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
        ai_confidence: 0,
        metadata,
        raw_ai_response: rawText,
        processing_ms: processingMs,
      };
    }
  }

  private buildCaloriesRange(
    calories: number,
    confidence: number,
    rawMin: unknown,
    rawMax: unknown,
  ): { calories: number; calories_min: number; calories_max: number } {
    const baseCalories = Math.max(0, Math.round(calories));
    const providedMin = Number(rawMin);
    const providedMax = Number(rawMax);

    if (
      Number.isFinite(providedMin)
      && Number.isFinite(providedMax)
      && providedMin >= 0
      && providedMax >= providedMin
    ) {
      return {
        calories: baseCalories,
        calories_min: Math.round(providedMin),
        calories_max: Math.round(providedMax),
      };
    }

    const clampedConfidence = Math.max(0, Math.min(1, confidence));
    const rangeRatio = Math.min(
      AiService.MAX_RANGE_RATIO,
      Math.max(
        AiService.MIN_RANGE_RATIO,
        AiService.MIN_RANGE_RATIO + (1 - clampedConfidence) * 0.25,
      ),
    );

    return {
      calories: baseCalories,
      calories_min: Math.max(0, Math.round(baseCalories * (1 - rangeRatio))),
      calories_max: Math.round(baseCalories * (1 + rangeRatio)),
    };
  }

  private numOpt(value: unknown): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  private normalizeCategory(input: unknown): string {
    const s = String(input ?? '').toLowerCase().trim();
    if (!s) return 'other';

    if (AiService.ALLOWED_CATEGORIES.has(s)) return s;

    // Synonym mappings
    if (s.includes('pho') || s.includes('noodle') || s.includes('bun') || s.includes('soup')) return 'noodle';
    if (s.includes('rice') || s.includes('com') || s.includes('cơm') || s.includes('rice_dish')) return 'rice_dish';
    if (s.includes('seafood') || s.includes('fish') || s.includes('shrimp') || s.includes('prawn')) return 'seafood';
    if (s.includes('veg') || s.includes('rau') || s.includes('vegetable')) return 'vegetable';
    if (s.includes('fruit') || s.includes('trai cay') || s.includes('trái cây')) return 'fruit';
    if (s.includes('drink') || s.includes('juice') || s.includes('beverage')) return 'drink';
    if (s.includes('snack') || s.includes('chips') || s.includes('banh')) return 'snack';
    if (s.includes('dessert') || s.includes('cake') || s.includes('kem')) return 'dessert';
    if (s.includes('fast') || s.includes('burger') || s.includes('fried')) return 'fast_food';
    if (s.includes('meat') || s.includes('chicken') || s.includes('beef') || s.includes('pork')) return 'meat';

    return 'other';
  }

  private clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  private createDeterministicModel() {
    return this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        topP: 0.2,
      },
    });
  }

  private async acquireProviderSlot(): Promise<void> {
    if (this.providerCurrent < this.providerMaxConcurrency) {
      this.providerCurrent += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.providerWaiters.push(resolve);
    });
    this.providerCurrent += 1;
  }

  private releaseProviderSlot(): void {
    this.providerCurrent = Math.max(0, this.providerCurrent - 1);
    const next = this.providerWaiters.shift();
    if (next) next();
  }

  private getCachedTextScan(cacheKey: string): AIScanResponse | null {
    const hit = this.textScanCache.get(cacheKey);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.textScanCache.delete(cacheKey);
      return null;
    }
    return hit.response;
  }

  private setCachedTextScan(cacheKey: string, response: AIScanResponse): void {
    this.textScanCache.set(cacheKey, {
      expiresAt: Date.now() + AiService.TEXT_CACHE_TTL_MS,
      response,
    });
  }

  private async generateWithTiming(model: any, input: any, opName: string): Promise<{ result: any; durationMs: number }> {
    const t0 = Date.now();
    // Dev-only simulation mode: if enabled, return a cached debug response
    // to avoid calling the real provider during local tests.
    try {
      const simulateEnv = this.config.get('AI_SIMULATE_LOCAL_RESPONSE');
      const simulate = simulateEnv === true || String(simulateEnv ?? '').toLowerCase() === 'true' || String(simulateEnv) === '1';
      if (simulate) {
        const candidates: string[] = [
          path.resolve(process.cwd(), 'tmp', 'ai_debug_response.json'),
          path.resolve(__dirname, '..', '..', '..', '..', '..', 'tmp', 'ai_debug_response.json'),
          path.resolve(__dirname, '..', '..', '..', '..', 'tmp', 'ai_debug_response.json'),
          path.resolve(__dirname, '..', '..', '..', 'tmp', 'ai_debug_response.json'),
        ];

        let debugPath: string | null = null;
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            debugPath = c;
            break;
          }
        }

        if (!debugPath) {
          let dir = __dirname;
          for (let i = 0; i < 8; i += 1) {
            const p = path.join(dir, 'tmp', 'ai_debug_response.json');
            if (fs.existsSync(p)) {
              debugPath = p;
              break;
            }
            dir = path.resolve(dir, '..');
          }
        }

        if (!debugPath) {
          let dir = process.cwd();
          for (let i = 0; i < 8; i += 1) {
            const p = path.join(dir, 'tmp', 'ai_debug_response.json');
            if (fs.existsSync(p)) {
              debugPath = p;
              break;
            }
            dir = path.resolve(dir, '..');
          }
        }

        if (debugPath) {
          const raw = fs.readFileSync(debugPath, 'utf8');
          const simulatedMs = Number(this.config.get('AI_SIMULATED_LATENCY_MS') ?? 8200);
          await new Promise((r) => setTimeout(r, simulatedMs));
          const fakeResult = { response: { text: () => raw } };
          this.logger.debug(`[AI-PROVIDER] ${opName} simulated duration_ms=${simulatedMs} debugPath=${debugPath}`);
          return { result: fakeResult, durationMs: simulatedMs };
        }

        this.logger.warn('[AiService] AI_SIMULATE_LOCAL_RESPONSE=true but no tmp/ai_debug_response.json found; falling back to real provider');
      }
    } catch (e) {
      this.logger.warn('AI simulation failed, falling back to real provider', e as Error);
    }

    const executeFn = async (): Promise<{ result: any; durationMs: number }> => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= this.providerRetries; attempt += 1) {
        try {
          const genPromise = model.generateContent(input);

          const result = await Promise.race([
            genPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), this.providerTimeoutMs)),
          ]);

          const duration = Date.now() - t0;
          this.logger.debug(`[AI-PROVIDER] ${opName} success duration_ms=${duration} attempt=${attempt + 1}`);
          return { result, durationMs: duration };
        } catch (err) {
          lastErr = err;
          const duration = Date.now() - t0;
          const isTimeout = String(err ?? '').includes('AI_TIMEOUT');
          this.logger.warn(`[AI-PROVIDER] ${opName} attempt=${attempt + 1} failed after ${duration}ms`, err as Error);
          if (attempt < this.providerRetries && !isTimeout) {
            const backoff = Math.pow(2, attempt) * 200;
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          this.logger.error(`[AI-PROVIDER] ${opName} failed after ${duration}ms attempts=${attempt + 1}`, err as Error);
          throw err;
        }
      }

      // Should not reach here but throw last error if it does
      throw lastErr;
    };

    return (this.aiQueue as AiQueueService).execute(opName, executeFn);
  }

  private buildImageCacheKey(imageBase64: string, mimeType: string): string {
    return createHash('sha256').update(`${mimeType}:${imageBase64}`).digest('hex');
  }

  private getCachedImageScan(cacheKey: string): AIScanResponse | null {
    const hit = this.imageScanCache.get(cacheKey);
    if (!hit) {
      return null;
    }

    if (Date.now() > hit.expiresAt) {
      this.imageScanCache.delete(cacheKey);
      return null;
    }

    return hit.response;
  }

  private setCachedImageScan(cacheKey: string, response: AIScanResponse): void {
    this.imageScanCache.set(cacheKey, {
      expiresAt: Date.now() + AiService.IMAGE_CACHE_TTL_MS,
      response,
    });
  }

  private cloneResponseWithMetadata(
    response: AIScanResponse,
    metadataPatch: Record<string, unknown>,
  ): AIScanResponse {
    return {
      ...response,
      scan_id: randomUUID(),
      items: response.items.map((item) => ({ ...item })),
      unresolved_items: response.unresolved_items?.map((item) => ({ ...item })),
      metadata: {
        ...(response.metadata ?? {}),
        ...metadataPatch,
      },
    };
  }
}

// ---- Prompts ----

const FOOD_SCAN_PROMPT = `Bạn là chuyên gia dinh dưỡng AI. Phân tích ảnh đồ ăn/đồ uống này.

Trả về JSON theo đúng format sau (KHÔNG có text thêm, chỉ JSON thuần):
{
  "items": [
    {
      "name": "Phở bò",
      "name_vi": "Phở bò",
      "category": "noodle",
      "quantity": 1,
      "unit": "tô",
      "estimated_grams": 500,
      "calories": 450,
      "calories_min": 390,
      "calories_max": 520,
      "protein_g": 25,
      "carbs_g": 55,
      "fat_g": 12,
      "fiber_g": 3,
      "sugar_g": 2,
      "saturated_fat_g": 4,
      "sodium_mg": 980,
      "confidence": 0.92
    }
  ]
}

Quy tắc:
- Ước lượng khẩu phần thực tế (không phải 100g)
- Tách riêng từng món trong ảnh
- category phải là 1 trong: rice_dish, noodle, meat, seafood, vegetable, fruit, drink, snack, dessert, fast_food, other
- confidence từ 0 đến 1
- Luon tra ve calories_min va calories_max cho tung item (khoang uoc luong hop ly)
- Có thể thêm fiber_g, sugar_g, saturated_fat_g, sodium_mg khi có nhãn dinh dưỡng hoặc ước lượng đáng tin; nếu không chắc thì bỏ qua trường đó
- Nếu không thấy đồ ăn, trả về items: []`;

const FOOD_TEXT_PROMPT = `Bạn là chuyên gia dinh dưỡng AI. Phân tích mô tả đồ ăn/đồ uống.

Trả về JSON theo đúng format sau (KHÔNG có text thêm, chỉ JSON thuần):
{
  "items": [
    {
      "name": "Cơm tấm sườn",
      "name_vi": "Cơm tấm sườn",
      "category": "rice_dish",
      "quantity": 1,
      "unit": "dĩa",
      "estimated_grams": 400,
      "calories": 620,
      "calories_min": 540,
      "calories_max": 710,
      "protein_g": 28,
      "carbs_g": 75,
      "fat_g": 22,
      "fiber_g": 4,
      "sugar_g": 7,
      "saturated_fat_g": 6,
      "sodium_mg": 1150,
      "confidence": 0.85
    }
  ]
}

Nếu nhập nhiều món, tách ra từng item. Ước lượng khẩu phần thực tế cho người Việt.
Có thể thêm fiber_g, sugar_g, saturated_fat_g, sodium_mg khi có nhãn dinh dưỡng hoặc ước lượng đáng tin; nếu không chắc thì bỏ qua trường đó.`;

const FOOD_REFINE_PROMPT = `Bạn là chuyên gia dinh dưỡng AI. Người dùng vừa scan đồ ăn và muốn điều chỉnh lại ước lượng.

Trả về JSON theo đúng format sau (KHÔNG có text thêm, chỉ JSON thuần):
{
  "items": [
    {
      "name": "Phở bò",
      "name_vi": "Phở bò",
      "category": "noodle",
      "quantity": 2,
      "unit": "tô",
      "estimated_grams": 1000,
      "calories": 900,
      "protein_g": 50,
      "carbs_g": 110,
      "fat_g": 24,
      "fiber_g": 6,
      "sugar_g": 4,
      "saturated_fat_g": 8,
      "sodium_mg": 1960,
      "confidence": 0.95
    }
  ]
}

Quy tắc:
- Dựa vào thông tin bổ sung để điều chỉnh khẩu phần và calories cho chính xác hơn
- Nếu người dùng nói "thêm trứng" thì add trứng vào items
- Nếu người dùng nói "2 phần" thì nhân đôi calories
- Có thể thêm fiber_g, sugar_g, saturated_fat_g, sodium_mg khi có nhãn dinh dưỡng hoặc ước lượng đáng tin; nếu không chắc thì bỏ qua trường đó
- category phải là 1 trong: rice_dish, noodle, meat, seafood, vegetable, fruit, drink, snack, dessert, fast_food, other`;

const FOOD_VOICE_PROMPT = `You are a nutrition AI. Parse the user's spoken meal transcript into structured food items.

Return strict JSON only:
{
  "items": [
    {
      "name": "Chicken salad",
      "name_vi": "Chicken salad",
      "category": "other",
      "quantity": 1,
      "unit": "serving",
      "estimated_grams": 280,
      "calories": 420,
      "protein_g": 34,
      "carbs_g": 18,
      "fat_g": 24,
      "fiber_g": 5,
      "sugar_g": 6,
      "saturated_fat_g": 6,
      "sodium_mg": 720,
      "confidence": 0.82
    }
  ]
}

Rules:
- Keep locale awareness from provided context.
- Split multiple foods into separate items.
- Estimate realistic portion size.
- Add optional fiber_g, sugar_g, saturated_fat_g, sodium_mg only when a label/context supports them or the estimate is reasonably reliable; omit when uncertain.
- category must be one of: rice_dish, noodle, meat, seafood, vegetable, fruit, drink, snack, dessert, fast_food, other.
- confidence must be between 0 and 1.
- If no food is detected, return items: []`;

const FOOD_RECEIPT_PROMPT = `You are a nutrition AI. Parse receipt text/lines in the image into structured food items.

Return strict JSON only:
{
  "items": [
    {
      "name": "Greek Yogurt",
      "name_vi": "Greek Yogurt",
      "category": "other",
      "quantity": 1,
      "unit": "cup",
      "estimated_grams": 170,
      "calories": 130,
      "protein_g": 12,
      "carbs_g": 8,
      "fat_g": 4,
      "fiber_g": 0,
      "sugar_g": 5,
      "saturated_fat_g": 2.5,
      "sodium_mg": 65,
      "confidence": 0.88
    }
  ],
  "unresolved_items": [
    {
      "raw_text": "PROMO ITEM X",
      "reason": "unknown_product",
      "confidence": 0.31
    }
  ]
}

Rules:
- Extract only food/drink line items relevant for nutrition estimation.
- Put uncertain lines into unresolved_items.
- Add optional fiber_g, sugar_g, saturated_fat_g, sodium_mg when receipt context or known packaged-food nutrition supports it; omit when uncertain.
- category must be one of: rice_dish, noodle, meat, seafood, vegetable, fruit, drink, snack, dessert, fast_food, other.
- confidence must be between 0 and 1.
- If nothing useful can be detected, return items: [] and unresolved_items when possible.`;

const COACH_SYSTEM_PROMPT = `Bạn là AI coach dinh dưỡng thân thiện, chuyên về ẩm thực Việt Nam. 
Mục tiêu: giúp người dùng ăn uống lành mạnh, đạt mục tiêu cân nặng.
Phong cách: vui vẻ, thực tế, không phán xét.`;
