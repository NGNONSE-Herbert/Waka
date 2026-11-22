import { Inject, Injectable } from '@nestjs/common';
import type { MessageOutput, MessageThreadOutput, NotificationsOutput } from '@waka/contracts';
import { DomainError, moderateMessage } from '@waka/domain';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { BookingsService } from '../bookings/bookings.service.js';
import { AuditService } from '../common/audit.service.js';
import { type AuthUser, RateLimiter } from '../common/http.js';
import { DATABASE } from '../common/tokens.js';
import type { Database } from '../db/client.js';
import { bookingMessages, notifications, trips, users } from '../db/schema.js';
import { NotificationsService } from '../outbox/notifications.service.js';

/** États où l'échange reste utile ; après la fin du trajet, le fil devient consultable seulement. */
const OPEN_STATES = new Set(['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'ARRIVAL_REPORTED', 'DISPUTED']);
const MAX_MESSAGES_PER_MINUTE = 30;
const NOTIFY_WINDOW_MS = 5 * 60_000;

const BLOCK_MESSAGE = {
  LINK: 'Les liens ne sont pas autorisés dans la messagerie.',
  PHONE: 'Les numéros de téléphone ne sont pas autorisés dans la messagerie.',
  OFF_PLATFORM_PAYMENT: 'Les paiements hors de l’application ne sont pas autorisés.',
} as const;

@Injectable()
export class MessagingService {
  private readonly limiter = new RateLimiter();

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.database.db;
  }

  private view(m: typeof bookingMessages.$inferSelect, userId: string): MessageOutput {
    return { id: m.id, text: m.body, mine: m.senderId === userId, createdAt: m.createdAt.toISOString() };
  }

  async thread(bookingId: string, user: AuthUser): Promise<MessageThreadOutput> {
    const { booking, driverId } = await this.bookings.loadForParticipant(bookingId, user.id);
    const otherId = booking.passengerId === user.id ? driverId : booking.passengerId;
    const [other] = await this.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, otherId));
    const list = await this.db.select().from(bookingMessages).where(eq(bookingMessages.bookingId, booking.id)).orderBy(desc(bookingMessages.createdAt)).limit(200);
    return {
      items: list.reverse().map((m) => this.view(m, user.id)),
      canSend: OPEN_STATES.has(booking.state),
      otherParty: { displayName: other?.displayName ?? '—' },
    };
  }

  async send(bookingId: string, user: AuthUser, text: string): Promise<MessageOutput> {
    const { booking, driverId } = await this.bookings.loadForParticipant(bookingId, user.id);
    if (!OPEN_STATES.has(booking.state)) throw new DomainError('INVALID_TRANSITION', 'La messagerie est fermée pour cette réservation.');
    this.limiter.hit(`msg:${user.id}`, MAX_MESSAGES_PER_MINUTE, 60_000);

    const verdict = moderateMessage(text);
    if (!verdict.ok) {
      // Seul le motif est tracé : le contenu refusé n'est jamais conservé.
      await this.audit.append({ actorType: 'USER', actorId: user.id, action: 'message.blocked', entityType: 'booking', entityId: booking.id, after: { reason: verdict.reason } });
      throw new DomainError('MESSAGE_BLOCKED', BLOCK_MESSAGE[verdict.reason], { reason: verdict.reason });
    }

    const otherId = booking.passengerId === user.id ? driverId : booking.passengerId;
    const row = await this.db.transaction(async (tx) => {
      const [m] = await tx.insert(bookingMessages).values({ bookingId: booking.id, senderId: user.id, body: text }).returning();
      const [t] = await tx.select({ o: trips.originCity, d: trips.destinationCity }).from(trips).where(eq(trips.id, booking.tripId));
      const bucket = Math.floor(Date.now() / NOTIFY_WINDOW_MS);
      await this.notifications.notify(
        tx,
        otherId,
        'message.new',
        { from: user.displayName, route: t ? `${t.o} → ${t.d}` : '', bookingId: booking.id },
        `message:${booking.id}:${otherId}:${bucket}`,
      );
      return m!;
    });
    return this.view(row, user.id);
  }

  async notificationsFor(user: AuthUser): Promise<NotificationsOutput> {
    const list = await this.db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(50);
    const [unread] = await this.db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return {
      unread: Number(unread?.n ?? 0),
      items: list.map((n) => {
        const p = n.payload;
        const amount = Number(p.amount);
        return {
          id: n.id,
          template: n.template,
          text: typeof p.text === 'string' ? p.text : n.template,
          route: typeof p.route === 'string' && p.route ? p.route : null,
          amount: Number.isFinite(amount) && p.amount !== undefined ? amount : null,
          bookingId: typeof p.bookingId === 'string' ? p.bookingId : null,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        };
      }),
    };
  }

  async markNotificationsRead(user: AuthUser): Promise<{ ok: true }> {
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { ok: true };
  }
}
