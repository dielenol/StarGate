import type { CreateNotificationInput } from "@/types/notification";
import type { UserPublic } from "@/types/user";

import { createNotification } from "@/lib/db/notifications";
import { listUsers } from "@/lib/db/users";

type NotificationPayload = Omit<CreateNotificationInput, "userId">;

interface BroadcastOptions {
  excludeUserIds?: readonly string[];
}

function getNotificationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isActiveRecipient(user: UserPublic): boolean {
  return user.status === "ACTIVE";
}

export function formatSignedAmount(amount: number, unit: string): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount.toLocaleString()} ${unit}`;
}

export async function notifyUser(
  input: CreateNotificationInput,
): Promise<void> {
  try {
    await createNotification(input);
  } catch (error) {
    console.warn("[notifications] create failed", {
      userId: input.userId,
      type: input.type,
      error: getNotificationErrorMessage(error),
    });
  }
}

export async function notifyUsers(
  inputs: readonly CreateNotificationInput[],
): Promise<void> {
  for (const input of inputs) {
    await notifyUser(input);
  }
}

export async function notifyActiveUsers(
  payload: NotificationPayload,
  options: BroadcastOptions = {},
): Promise<void> {
  try {
    const excludeUserIds = new Set(options.excludeUserIds ?? []);
    const users = await listUsers();
    await notifyUsers(
      users
        .filter((user) => isActiveRecipient(user))
        .filter((user) => !excludeUserIds.has(user._id))
        .map((user) => ({
          ...payload,
          userId: user._id,
        })),
    );
  } catch (error) {
    console.warn("[notifications] broadcast failed", {
      type: payload.type,
      error: getNotificationErrorMessage(error),
    });
  }
}
