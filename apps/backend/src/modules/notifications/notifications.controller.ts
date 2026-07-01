import { Controller, Get, NotFoundException, Param, Patch, Request, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user in-app notifications' })
  list(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    return this.notificationsService.listUserNotifications(userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  markAllRead(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    return this.notificationsService.markAllUserNotificationsRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one current user notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  async markRead(@Request() req: any, @Param('id') notificationId: string) {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) throw new UnauthorizedException('Authenticated user id is required.');
    const notification = await this.notificationsService.markUserNotificationRead(userId, notificationId);
    if (!notification) throw new NotFoundException('Notification not found');
    return notification;
  }
}
