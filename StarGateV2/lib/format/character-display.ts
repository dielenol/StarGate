import type { Character } from "@/types/character";

import { getDepartmentLabel } from "@/lib/org-structure";

export const CLASSIFIED_VALUE = "[CLASSIFIED]";

interface CharacterDisplaySource {
  codename: string;
  role?: string | null;
  department?: Character["department"] | string | null;
  lore: {
    name?: string | null;
    nickname?: string | null;
    nameEn?: string | null;
  };
}

export function isDisplayableCharacterText(
  value: string | undefined | null,
): value is string {
  return Boolean(value && value.trim() && value.trim() !== CLASSIFIED_VALUE);
}

export function getCharacterDisplayName(
  character: CharacterDisplaySource,
): string {
  const displayName = getDisplayNameParts(character);
  if (displayName) return displayName;

  return character.codename;
}

export function getCharacterDisplayNameOrNull(
  character: CharacterDisplaySource,
): string | null {
  return getDisplayNameParts(character);
}

function getDisplayNameParts(character: CharacterDisplaySource): string | null {
  const nickname = getTrimmedDisplayText(character.lore.nickname);
  const name = getTrimmedDisplayText(character.lore.name);
  const nameEn = getTrimmedDisplayText(character.lore.nameEn);

  if (nickname && name && !isSameDisplayText(nickname, name)) {
    return appendEnglishName(`${nickname} / ${name}`, nameEn);
  }

  if (nickname) return nickname;

  if (name) return appendEnglishName(name, nameEn);

  return null;
}

export function getCharacterDepartmentLabel(
  character: Pick<CharacterDisplaySource, "department">,
): string | null {
  const department = character.department;
  if (!department || department === "UNASSIGNED") return null;

  const label = getDepartmentLabel(department);
  if (!label || label === "미배정") return null;

  return label;
}

export function getCharacterRoleLine(
  character: Pick<CharacterDisplaySource, "role" | "department">,
): string | null {
  const role = getTrimmedDisplayText(character.role);
  const departmentLabel = getCharacterDepartmentLabel(character);
  const parts = role ? [role] : [];

  if (
    departmentLabel &&
    !parts.some((part) => includesDisplayPart(part, departmentLabel))
  ) {
    parts.push(departmentLabel);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

function getTrimmedDisplayText(value: string | undefined | null): string | null {
  if (!isDisplayableCharacterText(value)) return null;
  return value.trim();
}

function includesDisplayPart(value: string, part: string): boolean {
  const normalizedPart = part.trim().toLowerCase();
  if (value.trim().toLowerCase().includes(normalizedPart)) return true;

  return value
    .split("/")
    .map((p) => p.trim().toLowerCase())
    .includes(normalizedPart);
}

function isSameDisplayText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function appendEnglishName(base: string, nameEn: string | null): string {
  if (!nameEn || includesDisplayPart(base, nameEn)) return base;
  return `${base} (${nameEn})`;
}
