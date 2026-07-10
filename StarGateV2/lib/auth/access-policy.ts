import type { UserRole, UserStatus } from "@/types/user";

type CharacterAccessSubject = {
  isPublic?: boolean;
  ownerId?: unknown;
};

function normalizeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) {
    const normalized = value.toString();
    return normalized && normalized !== "[object Object]" ? normalized : null;
  }
  return null;
}

export function isActiveUserStatus(status: UserStatus): boolean {
  return status === "ACTIVE";
}

export function canViewCharacter(
  viewerRole: UserRole,
  character: Pick<CharacterAccessSubject, "isPublic">,
): boolean {
  return character.isPublic !== false || viewerRole === "GM";
}

export function canViewPersonalInventory(
  viewerId: string,
  viewerRole: UserRole,
  character: CharacterAccessSubject,
): boolean {
  if (!canViewCharacter(viewerRole, character)) return false;
  if (viewerRole === "GM" || viewerRole === "V") return true;
  return normalizeId(character.ownerId) === viewerId;
}
