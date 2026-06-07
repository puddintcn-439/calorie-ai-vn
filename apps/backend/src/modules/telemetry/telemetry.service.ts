import { Injectable, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  BetaAnalyticsCalibrationBucket,
  BetaAnalyticsDailyEngagementItem,
  BetaAnalyticsInterventionItem,
  BetaAnalyticsSummary,
  CorrectionEvent,
  CorrectionEventDto,
  CorrectionStats,
  ForecastSnapshot,
  ForecastSnapshotDto,
  LoggingEvent,
  LoggingEventDto,
} from '@calorie-ai/types';

@Injectable()
export class TelemetryService {
  constructor(
    private supabase: SupabaseService,
    @Optional() private config?: ConfigService,
  ) {}

  async createLoggingEvent(userId: string, event: LoggingEventDto): Promise<LoggingEvent> {
    if (!event.event_type) {
      throw new BadRequestException('event_type is required');
    }

    if (!event.input_mode) {
      throw new BadRequestException('input_mode is required');
    }

    const { data, error } = await this.supabase.db
      .from('logging_events')
      .insert({ user_id: userId, ...event })
      .select()
      .single();

    if (error) throw error;
    return data as LoggingEvent;
  }

  async createForecastSnapshot(userId: string, snapshot: ForecastSnapshotDto): Promise<ForecastSnapshot> {
    if (!snapshot.local_date) {
      throw new BadRequestException('local_date is required');
    }

    if (!snapshot.source) {
      throw new BadRequestException('source is required');
    }

    const { data, error } = await this.supabase.db
      .from('behavior_forecast_snapshots')
      .upsert({
        user_id: userId,
        local_date: snapshot.local_date,
        source: snapshot.source,
        forecast_score: snapshot.forecast_score,
        forecast_label: snapshot.forecast_label,
        risk_level: snapshot.risk_level,
        confidence: snapshot.confidence,
        health_score_overall: snapshot.health_score_overall ?? null,
        adherence_score: snapshot.adherence_score ?? null,
        weakest_area: snapshot.weakest_area ?? null,
        forecast: snapshot.forecast ?? {},
        health_score: snapshot.health_score ?? {},
      }, { onConflict: 'user_id,local_date,source' })
      .select()
      .single();

    if (error) throw error;
    return data as ForecastSnapshot;
  }

  async getBetaAnalyticsSummary(requesterEmail: string | undefined, days = 30): Promise<BetaAnalyticsSummary> {
    this.assertBetaAnalyticsAdmin(requesterEmail);

    const windowDays = Math.max(7, Math.min(120, Math.round(days)));
    const sinceDate = this.toDateKey(new Date(Date.now() - (windowDays - 1) * 24 * 60 * 60 * 1000));
    const completedForecastCutoff = this.toDateKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const [forecastRes, calibrationRes, interventionRes, reminderRes, engagementRes] = await Promise.all([
      this.supabase.db
        .from('beta_forecast_accuracy_weekly')
        .select('local_date, forecast_score, actual_adherence_score, absolute_error, predicted_success, actual_success')
        .gte('local_date', sinceDate)
        .lte('local_date', completedForecastCutoff),
      this.supabase.db
        .from('beta_forecast_calibration')
        .select('bucket_order, forecast_bucket, samples, avg_forecast_score, actual_success_rate, calibration_error, calibration_status, confidence_level'),
      this.supabase.db
        .from('beta_intervention_performance_30d')
        .select('intervention_type, mode, primary_action, shown, acted, dismissed, action_rate, dismiss_rate, sample_status'),
      this.supabase.db
        .from('beta_reminder_fatigue_weekly')
        .select('week_start, sent, opened, acted, open_rate, action_rate, fatigue_flag')
        .gte('week_start', sinceDate),
      this.supabase.db
        .from('beta_daily_engagement_30d')
        .select('local_date, user_id, food_logs, activity_logs, roadmap_completed, interventions_shown, interventions_acted, forecast_snapshots')
        .gte('local_date', sinceDate),
    ]);

    if (forecastRes.error) throw forecastRes.error;
    if (calibrationRes.error) throw calibrationRes.error;
    if (interventionRes.error) throw interventionRes.error;
    if (reminderRes.error) throw reminderRes.error;
    if (engagementRes.error) throw engagementRes.error;

    const forecastRows = Array.isArray(forecastRes.data) ? forecastRes.data : [];
    const calibrationRows = Array.isArray(calibrationRes.data) ? calibrationRes.data : [];
    const interventionRows = Array.isArray(interventionRes.data) ? interventionRes.data : [];
    const reminderRows = Array.isArray(reminderRes.data) ? reminderRes.data : [];
    const engagementRows = Array.isArray(engagementRes.data) ? engagementRes.data : [];

    const forecast = this.buildForecastAnalytics(forecastRows);
    const calibration = this.buildCalibrationAnalytics(calibrationRows);
    const interventions = this.buildInterventionAnalyticsSummary(interventionRows);
    const reminders = this.buildReminderAnalytics(reminderRows);
    const engagement = this.buildEngagementAnalytics(engagementRows);

    return {
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      access: 'admin',
      forecast,
      calibration,
      interventions,
      reminders,
      engagement,
      recommendations: this.buildBetaAnalyticsRecommendations(forecast, calibration, interventions, reminders, engagement),
    };
  }

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

