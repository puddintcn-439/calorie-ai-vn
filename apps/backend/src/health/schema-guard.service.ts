import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

const REQUIRED_TABLES = [
  'users',
  'foods',
  'food_logs',
  'correction_events',
  'user_subscriptions',
  'reminder_preferences',
  'logging_events',
] as const;

@Injectable()
export class SchemaGuardService implements OnModuleInit {
  private readonly logger = new Logger(SchemaGuardService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async onModuleInit(): Promise<void> {
    const missingTables: string[] = [];

    for (const table of REQUIRED_TABLES) {
      const exists = await this.checkTableExists(table);
      if (!exists) {
        missingTables.push(table);
      }
    }

    if (missingTables.length === 0) {
      this.logger.log('Schema guard passed: all required tables are available');
      return;
    }

    const env = process.env.NODE_ENV ?? 'development';
    const message = `Missing required tables: ${missingTables.join(', ')}`;

    this.logger.warn(`[schema-guard] ${message}`);

    if (env !== 'development') {
      throw new Error(`[schema-guard] ${message}. Refusing to start in ${env}.`);
    }
  }

  private async checkTableExists(tableName: string): Promise<boolean> {
    const { error } = await this.supabase.db
      .from(tableName)
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    if (!error) return true;

    const errorText = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
    if (errorText.includes('schema cache') || errorText.includes(`public.${tableName}`)) {
      return false;
    }

    // Any non-schema error (network, auth, etc.) should surface as startup failure.
    throw error;
  }
}
