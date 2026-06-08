import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Per-user throttler guard.
 *
 * By default NestJS ThrottlerGuard tracks request rate by IP address.
 * That means all users behind the same NAT/proxy share a single quota
 * bucket, allowing one user to exhaust the limit for everyone.
 *
 * This guard overrides the tracking key to use the authenticated user's
 * ID extracted from the JWT (set by JwtAuthGuard on `req.user`).
 * If for any reason the user ID is absent it falls back to the remote IP
 * so unauthenticated requests still get throttled correctly.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: string | undefined = req?.user?.id ?? req?.user?.sub;
    if (userId) {
      return `user:${userId}`;
    }
    // Fallback: use forwarded IP or socket remote address
    const forwarded = req?.headers?.['x-forwarded-for'];
    const ip: string =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ??
      req?.ip ??
      req?.socket?.remoteAddress ??
      'unknown';
    return `ip:${ip}`;
  }
}
