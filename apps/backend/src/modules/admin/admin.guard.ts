import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = String(request?.user?.email ?? '').trim().toLowerCase();
    const admins = this.getAdminEmails();

    if (!email || admins.length === 0 || (!admins.includes('*') && !admins.includes(email))) {
      throw new ForbiddenException('Admin access is restricted');
    }

    return true;
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
