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
    const event = { event_type: 'portion_adjusted' as const, original_value: '100', corrected_value: '150' };
    const db = makeDb(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'e1', user_id: 'u1', ...event }, error: null }),
    }));
    const service = new TelemetryService({ db } as unknown as SupabaseService);
    const result = await service.createCorrectionEvent('u1', event);
    expect(result.id).toBe('e1');
    expect(result.event_type).toBe('portion_adjusted');
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
