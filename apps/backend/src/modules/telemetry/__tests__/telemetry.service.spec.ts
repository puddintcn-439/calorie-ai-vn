import { TelemetryService } from '../telemetry.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { BadRequestException } from '@nestjs/common';

function makeDb(fromImpl?: (table: string) => unknown) {
  return {
    from: fromImpl ?? jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
}

describe('TelemetryService.createCorrectionEvent', () => {
  it('throws BadRequestException when event_type is missing', async () => {
    const service = new TelemetryService({ db: makeDb() } as unknown as SupabaseService);
    await expect(service.createCorrectionEvent('u1', {} as any)).rejects.toThrow(BadRequestException);
  });

  it('inserts and returns correction event', async () => {
    const insert = jest.fn().mockReturnThis();
    const event = { event_type: 'portion_adjusted' as const, original_value: '100', corrected_value: '150' };
    const db = makeDb(() => ({
      insert,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'e1', user_id: 'u1', ...event }, error: null }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    const result = await service.createCorrectionEvent('u1', event);
    expect(result.id).toBe('e1');
    expect(result.event_type).toBe('portion_adjusted');
    expect(insert).toHaveBeenCalledWith(expect.not.objectContaining({ scan_image_url: expect.anything() }));
  });

  it('redacts notes and drops direct image urls before insert', async () => {
    const insert = jest.fn().mockReturnThis();
    const db = makeDb(() => ({
      insert,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'e2', user_id: 'u1', event_type: 'item_mismatch' }, error: null }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);

    await service.createCorrectionEvent('u1', {
      event_type: 'item_mismatch',
      food_name: 'pho bo',
      scan_image_url: 'https://cdn.example.com/photo.jpg',
      notes: 'email me at tester@example.com, photo at https://cdn.example.com/photo.jpg',
    } as any);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      notes: expect.stringContaining('[redacted-email]'),
    }));
    expect(insert).toHaveBeenCalledWith(expect.not.objectContaining({ scan_image_url: expect.anything() }));
  });


describe('TelemetryService.createLoggingEvent', () => {
  it('redacts free-form metadata before insert', async () => {
    const insert = jest.fn().mockReturnThis();
    const db = makeDb(() => ({
      insert,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'l1', user_id: 'u1', event_type: 'log_failed', input_mode: 'image' }, error: null }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);

    await service.createLoggingEvent('u1', {
      event_type: 'log_failed',
      input_mode: 'image',
      reason_code: 'mailto:tester@example.com failed',
      metadata: {
        email: 'tester@example.com',
        image_url: 'https://cdn.example.com/raw.jpg',
        debug: 'https://internal.example.com should be hidden',
        nested: { token: 'abc123456789012345678901234567', note: 'call +84 912 345 678' },
      },
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      reason_code: expect.stringContaining('[redacted-email]'),
      metadata: {
        debug: '[redacted-url] should be hidden',
        nested: { note: 'call [redacted-phone]' },
      },
    }));
  });
});
  it('throws when DB insert fails', async () => {
    const db = makeDb(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    await expect(service.createCorrectionEvent('u1', { event_type: 'portion_adjusted' } as any))
      .rejects.toThrow('db error');
  });
});

describe('TelemetryService.createForecastSnapshot', () => {
  it('upserts and returns forecast snapshot', async () => {
    const upsert = jest.fn().mockReturnThis();
    const db = makeDb(() => ({
      upsert,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'snapshot-1',
          user_id: 'u1',
          local_date: '2026-06-07',
          source: 'today',
          forecast_score: 78,
          forecast_label: 'on_track',
          risk_level: 'medium',
          confidence: 'high',
        },
        error: null,
      }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);

    const result = await service.createForecastSnapshot('u1', {
      local_date: '2026-06-07',
      source: 'today',
      forecast_score: 78,
      forecast_label: 'on_track',
      risk_level: 'medium',
      confidence: 'high',
      health_score_overall: 80,
      adherence_score: 76,
      weakest_area: 'activity',
      forecast: { score: 78 },
      health_score: { overall: 80 },
    });

    expect(result.id).toBe('snapshot-1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      local_date: '2026-06-07',
      source: 'today',
      forecast_score: 78,
      health_score_overall: 80,
    }), { onConflict: 'user_id,local_date,source' });
  });

  it('throws BadRequestException when local_date is missing', async () => {
    const service = new TelemetryService({ db: makeDb() } as unknown as SupabaseService);
    await expect(service.createForecastSnapshot('u1', { source: 'today' } as any))
      .rejects.toThrow(BadRequestException);
  });
});

