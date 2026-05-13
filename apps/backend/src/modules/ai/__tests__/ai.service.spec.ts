import { AiService } from '../ai.service';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../../common/metrics/metrics.service';

// Mock GoogleGenerativeAI so tests never make real HTTP calls
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

function makeConfig(apiKey = 'test-key'): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue(apiKey),
    get: jest.fn().mockImplementation((key: string) => {
      const defaults: Record<string, string> = {
        IMAGE_WEB_EVIDENCE_ENABLED: 'false',
        GOOGLE_SEARCH_ENABLED: 'false',
        TAVILY_SEARCH_ENABLED: 'false',
        GOOGLE_SEARCH_API_KEY: '',
        GOOGLE_SEARCH_CX: '',
        TAVILY_API_KEY: '',
      };
      return defaults[key];
    }),
  } as unknown as ConfigService;
}

function makeMetrics(): MetricsService {
  return { recordAiScan: jest.fn() } as unknown as MetricsService;
}

function makeService(): AiService {
  return new AiService(makeConfig(), makeMetrics());
}

// Helper to access private parseAIResponse (synchronous)
function parseResponse(service: AiService, raw: string, ms = 100): import('@calorie-ai/types').AIScanResponse {
  return (service as any).parseAIResponse(raw, ms) as import('@calorie-ai/types').AIScanResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// parseAIResponse — valid JSON
// ─────────────────────────────────────────────────────────────────────────────
describe('AiService.parseAIResponse – valid JSON', () => {
  let service: AiService;

  beforeEach(() => { service = makeService(); });

  it('parses a bare JSON response', () => {
    const raw = JSON.stringify({
      items: [{
        name: 'Pho Bo', name_vi: 'Phở bò', category: 'noodle',
        quantity: 1, unit: 'bowl', estimated_grams: 500,
        calories: 350, protein_g: 20, carbs_g: 45, fat_g: 8, confidence: 0.9,
      }],
    });
    const result = parseResponse(service, raw);
    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Pho Bo');
    expect(result.items[0].confidence).toBe(0.9);
    expect(result.total_calories).toBe(350);
    expect(result.ai_confidence).toBe(0.9);
    expect(result.processing_ms).toBe(100);
  });

  it('parses a markdown-fenced JSON response', () => {
    const raw = '```json\n{"items":[{"name":"X","name_vi":"X","category":"other","quantity":1,"unit":"g","estimated_grams":100,"calories":100,"protein_g":5,"carbs_g":15,"fat_g":3,"confidence":0.7}]}\n```';
    const result = parseResponse(service, raw);
    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.ai_confidence).toBeCloseTo(0.7);
  });

  it('computes ai_confidence as average across multiple items', () => {
    const raw = JSON.stringify({
      items: [
        { name: 'A', name_vi: 'A', category: 'other', quantity: 1, unit: 'g', estimated_grams: 100, calories: 100, protein_g: 5, carbs_g: 15, fat_g: 3, confidence: 0.9 },
        { name: 'B', name_vi: 'B', category: 'other', quantity: 1, unit: 'g', estimated_grams: 100, calories: 200, protein_g: 10, carbs_g: 25, fat_g: 8, confidence: 0.5 },
      ],
    });
    const result = parseResponse(service, raw);
    expect(result.ai_confidence).toBeCloseTo(0.7);
    expect(result.total_calories).toBe(300);
    expect(result.total_protein_g).toBeCloseTo(15);
    expect(result.total_carbs_g).toBeCloseTo(40);
    expect(result.total_fat_g).toBeCloseTo(11);
  });

  it('uses defaults for missing item fields', () => {
    const raw = JSON.stringify({ items: [{ name: 'Mystery' }] });
    const result = parseResponse(service, raw);
    expect(result.success).toBe(true);
    expect(result.items[0].estimated_grams).toBe(100);
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].confidence).toBe(0.7);
    expect(result.items[0].name_vi).toBe('Mystery');
  });

  it('handles empty items array', () => {
    const raw = JSON.stringify({ items: [] });
    const result = parseResponse(service, raw);
    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.ai_confidence).toBe(0); // NaN-safe: 0/0 → fallback 0
  });

  it('includes raw_ai_response when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'test';
    const raw = JSON.stringify({ items: [] });
    const result = parseResponse(service, raw);
    expect(result.raw_ai_response).toBe(raw);
  });

  it('omits raw_ai_response when NODE_ENV is production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const raw = JSON.stringify({ items: [] });
    const result = parseResponse(service, raw);
    expect(result.raw_ai_response).toBeUndefined();
    process.env.NODE_ENV = original;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseAIResponse — invalid JSON
// ─────────────────────────────────────────────────────────────────────────────
describe('AiService.parseAIResponse – invalid JSON', () => {
  let service: AiService;

  beforeEach(() => { service = makeService(); });

  it('returns success:false for malformed text', () => {
    const result = parseResponse(service, 'sorry, I could not recognize any food');
    expect(result.success).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(result.ai_confidence).toBe(0);
    expect(result.raw_ai_response).toBe('sorry, I could not recognize any food');
  });

  it('returns success:false for empty string', () => {
    const result = parseResponse(service, '');
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scanImage — delegates to parseAIResponse
// ─────────────────────────────────────────────────────────────────────────────
describe('AiService.scanImage', () => {
  it('calls generateContent and returns parsed result', async () => {
    const rawJson = JSON.stringify({
      items: [{ name: 'Rice', name_vi: 'Cơm', category: 'rice_dish', quantity: 1, unit: 'bowl', estimated_grams: 200, calories: 250, protein_g: 5, carbs_g: 50, fat_g: 2, confidence: 0.85 }],
    });
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({ response: { text: () => rawJson } }),
      }),
    }));
    const svc = makeService();
    const result = await svc.scanImage('base64data');
    expect(result.success).toBe(true);
    expect(result.items[0].name).toBe('Rice');
  });

  it('throws when Gemini API call fails', async () => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('API error')),
      }),
    }));
    const svc = makeService();
    await expect(svc.scanImage('base64data')).rejects.toThrow('API error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scanText
// ─────────────────────────────────────────────────────────────────────────────
describe('AiService.scanText', () => {
  it('returns parsed scan result for text input', async () => {
    const rawJson = JSON.stringify({ items: [] });
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({ response: { text: () => rawJson } }),
      }),
    }));
    const svc = makeService();
    const result = await svc.scanText('1 tô phở bò');
    expect(result.success).toBe(true);
  });

  it('throws when Gemini API call fails', async () => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('network error')),
      }),
    }));
    const svc = makeService();
    await expect(svc.scanText('phở')).rejects.toThrow('network error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refineScan
// ─────────────────────────────────────────────────────────────────────────────
describe('AiService.refineScan', () => {
  it('returns refined scan result', async () => {
    const rawJson = JSON.stringify({ items: [] });
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({ response: { text: () => rawJson } }),
      }),
    }));
    const svc = makeService();
    const result = await svc.refineScan('Phở bò 1 tô', 'tô lớn hơn bình thường');
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCoachReply
// ─────────────────────────────────────────────────────────────────────────────
describe('AiService.getCoachReply', () => {
  it('returns coach message', async () => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    (GoogleGenerativeAI as jest.Mock).mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockResolvedValue({ response: { text: () => '  Bạn đã ăn đủ!  ' } }),
      }),
    }));
    const svc = makeService();
    const result = await svc.getCoachReply('Tôi nên ăn gì?', { today_calories: 1200, target_calories: 1800 });
    expect(result.message).toBe('Bạn đã ăn đủ!');
    expect(result.suggestions).toEqual([]);
  });
});
