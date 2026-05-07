import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { AIScanResponse, AIDetectedItem, AICoachResponse } from '@calorie-ai/types';
import { randomUUID } from 'crypto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(private config: ConfigService) {
    this.genAI = new GoogleGenerativeAI(this.config.getOrThrow('GEMINI_API_KEY'));
  }

  async scanImage(imageBase64: string, mimeType = 'image/jpeg'): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const imagePart: Part = {
      inlineData: { data: imageBase64, mimeType },
    };

    const prompt = FOOD_SCAN_PROMPT;

    try {
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      return this.parseAIResponse(text, Date.now() - start);
    } catch (error) {
      this.logger.error('Gemini scan failed', error);
      throw error;
    }
  }

  async scanText(textInput: string): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `${FOOD_TEXT_PROMPT}\n\nNgười dùng nhập: "${textInput}"`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return this.parseAIResponse(text, Date.now() - start);
    } catch (error) {
      this.logger.error('Gemini text scan failed', error);
      throw error;
    }
  }

  async refineScan(originalItemsSummary: string, context: string): Promise<AIScanResponse> {
    const start = Date.now();
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `${FOOD_REFINE_PROMPT}

Kết quả scan ban đầu:
${originalItemsSummary}

Thông tin bổ sung: "${context}"

Điều chỉnh lại ước lượng dựa trên thông tin bổ sung.`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return this.parseAIResponse(text, Date.now() - start);
    } catch (error) {
      this.logger.error('Gemini refine scan failed', error);
      throw error;
    }
  }

  async getCoachReply(
    message: string,
    context: { today_calories: number; target_calories: number },
  ): Promise<AICoachResponse> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `${COACH_SYSTEM_PROMPT}

Thông tin người dùng hôm nay:
- Đã ăn: ${context.today_calories} kcal
- Mục tiêu: ${context.target_calories} kcal
- Còn lại: ${context.target_calories - context.today_calories} kcal

Người dùng hỏi: "${message}"

Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Không quá 3 câu.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return {
      message: text.trim(),
      suggestions: [],
    };
  }

  private parseAIResponse(rawText: string, processingMs: number): AIScanResponse {
    try {
      // Extract JSON block from markdown code fences if present
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      const parsed = JSON.parse(jsonStr.trim());

      const items: AIDetectedItem[] = (parsed.items ?? []).map((item: any) => ({
        name: item.name ?? '',
        name_vi: item.name_vi ?? item.name ?? '',
        category: item.category ?? 'other',
        quantity: Number(item.quantity) || 1,
        unit: item.unit ?? 'gram',
        estimated_grams: Number(item.estimated_grams) || 100,
        calories: Number(item.calories) || 0,
        protein_g: Number(item.protein_g) || 0,
        carbs_g: Number(item.carbs_g) || 0,
        fat_g: Number(item.fat_g) || 0,
        confidence: Number(item.confidence) || 0.7,
      }));

      return {
        success: true,
        scan_id: randomUUID(),
        items,
        total_calories: items.reduce((s, i) => s + i.calories, 0),
        total_protein_g: items.reduce((s, i) => s + i.protein_g, 0),
        total_carbs_g: items.reduce((s, i) => s + i.carbs_g, 0),
        total_fat_g: items.reduce((s, i) => s + i.fat_g, 0),
        ai_confidence: items.reduce((s, i) => s + i.confidence, 0) / (items.length || 1),
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
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
        ai_confidence: 0,
        raw_ai_response: rawText,
        processing_ms: processingMs,
      };
    }
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
      "protein_g": 25,
      "carbs_g": 55,
      "fat_g": 12,
      "confidence": 0.92
    }
  ]
}

Quy tắc:
- Ước lượng khẩu phần thực tế (không phải 100g)
- Tách riêng từng món trong ảnh
- category phải là 1 trong: rice_dish, noodle, meat, seafood, vegetable, fruit, drink, snack, dessert, fast_food, other
- confidence từ 0 đến 1
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
      "protein_g": 28,
      "carbs_g": 75,
      "fat_g": 22,
      "confidence": 0.85
    }
  ]
}

Nếu nhập nhiều món, tách ra từng item. Ước lượng khẩu phần thực tế cho người Việt.`;

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
      "confidence": 0.95
    }
  ]
}

Quy tắc:
- Dựa vào thông tin bổ sung để điều chỉnh khẩu phần và calories cho chính xác hơn
- Nếu người dùng nói "thêm trứng" thì add trứng vào items
- Nếu người dùng nói "2 phần" thì nhân đôi calories
- category phải là 1 trong: rice_dish, noodle, meat, seafood, vegetable, fruit, drink, snack, dessert, fast_food, other`;

const COACH_SYSTEM_PROMPT = `Bạn là AI coach dinh dưỡng thân thiện, chuyên về ẩm thực Việt Nam. 
Mục tiêu: giúp người dùng ăn uống lành mạnh, đạt mục tiêu cân nặng.
Phong cách: vui vẻ, thực tế, không phán xét.`;
