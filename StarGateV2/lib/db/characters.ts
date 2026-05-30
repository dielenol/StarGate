/**
 * characters CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

import "./init";

export {
  listCharacters,
  listCharactersByType,
  listAgentCharacters,
  listAgentCharacterCards,
  listPublicCharacters,
  listPublicCharactersByType,
  findCharacterById,
  findCharacterByCodename,
  listCharactersByOwner,
  listCharactersByOwnerIds,
  findMainCharacterByOwner,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from "@stargate/shared-db";

export type { AgentCharacterCard } from "@stargate/shared-db";
