import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SendMessageInput } from '@waka/contracts';
import { UserGuard } from '../auth/guards.js';
import { type AuthUser, CurrentUser, parse } from '../common/http.js';
import { MessagingService } from '../messaging/messaging.service.js';

@ApiTags('messagerie')
@Controller('v1')
@UseGuards(UserGuard)
export class MessagingController {
  constructor(@Inject(MessagingService) private readonly messaging: MessagingService) {}

  @Get('bookings/:id/messages')
  @ApiOperation({ summary: 'Fil de discussion, réservé au passager et au conducteur de la réservation' })
  thread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messaging.thread(id, user);
  }

  @Post('bookings/:id/messages')
  @ApiOperation({ summary: 'Envoie un message (liens, numéros et paiements hors plateforme refusés)' })
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.messaging.send(id, user, parse(SendMessageInput, body).text);
  }

  @Get('me/notifications')
  notifications(@CurrentUser() user: AuthUser) {
    return this.messaging.notificationsFor(user);
  }

  @Post('me/notifications/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser) {
    return this.messaging.markNotificationsRead(user);
  }
}
