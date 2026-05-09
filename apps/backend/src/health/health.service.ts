import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class HealthService {
  constructor(private supabase: SupabaseService) {}

  async getStatus() {
    const startTime = Date.now();

    try {
      // Check database connectivity
      const { data, error } = await this.supabase.db
        .from('users')
        .select('count', { count: 'exact', head: true });

      if (error) {
        throw error;
      }

      const dbLatency = Date.now() - startTime;

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        database: {
          status: 'connected',
          latency_ms: dbLatency,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        database: {
          status: 'disconnected',
        },
      };
    }
  }

  async checkReadiness() {
    try {
      // Check database connectivity
      const { error } = await this.supabase.db
        .from('users')
        .select('id', { count: 'exact', head: true });

      if (error) {
        throw error;
      }

      return {
        ready: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ready: false,
        error: error instanceof Error ? error.message : 'Database check failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async checkLiveness() {
    // Simple liveness check - just respond if service is running
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