  /**
   * Create a context event (stress, period, travel, etc activation/deactivation)
   */
  async createContextEvent(
    userId: string,
    event: { context_mode: string; action: 'activated' | 'deactivated'; timestamp?: string },
  ): Promise<any> {
    if (!event.context_mode) {
      throw new BadRequestException('context_mode is required');
    }

    if (!event.action) {
      throw new BadRequestException('action is required');
    }

    const timestamp = event.timestamp || new Date().toISOString();

    const { data, error } = await this.supabase.db
      .from('user_context_events')
      .insert({ user_id: userId, context_mode: event.context_mode, action: event.action, created_at: timestamp })
      .select()
      .single();

    if (error) {
      // Log but don't throw - this is optional telemetry
      console.warn('[Telemetry] Failed to record context event:', error);
      return { success: false };
    }

    return data;
  }

  private assertBetaAnalyticsAdmin(email: string | undefined) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const raw = [
      this.config?.get<string>('BETA_ANALYTICS_ADMIN_EMAILS'),
      this.config?.get<string>('ADMIN_EMAILS'),
    ].filter(Boolean).join(',');
    const admins = raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!normalizedEmail || admins.length === 0 || (!admins.includes('*') && !admins.includes(normalizedEmail))) {
      throw new ForbiddenException('Beta analytics is restricted to configured admin emails');
    }
  }

  private buildForecastAnalytics(rows: any[]): BetaAnalyticsSummary['forecast'] {
    const snapshots = rows.length;
    const avgAbsoluteError = this.avg(rows.map((row) => Number(row.absolute_error)));
    const classificationAccuracy = snapshots > 0
      ? Math.round((rows.filter((row) => row.predicted_success === row.actual_success).length / snapshots) * 100)
      : 0;
    const avgForecastScore = this.avg(rows.map((row) => Number(row.forecast_score)));
    const avgActualAdherence = this.avg(rows.map((row) => Number(row.actual_adherence_score)));
    const sampleStatus: BetaAnalyticsSummary['forecast']['sample_status'] = snapshots >= 100
      ? 'ready'
      : snapshots >= 20
        ? 'learning'
        : 'insufficient';

    return {
      snapshots,
      avg_absolute_error: avgAbsoluteError,
      classification_accuracy: classificationAccuracy,
      avg_forecast_score: avgForecastScore,
      avg_actual_adherence: avgActualAdherence,
      sample_status: sampleStatus,
    };
  }

  private buildCalibrationAnalytics(rows: any[]): BetaAnalyticsSummary['calibration'] {
    const buckets = rows
      .map((row): BetaAnalyticsCalibrationBucket => ({
        bucket_order: Number(row.bucket_order) || 0,
        forecast_bucket: String(row.forecast_bucket ?? 'unknown'),
        samples: Number(row.samples) || 0,
        avg_forecast_score: Number(row.avg_forecast_score) || 0,
        actual_success_rate: Number(row.actual_success_rate) || 0,
        calibration_error: Number(row.calibration_error) || 0,
        calibration_status: ['insufficient', 'underconfident', 'calibrated', 'overconfident'].includes(String(row.calibration_status))
          ? row.calibration_status
          : 'insufficient',
        confidence_level: ['low', 'medium', 'high'].includes(String(row.confidence_level))
          ? row.confidence_level
          : 'low',
      }))
      .sort((a, b) => a.bucket_order - b.bucket_order);
    const totalSamples = buckets.reduce((sum, bucket) => sum + bucket.samples, 0);
    const weightedError = totalSamples > 0
      ? Math.round((buckets.reduce((sum, bucket) => sum + bucket.calibration_error * bucket.samples, 0) / totalSamples) * 10) / 10
      : 0;
    const worstBucket = buckets
      .filter((bucket) => bucket.samples > 0)
      .sort((a, b) => b.calibration_error - a.calibration_error || b.samples - a.samples)[0]?.forecast_bucket ?? null;
    const status: BetaAnalyticsSummary['calibration']['status'] = totalSamples < 100
      ? 'insufficient'
      : weightedError <= 10
        ? 'calibrated'
        : 'needs_attention';

    return {
      buckets,
      total_samples: totalSamples,
      avg_calibration_error: weightedError,
      worst_bucket: worstBucket,
      status,
    };
  }

  private buildInterventionAnalyticsSummary(rows: any[]): BetaAnalyticsSummary['interventions'] {
    const grouped = rows.reduce<Record<string, BetaAnalyticsInterventionItem>>((acc, row) => {
      const interventionType = String(row.intervention_type ?? 'unknown');
      const mode = String(row.mode ?? 'unknown');
      const primaryAction = String(row.primary_action ?? 'unknown');
      const key = `${interventionType}|${mode}|${primaryAction}`;
      acc[key] = acc[key] ?? {
        intervention_type: interventionType,
        mode,
        primary_action: primaryAction,
        shown: 0,
        acted: 0,
        dismissed: 0,
        action_rate: 0,
        dismiss_rate: 0,
        sample_status: 'insufficient',
      };
      acc[key].shown += Number(row.shown) || 0;
      acc[key].acted += Number(row.acted) || 0;
      acc[key].dismissed += Number(row.dismissed) || 0;
      return acc;
    }, {});
    const items = Object.values(grouped).map((item) => {
      const actionRate = item.shown > 0 ? Math.round((item.acted / item.shown) * 100) : 0;
      const dismissRate = item.shown > 0 ? Math.round((item.dismissed / item.shown) * 100) : 0;
      const sampleStatus: BetaAnalyticsInterventionItem['sample_status'] = item.shown >= 20
        ? 'ready'
        : item.shown > 0
          ? 'learning'
          : 'insufficient';
      return {
        ...item,
        action_rate: actionRate,
        dismiss_rate: dismissRate,
        sample_status: sampleStatus,
      };
    });
    const totalShown = items.reduce((sum, item) => sum + item.shown, 0);
    const totalActed = items.reduce((sum, item) => sum + item.acted, 0);
    const totalDismissed = items.reduce((sum, item) => sum + item.dismissed, 0);

    return {
      total_shown: totalShown,
      total_acted: totalActed,
      total_dismissed: totalDismissed,
      action_rate: totalShown > 0 ? Math.round((totalActed / totalShown) * 100) : 0,
      dismiss_rate: totalShown > 0 ? Math.round((totalDismissed / totalShown) * 100) : 0,
      ready_count: items.filter((item) => item.sample_status === 'ready').length,
      top_effective: [...items].sort((a, b) => b.action_rate - a.action_rate || b.shown - a.shown).slice(0, 5),
      top_ignored: [...items].sort((a, b) => b.dismiss_rate - a.dismiss_rate || b.shown - a.shown).slice(0, 5),
    };
  }

  private buildReminderAnalytics(rows: any[]): BetaAnalyticsSummary['reminders'] {
    const weeks = rows.length;
    const avgOpenRate = this.avg(rows.map((row) => Number(row.open_rate)));
    const avgActionRate = this.avg(rows.map((row) => Number(row.action_rate)));
    const fatigueWeeks = rows.filter((row) => row.fatigue_flag === true).length;
    const fatigueLevel: BetaAnalyticsSummary['reminders']['fatigue_level'] = fatigueWeeks >= 3
      ? 'high'
      : fatigueWeeks >= 1
        ? 'medium'
        : 'low';

    return {
      weeks,
      avg_open_rate: avgOpenRate,
      avg_action_rate: avgActionRate,
      fatigue_weeks: fatigueWeeks,
      fatigue_level: fatigueLevel,
    };
  }

  private buildEngagementAnalytics(rows: any[]): BetaAnalyticsSummary['engagement'] {
    const isActiveRow = (row: any) => {
      const foodLogs = Number(row.food_logs) || 0;
      const activityLogs = Number(row.activity_logs) || 0;
      const roadmapCompleted = Number(row.roadmap_completed) || 0;
      const interventionsActed = Number(row.interventions_acted) || 0;
      return foodLogs > 0 || activityLogs > 0 || roadmapCompleted > 0 || interventionsActed > 0;
    };
    const byDate = rows.reduce<Record<string, BetaAnalyticsDailyEngagementItem>>((acc, row) => {
      const key = String(row.local_date ?? '');
      if (!key) return acc;
      acc[key] = acc[key] ?? {
        local_date: key,
        active_users: 0,
        food_logs: 0,
        activity_logs: 0,
        roadmap_completed: 0,
        interventions_shown: 0,
        interventions_acted: 0,
        forecast_snapshots: 0,
      };

      const foodLogs = Number(row.food_logs) || 0;
      const activityLogs = Number(row.activity_logs) || 0;
      const roadmapCompleted = Number(row.roadmap_completed) || 0;
      const interventionsShown = Number(row.interventions_shown) || 0;
      const interventionsActed = Number(row.interventions_acted) || 0;
      const forecastSnapshots = Number(row.forecast_snapshots) || 0;
      const active = isActiveRow(row);

      acc[key].active_users += active ? 1 : 0;
      acc[key].food_logs += foodLogs;
      acc[key].activity_logs += activityLogs;
      acc[key].roadmap_completed += roadmapCompleted;
      acc[key].interventions_shown += interventionsShown;
      acc[key].interventions_acted += interventionsActed;
      acc[key].forecast_snapshots += forecastSnapshots;
      return acc;
    }, {});
    const daily = Object.values(byDate).sort((a, b) => b.local_date.localeCompare(a.local_date));
    const recent7 = daily.slice(0, 7);
    const recent7Dates = new Set(recent7.map((day) => day.local_date));
    const activeUsers7d = new Set(rows
      .filter((row) => recent7Dates.has(String(row.local_date ?? '')) && isActiveRow(row))
      .map((row) => String(row.user_id ?? ''))
      .filter(Boolean)).size;
    const activeUsers30d = new Set(rows
      .filter((row) => isActiveRow(row))
      .map((row) => String(row.user_id ?? ''))
      .filter(Boolean)).size;
    const activeDays = daily.filter((day) => day.active_users > 0);

    return {
      active_users_7d: activeUsers7d,
      active_users_30d: activeUsers30d,
      avg_food_logs_per_active_day: this.avg(activeDays.map((day) => day.food_logs)),
      avg_activity_logs_per_active_day: this.avg(activeDays.map((day) => day.activity_logs)),
      recent_daily: daily.slice(0, 14),
    };
  }

  private buildBetaAnalyticsRecommendations(
    forecast: BetaAnalyticsSummary['forecast'],
    calibration: BetaAnalyticsSummary['calibration'],
    interventions: BetaAnalyticsSummary['interventions'],
    reminders: BetaAnalyticsSummary['reminders'],
    engagement: BetaAnalyticsSummary['engagement'],
  ): string[] {
    const notes: string[] = [];
    if (forecast.sample_status !== 'ready') notes.push(`Collect more forecast outcomes before tuning weights (${forecast.snapshots}/100).`);
    if (forecast.snapshots > 0 && forecast.avg_absolute_error > 20) notes.push('Forecast error is high; inspect high-confidence misses before changing intervention logic.');
    if (calibration.status === 'insufficient') notes.push(`Collect more calibration outcomes before trusting forecast probabilities (${calibration.total_samples}/100).`);
    if (calibration.status === 'needs_attention' && calibration.worst_bucket) notes.push(`Forecast calibration is off in the ${calibration.worst_bucket} bucket; review over/underconfidence before Adaptive v2.`);
    if (interventions.ready_count === 0) notes.push('Keep Dynamic Intervention rules conservative until at least one intervention has 20 shown events.');
    if (interventions.dismiss_rate >= 30) notes.push('Intervention dismiss rate is high; review copy/timing before increasing frequency.');
    if (reminders.fatigue_level !== 'low') notes.push('Reminder fatigue is visible; reduce frequency or shift timing for ignored reminders.');
    if (engagement.active_users_7d < 10) notes.push('Treat metrics as instrumentation checks until at least 10 active beta users are present.');
    return notes.slice(0, 5);
  }

  private avg(values: number[]): number {
    const clean = values.filter((value) => Number.isFinite(value));
    return clean.length > 0 ? Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10 : 0;
  }

  private toDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
