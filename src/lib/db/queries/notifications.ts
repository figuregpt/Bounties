/**
 * Notification queries — feed, read state, and emission.
 */
import type {
  Notification,
  NewNotification,
  NotificationType,
} from "@/types/database";

export async function getUserNotifications(
  _userId: string,
  _opts?: { onlyUnread?: boolean; limit?: number; cursor?: string },
): Promise<{ items: Notification[]; nextCursor: string | null }> {
  // TODO(phase-4): keyset pagination by createdAt desc.
  throw new Error("Not implemented");
}

export async function markAsRead(
  _userId: string,
  _notificationId: string,
): Promise<void> {
  // TODO(phase-4): set read=true, readAt=now where id=? AND userId=?
  throw new Error("Not implemented");
}

export async function markAllAsRead(_userId: string): Promise<void> {
  // TODO(phase-4): bulk update; consider returning new unread count.
  throw new Error("Not implemented");
}

export async function createNotification(
  _input: NewNotification & { type: NotificationType },
): Promise<Notification> {
  // TODO(phase-4): insert + fan-out to push/email channels per preferences.
  throw new Error("Not implemented");
}
