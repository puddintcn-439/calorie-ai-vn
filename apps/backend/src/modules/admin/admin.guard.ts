import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../common/supabase/supabase.service';

export type AdminRole = 'owner' | 'admin' | 'support' | 'viewer';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const email = String(request?.user?.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new ForbiddenException('Admin access is restricted');
    }

    const dbRole = await this.findActiveRole(email);
    if (dbRole) {
      request.admin = {
        role: dbRole,
        email,
        source: 'database',
      };
      return true;
    }

    const envRole = this.findEnvFallbackRole(email);
    if (envRole) {
      request.admin = {
        role: envRole,
        email,
        source: 'env',
      };
      return true;
    }

    throw new ForbiddenException('Admin access is restricted');
  }

  private async findActiveRole(email: string): Promise<AdminRole | null> {
    const { data, error } = await this.supabase.db
      .from('admin_roles')
      .select('role, status')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const role = String(data.role ?? '') as AdminRole;
    return ['owner', 'admin', 'support', 'viewer'].includes(role) ? role : null;
  }

  private findEnvFallbackRole(email: string): AdminRole | null {
    const admins = this.getAdminEmails();
    if (admins.includes('*') || admins.includes(email)) {
      return 'owner';
    }
    return null;
  }

  private getAdminEmails(): string[] {
    const raw = [
      this.config.get<string>('BETA_ANALYTICS_ADMIN_EMAILS'),
      this.config.get<string>('ADMIN_EMAILS'),
    ]
      .filter(Boolean)
      .join(',');

    return raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }
}
