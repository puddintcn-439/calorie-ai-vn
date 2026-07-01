import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient | any;
  private url: string | undefined;
  private serviceKey: string | undefined;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private config: ConfigService) {}

  private buildClientOptions(): any {
    const opts: any = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    };

    let transport: any = undefined;
    try {
      // for Node.js < 22, provide ws as the transport for realtime
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      transport = require('ws');
    } catch (e) {
      transport = undefined;
    }

    if (transport) {
      opts.realtime = { transport };
    }

    return opts;
  }

  onModuleInit() {
    // Use non-throwing getters here so the app can still start in development
    // when Supabase is intentionally not configured. We will provide a
    // lightweight stub client in that case to avoid unhandled promise
    // rejections originating from background network activity.
    this.url = this.config.get('SUPABASE_URL');
    this.serviceKey = this.config.get('SUPABASE_SERVICE_KEY');

    // Basic validation: ensure we have a URL and it looks like an HTTP(S)
    // endpoint. Many local dev setups mistakenly set SUPABASE_URL to
    // "http://localhost:5432" (Postgres port) which will cause
    // immediate connection failures from the Supabase client. In that case
    // avoid creating the real client and use a safe stub instead in non-prod.
    const isProd = process.env.NODE_ENV === 'production' || String(this.config.get('NODE_ENV') ?? '').toLowerCase() === 'production';

    if (!this.url || !this.serviceKey) {
      if (isProd) {
        this.logger.error('[SupabaseService] SUPABASE_URL or SUPABASE_SERVICE_KEY not set in production — aborting startup');
        throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set in production');
      }
      this.logger.warn('[SupabaseService] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — using stub client');
      this.client = this.buildUnavailableClient();
      return;
    }

    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(this.url);
    } catch (e) {
      if (isProd) {
        this.logger.error(`[SupabaseService] SUPABASE_URL (${this.url}) is not a valid URL in production`);
        throw new Error('Invalid SUPABASE_URL in production');
      }
      this.logger.warn(`[SupabaseService] SUPABASE_URL (${this.url}) is not a valid URL — using stub client`);
      this.client = this.buildUnavailableClient();
      return;
    }

    if (parsedUrl.port === '5432' || this.url.includes(':5432')) {
      if (isProd) {
        this.logger.error(`[SupabaseService] SUPABASE_URL appears to point to a Postgres port (${this.url}) — invalid in production`);
        throw new Error('SUPABASE_URL points to Postgres port in production');
      }
      this.logger.warn(`[SupabaseService] SUPABASE_URL appears to point to a Postgres port (${this.url}) — skipping Supabase client creation and using stub for development`);
      this.client = this.buildUnavailableClient();
      return;
    }

    try {
      this.client = createClient(this.url, this.serviceKey, this.buildClientOptions());
    } catch (err) {
      this.logger.warn('[SupabaseService] Failed to create Supabase client, falling back to stub', err as Error);
      this.client = this.buildUnavailableClient();
    }
  }

  get db(): SupabaseClient {
    return this.client;
  }

  createAuthClient(): SupabaseClient {
    // If the real client wasn't created, return a lightweight stub that
    // provides the minimal DB interface expected by callers. This avoids
    // throwing during runtime when Supabase isn't configured for local dev.
    const isProd = process.env.NODE_ENV === 'production' || String(this.config.get('NODE_ENV') ?? '').toLowerCase() === 'production';
    if (!this.url || !this.serviceKey) {
      if (isProd) {
        this.logger.error('[SupabaseService] createAuthClient missing SUPABASE config in production');
        throw new Error('Supabase not configured in production');
      }
      return this.buildUnavailableClient();
    }

    try {
      return createClient(this.url, this.serviceKey, this.buildClientOptions());
    } catch (err) {
      this.logger.warn('[SupabaseService] createAuthClient failed, returning stub client', err as Error);
      return this.buildUnavailableClient();
    }
  }

  private buildUnavailableClient(): any {
    // Return a resolved result with no error by default so callers that
    // `throw error` don't cause unhandled rejections during local dev when
    // Supabase isn't configured. This keeps the app running and lets higher
    // level guards decide how to proceed.
    const terminal = async () => ({ data: null, error: null });
    const authTerminal = async () => ({ data: null, error: { message: 'Supabase not configured' } });

    // A lightweight thenable/chainable query builder that mimics the
    // Supabase client's fluent API. Methods return the builder itself so
    // callers can chain calls like `.from(...).select(...).limit(1)` and
    // awaiting the final chain resolves to the terminal result.
    const chainable: any = {};

    const chainMethods = [
      'from',
      'select',
      'maybeSingle',
      'maybe_single',
      'limit',
      'eq',
      'in',
      'gte',
      'range',
      'ilike',
      'gt',
      'lt',
      'is',
      'order',
    ];

    for (const m of chainMethods) {
      // Each method records the last call (if needed) and returns the
      // same chainable object to allow fluent chaining.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chainable as any)[m] = (..._args: any[]) => chainable;
    }

    // Mutating operations also return the chainable so they can be awaited.
    const terminalMethods = ['delete', 'insert', 'upsert', 'update'];
    for (const m of terminalMethods) {
      (chainable as any)[m] = (..._args: any[]) => chainable;
    }

    // Provide auth helpers to mimic `supabase.auth` shape.
    chainable.auth = {
      signIn: authTerminal,
      signOut: authTerminal,
      signInWithPassword: authTerminal,
      signUp: authTerminal,
      admin: {
        createUser: authTerminal,
        deleteUser: authTerminal,
        getUserById: authTerminal,
      },
    };

    // Make the chainable thenable so `await chainable` resolves to terminal().
    (chainable as any).then = (resolve: any, reject: any) => {
      return terminal().then(resolve, reject);
    };
    (chainable as any).catch = (cb: any) => terminal().catch(cb);

    return chainable;
  }
}
