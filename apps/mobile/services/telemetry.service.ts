import { apiClient } from './api';
import { CorrectionEventDto, ForecastSnapshotDto, LoggingEventDto, LoggingInputMode, ContextMode } from '@calorie-ai/types';
import { appLogger } from './logger.service';

class TelemetryService {
  async emitLoggingEvent(event: LoggingEventDto): Promise<void> {
    try {
      await apiClient.post('/telemetry/logging-events', event);
    } catch (error) {
      appLogger.warn('Telemetry', 'Failed to emit logging event', error);
    }
  }

  async emitForecastSnapshot(snapshot: ForecastSnapshotDto): Promise<void> {
    try {
      await apiClient.post('/telemetry/forecast-snapshots', snapshot);
    } catch (error) {
      appLogger.warn('Telemetry', 'Failed to emit forecast snapshot', error);
    }
  }

  async emitLogAttempted(inputMode: LoggingInputMode): Promise<void> {
    return this.emitLoggingEvent({
      event_type: 'log_attempted',
      input_mode: inputMode,
    });
  }

  async emitLogParsed(
    inputMode: LoggingInputMode,
    payload: {
      elapsed_ms: number;
      item_count: number;
      ai_confidence?: number;
      correction_count?: number;
    },
  ): Promise<void> {
    return this.emitLoggingEvent({
      event_type: 'log_parsed',
      input_mode: inputMode,
      ...payload,
    });
  }

  async emitLogFailed(
    inputMode: LoggingInputMode,
    reasonCode: string,
    elapsedMs?: number,
  ): Promise<void> {
    return this.emitLoggingEvent({
      event_type: 'log_failed',
      input_mode: inputMode,
      reason_code: reasonCode,
      elapsed_ms: elapsedMs,
    });
  }

  /**
   * Emit a correction event when user corrects AI prediction
   * Used for quality tracking and AI model improvement
   */
  async emitCorrectionEvent(event: CorrectionEventDto): Promise<void> {
    try {
      await apiClient.post('/telemetry/corrections', event);
    } catch (error) {
      appLogger.warn('Telemetry', 'Failed to emit correction event', error);
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

  /**
   * Emit when user activates or deactivates a life context (stress, period, travel, etc)
   */
  async emitContextToggled(context: ContextMode, isActive: boolean): Promise<void> {
    try {
      await apiClient.post('/telemetry/context-events', {
        context_mode: context,
        action: isActive ? 'activated' : 'deactivated',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      appLogger.warn('Telemetry', 'Failed to emit context event', error);
    }
  }
}

export const telemetryService = new TelemetryService();
