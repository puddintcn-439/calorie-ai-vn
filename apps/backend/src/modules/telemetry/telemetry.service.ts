import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CorrectionEvent, CorrectionEventDto, CorrectionStats } from '@calorie-ai/types';

@Injectable()
export class TelemetryService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Create a correction event in the database
   */
  async createCorrectionEvent(userId: string, event: CorrectionEventDto): Promise<CorrectionEvent> {
    if (!event.event_type) {
      throw new BadRequestException('event_type is required');
    }

    const { data, error } = await this.supabase.db
      .from('correction_events')
      .insert({ user_id: userId, ...event })
      .select()
      .single();

    if (error) throw error;
    return data as CorrectionEvent;
  }

  /**
   * Get correction events for a user within date range
   */
  async getUserCorrectionEvents(
    userId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<CorrectionEvent[]> {
    const { data, error } = await this.supabase.db
      .from('correction_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return (data ?? []) as CorrectionEvent[];
  }

  /**
   * Get correction statistics for a user
   */
  async getUserCorrectionStats(userId: string, days: number = 30): Promise<CorrectionStats> {
    // Get all corrections in the last N days
    const { data, error } = await this.supabase.db
      .from('correction_events')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    const events = (data ?? []) as CorrectionEvent[];
    if (events.length === 0) {
      return {
        total_corrections: 0,
        corrected_items_percentage: 0,
        most_common_correction_type: 'portion_adjusted',
        avg_ai_confidence: 0,
      };
    }

    // Calculate statistics
    const total_corrections = events.length;
    const eventTypeCounts = events.reduce((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const most_common_correction_type = (Object.entries(eventTypeCounts).sort(
      ([, a], [, b]) => b - a,
    )[0]?.[0] ?? 'portion_adjusted') as any;

    const confidences = events
      .filter(e => e.ai_confidence)
      .map(e => e.ai_confidence!);
    const avg_ai_confidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    // Get user's total food logs in the period to calculate percentage
    const { data: logs, error: logsError } = await this.supabase.db
      .from('food_logs')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (logsError) throw logsError;

    const corrected_items_percentage =
      logs && logs.length > 0 ? (total_corrections / logs.length) * 100 : 0;

    return {
      total_corrections,
      corrected_items_percentage,
      most_common_correction_type,
      avg_ai_confidence: Math.round(avg_ai_confidence * 100) / 100,
    };
  }
}
