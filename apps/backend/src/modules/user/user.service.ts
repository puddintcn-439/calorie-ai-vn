import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { User } from '@calorie-ai/types';

@Injectable()
export class UserService {
  constructor(private supabase: SupabaseService) {}

  async getProfile(userId: string, email?: string): Promise<User> {
    const { data, error } = await this.supabase.db
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data && email) {
      const { data: inserted, error: insertError } = await this.supabase.db
        .from('users')
        .insert({
          id: userId,
          email,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return inserted as User;
    }

    if (!data) throw new NotFoundException('User not found');
    return data as User;
  }

  async updateProfile(userId: string, updates: Partial<User>, email?: string): Promise<User> {
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.db
      .from('users')
      .update({ ...updates, updated_at: now })
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (data) return data as User;

    if (!email) throw new NotFoundException('User email not found');

    const { data: inserted, error: insertError } = await this.supabase.db
      .from('users')
      .insert({
        id: userId,
        email,
        full_name: updates.full_name ?? null,
        ...updates,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted as User;
  }
}
