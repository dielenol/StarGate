/**
 * @deprecated shared-db에서 직접 import하세요.
 *
 * Phase 1 후 sheet 단일 구조 → lore/play 분리. SheetBase/AgentSheet/NpcSheet 는 더 이상 존재하지 않음.
 * 신규 코드는 LoreSheet / PlaySheet / AbilitySlot 사용.
 */

export type {
  Character,
  AgentCharacter,
  NpcCharacter,
  CharacterType,
  CharacterTier,
  AgentLevel,
  DepartmentCode,
  FactionCode,
  InstitutionCode,
  LegacyDepartmentCode,
  LoreSheet,
  PlaySheet,
  AbilitySlot,
  Equipment,
  Ability,
  CreateCharacterInput,
  CharacterPublic,
} from "@stargate/shared-db/types";

export {
  AGENT_LEVELS,
  AGENT_LEVEL_LABELS,
  CHARACTER_TIERS,
  DEPARTMENTS,
  FACTIONS,
  INSTITUTIONS,
} from "@stargate/shared-db/types";
