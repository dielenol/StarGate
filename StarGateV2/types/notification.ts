import type { ObjectId } from "mongodb";

export type NotificationType =
  | "SESSION_REMIND"
  | "ROLE_CHANGE"
  | "CREDIT_RECEIVED"
  | "REPORT_PUBLISHED"
  | "SYSTEM";

export interface Notification {
  _id?: ObjectId;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: Date;
}

export type CreateNotificationInput = Omit<
  Notification,
  "_id" | "isRead" | "createdAt"
>;
