/**
 * notifications CRUD
 */

import { MongoServerError, ObjectId } from "mongodb";

import type {
  CreateNotificationInput,
  Notification,
} from "../types/index.js";

import { notificationsCol } from "../collections.js";

export async function listUserNotifications(
  userId: string,
  limit = 50
): Promise<Notification[]> {
  const col = await notificationsCol();
  return col
    .find({ userId })
    .project<Notification>({ dedupeKey: 0 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function countUnread(userId: string): Promise<number> {
  const col = await notificationsCol();
  return col.countDocuments({ userId, isRead: false });
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification> {
  const col = await notificationsCol();
  const doc: Notification = {
    ...input,
    isRead: false,
    createdAt: new Date(),
  };
  const result = await col.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export interface CreateNotificationOnceResult {
  notification: Notification;
  created: boolean;
}

/**
 * dedupeKey가 있는 시스템 알림을 DB unique 제약으로 exactly-once 생성한다.
 *
 * 같은 키의 경쟁 insert에서 패배한 호출은 이미 저장된 알림을 반환한다. 다른 unique
 * 제약 위반이나 조회로 확인되지 않는 E11000은 숨기지 않고 호출자에게 전달한다.
 */
export async function createNotificationOnce(
  input: CreateNotificationInput & { dedupeKey: string },
): Promise<CreateNotificationOnceResult> {
  try {
    return {
      notification: await createNotification(input),
      created: true,
    };
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11_000) {
      throw error;
    }

    const col = await notificationsCol();
    const existing = await col.findOne({ dedupeKey: input.dedupeKey });
    if (!existing) throw error;
    return { notification: existing, created: false };
  }
}

export async function markAsRead(
  id: string,
  userId: string
): Promise<boolean> {
  const col = await notificationsCol();
  const result = await col.updateOne(
    { _id: new ObjectId(id), userId },
    { $set: { isRead: true } }
  );
  return result.modifiedCount > 0;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const col = await notificationsCol();
  const result = await col.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true } }
  );
  return result.modifiedCount;
}

export async function deleteNotification(id: string): Promise<boolean> {
  const col = await notificationsCol();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
