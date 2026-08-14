import type { ObjectId } from "mongodb";

export type NotificationType =
  | "SESSION_REMIND"
  | "ROLE_CHANGE"
  | "CREDIT_RECEIVED"
  | "CONSUMABLE_USED"
  | "REPORT_PUBLISHED"
  | "STOCK"
  | "SYSTEM";

export interface Notification {
  _id?: ObjectId;
  userId: string;
  /**
   * 외부 스케줄러/worker가 같은 알림을 재시도할 때 사용하는 멱등 키.
   * 일반 사용자 알림은 필드가 없으며, 문자열인 문서에만 partial unique가 적용된다.
   */
  dedupeKey?: string;
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
