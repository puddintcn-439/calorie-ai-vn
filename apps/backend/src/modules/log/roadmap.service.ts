import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  DailyRoadmapItem,
  CreateDailyRoadmapItemDto,
  UpdateDailyRoadmapItemDto,
  DailyRoadmapSyncDto,
  ActivityPreference,
  CreateActivityPreferenceDto,
  UpdateActivityPreferenceDto,
} from '@calorie-ai/types';

@Injectable()
export class RoadmapService implements OnModuleInit {
  private tableInitialized = false;
  private activityPreferenceTableInitialized = false;

  constructor(private supabase: SupabaseService) {}

  async onModuleInit() {
    await this.ensureTableExists();
    await this.ensureActivityPreferenceTableExists();
  }

  private async ensureTableExists(): Promise<void> {
    if (this.tableInitialized) return;

    try {
      // Try to query the table to see if it exists
      const { error } = await this.supabase.db
        .from('user_daily_roadmap')
        .select('id')
        .limit(1);

      if (error?.code === 'PGRST116') {
        // Table doesn't exist, try to create it
        console.log('[RoadmapService] Creating user_daily_roadmap table...');
        
        const migration = `
          CREATE TABLE IF NOT EXISTS public.user_daily_roadmap (
            id              uuid primary key default gen_random_uuid(),
            user_id         uuid not null references public.users(id) on delete cascade,
            logged_date     date not null,
            task_id         text not null,
            task_title      text not null,
            activity_type   text not null,
            duration_min    integer not null default 30,
            estimated_kcal  integer not null default 0,
            is_custom       boolean default false,
            is_removed      boolean default false,
            is_completed    boolean default false,
            created_at      timestamptz default now(),
            updated_at      timestamptz default now()
          );

          ALTER TABLE public.user_daily_roadmap ENABLE ROW LEVEL SECURITY;

          DROP POLICY IF EXISTS "Users manage own roadmap" ON public.user_daily_roadmap;
          CREATE POLICY "Users manage own roadmap"
            ON public.user_daily_roadmap FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);

          CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_date ON public.user_daily_roadmap (user_id, logged_date);
          CREATE INDEX IF NOT EXISTS user_daily_roadmap_user_task ON public.user_daily_roadmap (user_id, task_id);
        `;

        try {
          // Unfortunately, Supabase doesn't support raw SQL execution via the client,
          // so we'll handle missing table gracefully
          console.log('[RoadmapService] Table creation deferred - please run migrations manually');
        } catch (err) {
          console.warn('[RoadmapService] Could not create table:', err);
        }
      }

      this.tableInitialized = true;
    } catch (error) {
      console.warn('[RoadmapService] Error checking table:', error);
    }
  }

  private async ensureActivityPreferenceTableExists(): Promise<void> {
    if (this.activityPreferenceTableInitialized) return;

    try {
      const { error } = await this.supabase.db
        .from('user_activity_preferences')
        .select('id')
        .limit(1);

      if (error?.code === 'PGRST116') {
        console.log('[RoadmapService] Activity preference table missing - please run migration 018');
      }

      this.activityPreferenceTableInitialized = true;
    } catch (error) {
      console.warn('[RoadmapService] Error checking activity preference table:', error);
    }
  }

  async getDailyRoadmap(userId: string, date: string): Promise<DailyRoadmapItem[]> {
    await this.ensureTableExists();

    const { data, error } = await this.supabase.db
      .from('user_daily_roadmap')
      .select('*')
      .eq('user_id', userId)
      .eq('logged_date', date)
      .order('created_at', { ascending: true });

    // Gracefully handle table not existing
    if (error?.code === 'PGRST116') {
      return [];
    }

    if (error) throw error;
    return (data ?? []) as DailyRoadmapItem[];
  }

  async createRoadmapItem(
    userId: string,
    dto: CreateDailyRoadmapItemDto,
  ): Promise<DailyRoadmapItem> {
    await this.ensureTableExists();

    const { data, error } = await this.supabase.db
      .from('user_daily_roadmap')
      .insert({
        user_id: userId,
        ...dto,
      })
      .select()
      .single();

    if (error) throw error;
    return data as DailyRoadmapItem;
  }

