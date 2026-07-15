const CLASSIFIED_VALUE = "[CLASSIFIED]";

interface PersonnelNameSource {
  codename: string;
  lore: {
    name?: string | null;
    nickname?: string | null;
    nameEn?: string | null;
  };
}

export function getPersonnelPrimaryName(
  character: PersonnelNameSource,
): string {
  return getPersonnelPrimaryNameOrNull(character) ?? character.codename;
}

export function getPersonnelPrimaryNameOrNull(
  character: PersonnelNameSource,
): string | null {
  const name = getDisplayText(character.lore.name);
  const nickname = getDisplayText(character.lore.nickname);
  const nameEn = getDisplayText(character.lore.nameEn);

  if (name) return appendEnglishName(name, nameEn);
  return nickname;
}

export function getPersonnelAliasOrNull(
  character: PersonnelNameSource,
): string | null {
  const name = getDisplayText(character.lore.name);
  const nickname = getDisplayText(character.lore.nickname);

  if (!name || !nickname || isSameDisplayText(name, nickname)) return null;
  return nickname;
}

function getDisplayText(value: string | undefined | null): string | null {
  if (!value || !value.trim() || value.trim() === CLASSIFIED_VALUE) return null;
  return value.trim();
}

function isSameDisplayText(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function appendEnglishName(name: string, nameEn: string | null): string {
  if (!nameEn || name.toLocaleLowerCase().includes(nameEn.toLocaleLowerCase())) {
    return name;
  }
  return `${name} (${nameEn})`;
}
