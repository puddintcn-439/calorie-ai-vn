import { apiClient } from './api';
import { CorrectionEventDto } from '@calorie-ai/types';

class TelemetryService {
  /**
   * Emit a correction event when user corrects AI prediction
   * Used for quality tracking and AI model improvement
   */
  async emitCorrectionEvent(event: CorrectionEventDto): Promise<void> {
    try {
      await apiClient.post('/telemetry/corrections', event);
    } catch (error) {
      // Log but don't throw - telemetry failures should not break user experience
      console.warn('[Telemetry] Failed to emit correction event:', error);
    }
  }

  /**
   * Emit correction when user changes portion size in scan UI
   */
  async emitPortionAdjustment(
    foodName: string,
    originalPortion: number,
    correctedPortion: number,
    unit: string,
    originalCalories: number,
    correctedCalories: number,
  ): Promise<void> {
    return this.emitCorrectionEvent({
      event_type: 'portion_adjusted',
      food_name: foodName,
      original_portion: originalPortion,
      corrected_portion: correctedPortion,
      original_portion_unit: unit,
      original_calories: originalCalories,
      corrected_calories: correctedCalories,
      notes: `Portion adjusted from ${originalPortion}${unit} to ${correctedPortion}${unit}`,
    });
  }

  /**
   * Emit correction when user selects different food item than AI suggested
   */
  async emitItemMismatch(
    aiSuggestion: string,
    userCorrection: string,
    aiConfidence?: number,
  ): Promise<void> {
    return this.emitCorrectionEvent({
      event_type: 'item_mismatch',
      food_name: userCorrection,
      notes: `AI suggested "${aiSuggestion}", user corrected to "${userCorrection}"`,
      ai_confidence: aiConfidence,
    });
  }

  /**
   * Emit when AI confidence is low (< 0.6) on a scan
   */
  async emitLowConfidenceFlag(
    aiSuggestion: string,
    confidence: number,
  ): Promise<void> {
    return this.emitCorrectionEvent({
      event_type: 'confidence_low',
      food_name: aiSuggestion,
      ai_confidence: confidence,
      notes: `Low confidence scan: ${(confidence * 100).toFixed(1)}%`,
    });
  }
}

export const telemetryService = new TelemetryService();