describe('TelemetryService.getBetaAnalyticsSummary', () => {
  function query(data: unknown[]) {
    return {
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockResolvedValue({ data, error: null }),
    };
  }

  it('rejects non-admin users', async () => {
    const service = new TelemetryService(
      { db: makeDb() } as unknown as SupabaseService,
      { get: jest.fn().mockReturnValue('admin@example.com') } as any,
    );

    await expect(service.getBetaAnalyticsSummary('user@example.com')).rejects.toThrow('restricted');
  });

  it('returns aggregate beta analytics for configured admin email', async () => {
    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'beta_forecast_accuracy_weekly') {
          return query([
            { local_date: '2026-06-01', forecast_score: 80, actual_adherence_score: 70, absolute_error: 10, predicted_success: true, actual_success: true },
            { local_date: '2026-06-02', forecast_score: 40, actual_adherence_score: 75, absolute_error: 35, predicted_success: false, actual_success: true },
          ]);
        }
        if (table === 'beta_intervention_performance_30d') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { intervention_type: 'protein_nudge', mode: 'coach_action', primary_action: 'log_meal', shown: 25, acted: 18, dismissed: 2, action_rate: 72, dismiss_rate: 8, sample_status: 'ready' },
                { intervention_type: 'protein_nudge', mode: 'coach_action', primary_action: 'log_meal', shown: 5, acted: 2, dismissed: 1, action_rate: 40, dismiss_rate: 20, sample_status: 'learning' },
                { intervention_type: 'reminder_tuning', mode: 'light_nudge', primary_action: 'adjust_reminders', shown: 12, acted: 1, dismissed: 6, action_rate: 8, dismiss_rate: 50, sample_status: 'learning' },
              ],
              error: null,
            }),
          };
        }
        if (table === 'beta_forecast_calibration') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { bucket_order: 4, forecast_bucket: '60-80', samples: 30, avg_forecast_score: 70, actual_success_rate: 68, calibration_error: 2, calibration_status: 'calibrated', confidence_level: 'medium' },
                { bucket_order: 5, forecast_bucket: '80-100', samples: 10, avg_forecast_score: 86, actual_success_rate: 40, calibration_error: 46, calibration_status: 'insufficient', confidence_level: 'low' },
              ],
              error: null,
            }),
          };
        }
        if (table === 'beta_reminder_fatigue_weekly') {
          return {
            select: jest.fn().mockReturnThis(),
            gte: jest.fn().mockResolvedValue({
              data: [
                { week_start: '2026-06-01', open_rate: 70, action_rate: 40, fatigue_flag: false },
                { week_start: '2026-06-08', open_rate: 40, action_rate: 18, fatigue_flag: true },
              ],
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue({
            data: [
              { local_date: '2026-06-01', user_id: 'u1', food_logs: 2, activity_logs: 1, roadmap_completed: 1, interventions_shown: 1, interventions_acted: 1, forecast_snapshots: 1 },
              { local_date: '2026-06-01', user_id: 'u2', food_logs: 0, activity_logs: 0, roadmap_completed: 0, interventions_shown: 1, interventions_acted: 0, forecast_snapshots: 1 },
            ],
            error: null,
          }),
        };
      }),
    };
    const service = new TelemetryService(
      { db } as unknown as SupabaseService,
      { get: jest.fn().mockReturnValue('admin@example.com') } as any,
    );

    const summary = await service.getBetaAnalyticsSummary('admin@example.com');

    expect(summary.forecast.snapshots).toBe(2);
    expect(summary.forecast.classification_accuracy).toBe(50);
    expect(summary.calibration.total_samples).toBe(40);
    expect(summary.calibration.worst_bucket).toBe('80-100');
    expect(summary.interventions.ready_count).toBe(1);
    expect(summary.interventions.top_effective[0].intervention_type).toBe('protein_nudge');
    expect(summary.interventions.top_effective[0].shown).toBe(30);
    expect(summary.interventions.top_effective[0].action_rate).toBe(67);
    expect(summary.reminders.fatigue_level).toBe('medium');
    expect(summary.engagement.active_users_30d).toBe(1);
    expect(summary.recommendations.length).toBeGreaterThan(0);
  });
});

describe('TelemetryService.getUserCorrectionEvents', () => {
  it('returns list of events', async () => {
    const events = [{ id: 'e1', event_type: 'portion_adjusted' }];
    const db = makeDb(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: events, error: null }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    const result = await service.getUserCorrectionEvents('u1');
    expect(result).toHaveLength(1);
  });

  it('throws when DB query fails', async () => {
    const db = makeDb(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({ data: null, error: new Error('query error') }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    await expect(service.getUserCorrectionEvents('u1')).rejects.toThrow('query error');
  });
});

describe('TelemetryService.getUserCorrectionStats', () => {
  it('returns zeroed stats when no events', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    const stats = await service.getUserCorrectionStats('u1');
    expect(stats.total_corrections).toBe(0);
    expect(stats.avg_ai_confidence).toBe(0);
    expect(stats.corrected_items_percentage).toBe(0);
  });

  it('calculates stats correctly from events', async () => {
    const events = [
      { event_type: 'portion_adjusted', ai_confidence: 0.8 },
      { event_type: 'portion_adjusted', ai_confidence: 0.6 },
      { event_type: 'item_removed', ai_confidence: null },
    ];
    const logs = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }, { id: 'l4' }];

    const db = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'correction_events') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            gte: jest.fn().mockResolvedValue({ data: events, error: null }),
          };
        }
        // food_logs
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockResolvedValue({ data: logs, error: null }),
        };
      }),
    };

    const service = new TelemetryService({ db } as unknown as SupabaseService);
    const stats = await service.getUserCorrectionStats('u1');
    expect(stats.total_corrections).toBe(3);
    expect(stats.most_common_correction_type).toBe('portion_adjusted');
    expect(stats.avg_ai_confidence).toBeCloseTo(0.7);
    expect(stats.corrected_items_percentage).toBeCloseTo(75); // 3/4 * 100
  });

  it('throws when correction events query fails', async () => {
    const db = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue({ data: null, error: new Error('stats error') }),
      }),
    };
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    await expect(service.getUserCorrectionStats('u1')).rejects.toThrow('stats error');
  });
});
