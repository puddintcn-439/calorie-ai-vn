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
    return this.issueToken(data.user!.id, dto.email);
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
    return this.issueToken(data.user.id, data.user.email!);
  }

  private issueToken(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      access_token: this.jwt.sign(payload),
      user_id: userId,
      email,
    };
  }
}
