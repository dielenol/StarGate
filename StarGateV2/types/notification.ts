/**
 * @deprecated shared-db에서 직접 import하세요.
 */

import type { Notification } from "@stargate/shared-db/types";

/** Client Component/API 경계에서 사용하는 직렬화된 알림. */
export type ClientNotification = Omit<Notification, "_id" | "createdAt"> & {
  _id: string;
  createdAt: string;
};

export type {
  Notification,
  NotificationType,
  CreateNotificationInput,
} from "@stargate/shared-db/types";
