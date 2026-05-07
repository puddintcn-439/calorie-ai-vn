import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { User } from '@calorie-ai/types';

@Injectable()
export class UserService {
  constructor(private supabase: SupabaseService) {}

  async getProfile(userId: string): Promise<User> {
    const { data, error } = await this.supabase.db
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) throw new NotFoundException('User not found');
    return data as User;
  }

  async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await this.supabase.db
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as User;
  }
}
