import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseService } from '../../../common/supabase/supabase.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private supabase: SupabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const { data: user } = await this.supabase.db
      .from('users')
      .select('id, email, full_name')
      .eq('id', payload.sub)
      .maybeSingle();

    if (user) return user;

    // Allow authenticated users that exist in Supabase Auth but do not yet have
    // a profile row in public.users. The profile row will be created on save.
    if (!payload?.sub || !payload?.email) throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email, full_name: null };
  }
}
