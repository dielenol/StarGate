import { findUserById } from "@/lib/db/users";
import type { CurrentAccountResponse } from "@/types/erp-realtime";

function serializeNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export async function getCurrentAccountResponse(
  userId: string,
): Promise<CurrentAccountResponse | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  return {
    id: user._id?.toString() ?? userId,
    username: user.username,
    displayName: user.displayName,
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    discordGlobalName: user.discordGlobalName,
    discordAvatar: user.discordAvatar,
    role: user.role,
    status: user.status,
    lastLoginAt: serializeNullableDate(user.lastLoginAt),
    passwordChangedAt: serializeNullableDate(user.passwordChangedAt),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
