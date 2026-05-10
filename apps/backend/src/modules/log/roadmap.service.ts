import { Injectable, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  DailyRoadmapItem,
  CreateDailyRoadmapItemDto,
  UpdateDailyRoadmapItemDto,
  DailyRoadmapSyncDto,
} from '@calorie-ai/types';

@Injectable()
export class RoadmapService implements OnModuleInit {
  private tableInitialized = false;

  constructor(private supabase: SupabaseService) {}

  async onModuleInit() {
    await this.ensureTableExists();
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
}
