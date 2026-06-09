import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorageService.name);

  // Accept any Redis-like client (ioredis recommended)
  constructor(private readonly redis: any) {}

  /**
   * Increment the hit counter for the given key using a Redis sorted set.
   * Returns a simple record consumed by the throttler at runtime.
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<any> {
    try {
      const zkey = `throttle:${throttlerName}:${key}`;
      const now = Date.now();
      const windowStart = now - ttl;

      // Remove old entries
      if (typeof this.redis.zremrangebyscore === 'function') {
        await this.redis.zremrangebyscore(zkey, 0, windowStart);
        // Add current timestamp as both score and member
        await this.redis.zadd(zkey, now, `${now}`);
        // Ensure key expires after TTL
        if (typeof this.redis.pexpire === 'function') {
          await this.redis.pexpire(zkey, ttl);
        }
        const totalHits = Number(await this.redis.zcard(zkey));
        const blocked = totalHits > limit;
        const blockedUntil = blocked ? now + blockDuration : 0;
        return { totalHits, blockedUntil };
      }

      // Fallback: use simple INCR with expiry
      const existing = await this.redis.get(key);
      let count = existing ? Number(existing) : 0;
      count += 1;
      if (typeof this.redis.set === 'function') {
        await this.redis.set(key, String(count), 'PX', ttl);
      } else {
        await this.redis.set(key, String(count));
      }
      const blockedFallback = count > limit;
      return { totalHits: count, blockedUntil: blockedFallback ? Date.now() + blockDuration : 0 };
    } catch (err) {
      this.logger.warn('Redis throttle increment failed, falling back to in-memory behavior', (err as Error).message);
      // On error, return a neutral record so throttling doesn't block traffic unexpectedly
      return { totalHits: 0, blockedUntil: 0 };
    }
  }
}

