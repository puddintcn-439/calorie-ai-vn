import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  BodyProgressEntry,
  CreateBodyProgressDto,
  BodyProgressTrend,
} from '@calorie-ai/types';

@Injectable()
export class BodyProgressService {
  private readonly logger = new Logger(BodyProgressService.name);

  constructor(private supabase: SupabaseService) {}

  async upsertEntry(userId: string, dto: CreateBodyProgressDto): Promise<BodyProgressEntry> {
    const date = dto.recorded_at ?? new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.db
      .from('body_progress')
      .upsert(
        { user_id: userId, recorded_at: date, ...dto },
        { onConflict: 'user_id,recorded_at' },
      )
      .select()
      .single();

    if (error) throw error;
    return data as BodyProgressEntry;
  }

  async getEntries(userId: string, limit = 90): Promise<BodyProgressEntry[]> {
    const { data, error } = await this.supabase.db
      .from('body_progress')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as BodyProgressEntry[];
  }

  async getEntry(userId: string, date: string): Promise<BodyProgressEntry | null> {
    const { data, error } = await this.supabase.db
      .from('body_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('recorded_at', date)
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as BodyProgressEntry | null;
  }

  async deleteEntry(userId: string, id: number): Promise<void> {
    const { error } = await this.supabase.db
      .from('body_progress')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getTrend(userId: string): Promise<BodyProgressTrend> {
    const entries = await this.getEntries(userId, 90);
    const sorted = [...entries].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );

    if (sorted.length === 0) {
      return {
        entries,
        weight_change_kg: null,
        weight_change_7d: null,
        waist_change_cm: null,
        days_tracked: 0,
        latest_entry: null,
        first_entry: null,
      };
    }

    const latest = sorted[sorted.length - 1];
    const first = sorted[0];

    // 7-day comparison
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const entrySevenDaysAgo = sorted
      .filter((e) => new Date(e.recorded_at) <= sevenDaysAgo)
      .pop(); // closest to 7 days ago

    const weight_change_kg =
      latest.weight_kg != null && first.weight_kg != null
        ? Math.round((latest.weight_kg - first.weight_kg) * 10) / 10
        : null;

    const weight_change_7d =
      latest.weight_kg != null && entrySevenDaysAgo?.weight_kg != null
        ? Math.round((latest.weight_kg - entrySevenDaysAgo.weight_kg) * 10) / 10
        : null;

    const waist_change_cm =
      latest.waist_cm != null && first.waist_cm != null
        ? Math.round((latest.waist_cm - first.waist_cm) * 10) / 10
        : null;

    return {
      entries: sorted.reverse(), // newest first for display
      weight_change_kg,
      weight_change_7d,
      waist_change_cm,
      days_tracked: sorted.length,
      latest_entry: latest,
      first_entry: first,
    };
  }
}
