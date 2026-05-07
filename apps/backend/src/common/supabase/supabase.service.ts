import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient;
  private url: string;
  private serviceKey: string;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.url = this.config.getOrThrow('SUPABASE_URL');
    this.serviceKey = this.config.getOrThrow('SUPABASE_SERVICE_KEY');

    this.client = createClient(this.url, this.serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  get db(): SupabaseClient {
    return this.client;
  }

  createAuthClient(): SupabaseClient {
    return createClient(this.url, this.serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
}
