import { NotificationPriority, NotificationType, PrismaClient, Subscription } from '@prisma/client';
import { addMinutes } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';
import { recordAuditLog } from '../utils/audit';

type PreferenceLike = {
  userId: string;
  timezone: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

type NotificationCandidate = {
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  subscription: Subscription;
};

const QUIET_MINUTES_IN_DAY = 24 * 60;

function parseTimeString(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(':').map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function isWithinQuietHours(target: Date, preference: PreferenceLike): boolean {
  if (!preference.quietHoursEnabled) {
    return false;
  }

  const timeZone = preference.timezone || 'UTC';
  const zoned = utcToZonedTime(target, timeZone);
  const currentMinutes = zoned.getHours() * 60 + zoned.getMinutes();
  const start = parseTimeString(preference.quietHoursStart);
  const end = parseTimeString(preference.quietHoursEnd);
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  const spansMidnight = startMinutes > endMinutes;

  if (spansMidnight) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function deferToQuietHoursEnd(target: Date, preference: PreferenceLike): Date {
  if (!isWithinQuietHours(target, preference)) {
    return target;
  }

  const timeZone = preference.timezone || 'UTC';
  const zoned = utcToZonedTime(target, timeZone);
  const currentMinutes = zoned.getHours() * 60 + zoned.getMinutes();
  const { hour: startHour, minute: startMinute } = parseTimeString(preference.quietHoursStart);
  const { hour: endHour, minute: endMinute } = parseTimeString(preference.quietHoursEnd);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  const spansMidnight = startMinutes > endMinutes;

  let minutesUntilEnd = endMinutes - currentMinutes;
  if (spansMidnight && currentMinutes >= startMinutes) {
    minutesUntilEnd = QUIET_MINUTES_IN_DAY - currentMinutes + endMinutes;
  } else if (spansMidnight && currentMinutes < endMinutes) {
    minutesUntilEnd = endMinutes - currentMinutes;
  }

  if (minutesUntilEnd < 0) {
    minutesUntilEnd += QUIET_MINUTES_IN_DAY;
  }

  return addMinutes(target, minutesUntilEnd);
}

export async function ensureNotificationPreference(
  prisma: PrismaClient,
  userId: string,
): Promise<PreferenceLike> {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  return prisma.notificationPreference.create({
    data: {
      userId,
    },
  });
}

function getNotificationCandidate(subscription: Subscription, now: Date): NotificationCandidate | null {
  const windowMs = subscription.nextBillingDate.getTime() - now.getTime();
  if (windowMs <= 0) {
    return null;
  }

  const hoursUntilBilling = windowMs / (1000 * 60 * 60);

  if (subscription.isTrial && hoursUntilBilling <= 48) {
    return {
      type: NotificationType.TRIAL_ENDING,
      title: 'Trial ending soon',
      body: `Your trial for ${subscription.name} ends on ${subscription.nextBillingDate.toISOString()}.`,
      priority: NotificationPriority.IMPORTANT,
      subscription,
    };
  }

  if (subscription.billingInterval === 'YEARLY' && hoursUntilBilling <= 24 * 14) {
    return {
      type: NotificationType.ANNUAL_WARNING,
      title: 'Annual renewal coming up',
      body: `${subscription.name} renews on ${subscription.nextBillingDate.toISOString()}.`,
      priority: NotificationPriority.IMPORTANT,
      subscription,
    };
  }

  if (hoursUntilBilling <= 72) {
    return {
      type: NotificationType.RENEWAL_UPCOMING,
      title: 'Renewal coming up',
      body: `${subscription.name} renews on ${subscription.nextBillingDate.toISOString()}.`,
      priority: NotificationPriority.INFO,
      subscription,
    };
  }

  return null;
}

async function createNotificationIfNeeded(
  prisma: PrismaClient,
  preference: PreferenceLike,
  candidate: NotificationCandidate,
  now: Date,
): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: preference.userId,
      type: candidate.type,
      AND: [
        {
          metadata: {
            path: ['subscriptionId'],
            equals: candidate.subscription.id,
          },
        },
        {
          metadata: {
            path: ['nextBillingDate'],
            equals: candidate.subscription.nextBillingDate.toISOString(),
          },
        },
      ],
    },
  });

  if (existing) {
    return false;
  }

  const scheduledFor = deferToQuietHoursEnd(now, preference);
  const notification = await prisma.notification.create({
    data: {
      userId: preference.userId,
      type: candidate.type,
      title: candidate.title,
      body: candidate.body,
      priority: candidate.priority,
      metadata: {
        subscriptionId: candidate.subscription.id,
        nextBillingDate: candidate.subscription.nextBillingDate.toISOString(),
      },
      scheduledFor,
    },
  });

  await recordAuditLog({
    userId: preference.userId,
    action: 'notifications.generated',
    metadata: { notificationId: notification.id, type: candidate.type },
  });

  return true;
}

export async function generateUpcomingNotifications(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const subscriptions = await prisma.subscription.findMany({
    where: { active: true },
    include: { user: { include: { notificationPreference: true } } },
  });

  let created = 0;

  for (const subscription of subscriptions) {
    const candidate = getNotificationCandidate(subscription, now);
    if (!candidate) {
      continue;
    }

    const preference =
      subscription.user.notificationPreference ??
      (await ensureNotificationPreference(prisma, subscription.userId));

    const createdNotification = await createNotificationIfNeeded(prisma, preference, candidate, now);
    if (createdNotification) {
      created += 1;
    }
  }

  return created;
}

export async function sendDueNotifications(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { sentAt: null, scheduledFor: { lte: now } },
  });

  let sentCount = 0;
  for (const notification of due) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { sentAt: now },
    });

    await recordAuditLog({
      userId: notification.userId,
      action: 'notifications.sent',
      metadata: { notificationId: notification.id, type: notification.type },
    });

    sentCount += 1;
  }

  return sentCount;
}

export async function runNotificationSweep(prisma: PrismaClient): Promise<{
  generated: number;
  sent: number;
}> {
  const generated = await generateUpcomingNotifications(prisma);
  const sent = await sendDueNotifications(prisma);
  return { generated, sent };
}

export { deferToQuietHoursEnd };