  async updateRoadmapItem(
    userId: string,
    itemId: string,
    dto: UpdateDailyRoadmapItemDto,
  ): Promise<DailyRoadmapItem> {
    await this.ensureTableExists();

    const { data, error } = await this.supabase.db
      .from('user_daily_roadmap')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as DailyRoadmapItem;
  }

  async deleteRoadmapItem(userId: string, itemId: string): Promise<void> {
    await this.ensureTableExists();

    const { error } = await this.supabase.db
      .from('user_daily_roadmap')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async syncDailyRoadmap(userId: string, dto: DailyRoadmapSyncDto): Promise<DailyRoadmapItem[]> {
    await this.ensureTableExists();

    // Clear existing roadmap for the date
    await this.supabase.db
      .from('user_daily_roadmap')
      .delete()
      .eq('user_id', userId)
      .eq('logged_date', dto.logged_date);

    // Insert new roadmap items
    if (dto.items.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase.db
      .from('user_daily_roadmap')
      .insert(
        dto.items.map((item) => ({
          user_id: userId,
          ...item,
        })),
      )
      .select();

    if (error) throw error;
    return data as DailyRoadmapItem[];
  }

  async getActivityPreferences(userId: string): Promise<ActivityPreference[]> {
    await this.ensureActivityPreferenceTableExists();

    const { data, error } = await this.supabase.db
      .from('user_activity_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error?.code === 'PGRST116') {
      return [];
    }

    if (error) throw error;
    return (data ?? []) as ActivityPreference[];
  }

  private async assertActivityPreferenceTypeAvailable(
    userId: string,
    activityType: string,
    excludePreferenceId?: string,
  ): Promise<void> {
    let query = this.supabase.db
      .from('user_activity_preferences')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('activity_type', activityType)
      .limit(1);

    if (excludePreferenceId) {
      query = query.neq('id', excludePreferenceId);
    }

    const { data, error } = await query.maybeSingle();

    if (error?.code === 'PGRST116') {
      return;
    }
    if (error) throw error;

    if (data) {
      throw new BadRequestException(
        'Hoạt động này đã có trong lộ trình. Hãy dùng nút Sửa để đổi thời gian.',
      );
    }
  }

  async createActivityPreference(
    userId: string,
    dto: CreateActivityPreferenceDto,
  ): Promise<ActivityPreference> {
    await this.ensureActivityPreferenceTableExists();

    if (dto.is_active ?? true) {
      await this.assertActivityPreferenceTypeAvailable(userId, dto.activity_type);
    }

    const { data, error } = await this.supabase.db
      .from('user_activity_preferences')
      .insert({
        user_id: userId,
        title: dto.title,
        activity_type: dto.activity_type,
        duration_min: dto.duration_min,
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as ActivityPreference;
  }

  async updateActivityPreference(
    userId: string,
    preferenceId: string,
    dto: UpdateActivityPreferenceDto,
  ): Promise<ActivityPreference> {
    await this.ensureActivityPreferenceTableExists();

    if (dto.activity_type !== undefined && dto.is_active !== false) {
      await this.assertActivityPreferenceTypeAvailable(userId, dto.activity_type, preferenceId);
    } else if (dto.is_active === true) {
      const { data: current, error: currentError } = await this.supabase.db
        .from('user_activity_preferences')
        .select('activity_type')
        .eq('id', preferenceId)
        .eq('user_id', userId)
        .single();

      if (currentError) throw currentError;
      if (current?.activity_type) {
        await this.assertActivityPreferenceTypeAvailable(userId, current.activity_type, preferenceId);
      }
    }

    const updatePayload: Record<string, string | number | boolean> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.activity_type !== undefined) updatePayload.activity_type = dto.activity_type;
    if (dto.duration_min !== undefined) updatePayload.duration_min = dto.duration_min;
    if (dto.sort_order !== undefined) updatePayload.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) updatePayload.is_active = dto.is_active;

    const { data, error } = await this.supabase.db
      .from('user_activity_preferences')
      .update(updatePayload)
      .eq('id', preferenceId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as ActivityPreference;
  }

  async deleteActivityPreference(userId: string, preferenceId: string): Promise<void> {
    await this.ensureActivityPreferenceTableExists();

    const { error } = await this.supabase.db
      .from('user_activity_preferences')
      .delete()
      .eq('id', preferenceId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}
