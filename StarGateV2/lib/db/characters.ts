/**
 * characters CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

import "./init";

import type { Character } from "@stargate/shared-db";
import { charactersCol } from "@stargate/shared-db";

export {
  listCharacters,
  listCharactersByType,
  listAgentCharacters,
  listPublicCharacters,
  listPublicCharactersByType,
  findCharacterById,
  findCharacterByCodename,
  listCharactersByOwner,
  listCharactersByOwnerIds,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from "@stargate/shared-db";

/**
 * 프로필 대문(`/erp/profile`)용 — 한 명의 owner가 보유한 캐릭터 카드 정보를 한 번에 조회.
 *
 * `listCharactersByOwnerIds` 는 lore 만 가져오고 type/role/previewImage 등 카드 헤더 필드가
 * projection 에서 빠진다. 프로필 카드 그리드에서는 카드 헤더에 type/role/previewImage 가
 * 모두 필요하기 때문에 여기서 lore + play 를 함께 자체 projection 한다.
 *
 * NPC 도 owner 로 잡힐 수 있으므로 play 는 optional. 호출자(ProfileClient) 는 lore 만 사용.
 */
export async function listProfileCharactersByOwner(
  ownerId: string,
): Promise<
  Pick<
    Character,
    | "_id"
    | "codename"
    | "type"
    | "role"
    | "agentLevel"
    | "previewImage"
    | "lore"
  >[]
> {
  const col = await charactersCol();
  return col
    .find({ ownerId })
    .project<
      Pick<
        Character,
        | "_id"
        | "codename"
        | "type"
        | "role"
        | "agentLevel"
        | "previewImage"
        | "lore"
      >
    >({
      codename: 1,
      type: 1,
      role: 1,
      agentLevel: 1,
      previewImage: 1,
      lore: 1,
    })
    .sort({ type: 1, codename: 1 })
    .toArray();
}
