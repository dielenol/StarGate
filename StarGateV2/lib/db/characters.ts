/**
 * characters CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

import { cache } from "react";

import "./init";

import { findMainCharacterByOwner } from "@stargate/shared-db";

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

/**
 * 요청 단위 메모이즈 버전 — (erp)/layout 이 모든 ERP 페이지 렌더에서 헤더 identity 용으로
 * 호출하므로, 같은 요청의 page/컴포넌트가 다시 조회해도 DB 왕복은 1회로 합쳐진다.
 * React cache() 는 RSC 렌더 수명이라 요청 간 공유가 없고, throw(1인 1 MAIN 정합성
 * 위반)도 원본과 동일하게 전파된다. 페이지(서버 컴포넌트) 경로 전용 — API 라우트는
 * layout 을 거치지 않으므로 원본을 그대로 쓴다.
 */
export const findMainCharacterByOwnerCached = cache(findMainCharacterByOwner);

export type { AgentCharacterCard } from "@stargate/shared-db";
