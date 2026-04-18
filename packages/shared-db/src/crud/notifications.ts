/**
 * notifications CRUD
 */

import { ObjectId } from "mongodb";

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
