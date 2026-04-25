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
 * `listCharactersByOwnerIds` 는 sheet 전체를 가져오지만 `type`/`role`/`previewImage` 가
 * projection에서 빠진다. 프로필 카드 그리드에서는 카드 헤더에 type/role/previewImage 가
 * 모두 필요하기 때문에, shared-db에 새 함수를 추가하지 않고 여기서 자체 projection으로 조회.
 *
 * 반환 필드는 카드 그리드/히어로 렌더에 필요한 최소 셋만.
 */
export async function listProfileCharactersByOwner(
  ownerId: string,
): Promise<
  Pick<
    Character,
    "_id" | "codename" | "type" | "role" | "agentLevel" | "previewImage" | "sheet"
  >[]
> {
  const col = await charactersCol();
  return col
    .find({ ownerId })
    .project<
      Pick<
        Character,
        "_id" | "codename" | "type" | "role" | "agentLevel" | "previewImage" | "sheet"
      >
    >({
      codename: 1,
      type: 1,
      role: 1,
      agentLevel: 1,
      previewImage: 1,
      sheet: 1,
    })
    .sort({ type: 1, codename: 1 })
    .toArray();
}
