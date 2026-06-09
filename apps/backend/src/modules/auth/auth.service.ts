import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class AuthService {
  constructor(
    private supabase: SupabaseService,
    private jwt: JwtService,
    private metrics: MetricsService,
  ) {}

  async register(dto: RegisterDto) {
    const authClient = this.supabase.createAuthClient();

    // Use admin API to create user without email confirmation
    const { data, error } = await authClient.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });

    if (error) {
      this.metrics.recordAuthFailure('register');
      throw new ConflictException(error.message);
    }

    // Create user profile
    await this.supabase.db.from('users').insert({
      id: data.user!.id,
      email: dto.email,
      full_name: dto.full_name,
    });

    this.metrics.recordAuthSuccess('register');
    return this.issueTokens(data.user!.id, dto.email);
  }

  async login(dto: LoginDto) {
    const authClient = this.supabase.createAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      this.metrics.recordAuthFailure('login');
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    this.metrics.recordAuthSuccess('login');
    return this.issueTokens(data.user.id, data.user.email!);
  }

  public issueAccessToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    // Shorter lived access token (override module default)
    return this.jwt.sign(payload, { expiresIn: '1h' });
  }

  private issueRefreshToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    // Long-lived refresh token (kept in HttpOnly cookie)
    return this.jwt.sign(payload, { expiresIn: '30d' });
  }

  private issueTokens(userId: string, email: string) {
    return {
      access_token: this.issueAccessToken(userId, email),
      refresh_token: this.issueRefreshToken(userId, email),
      user_id: userId,
      email,
    };
  }

  verifyRefreshToken(token: string) {
    try {
      // JwtService.verify will throw on invalid/expired token
      return this.jwt.verify(token) as { sub: string; email?: string };
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
