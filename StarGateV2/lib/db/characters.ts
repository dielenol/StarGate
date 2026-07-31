/**
 * characters CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

import { cache } from "react";

import "./init";

import {
  findMainCharacterByOwner,
  findMainCharacterDisplayLiteByOwner,
} from "@stargate/shared-db";

export {
  listCharacters,
  listCharactersByType,
  listAgentCharacters,
  listAgentCharacterCards,
  listCharacterListItems,
  listCharacterRefs,
  listPublicCharacters,
  listPublicCharactersByType,
  findCharacterById,
  findCharacterByCodename,
  findCharactersByIdsLite,
  findCharactersByCodenames,
  listCharactersByOwner,
  listCharactersByOwnerIds,
  findMainCharacterByOwner,
  findMainCharacterLiteByOwner,
  findMainCharacterDisplayLiteByOwner,
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
 *
 * lore 전문/play 시트를 실제 소비하는 렌더 경로(장비 상점 라이선스 자격 판정,
 * 시뮬레이터 스탯, 대시보드 displayCharacter) 전용. 표시 필드만 쓰는 페이지는
 * `findMainCharacterDisplayLiteByOwnerCached` 로 통일할 것 — 같은 렌더 패스에서
 * 두 변형을 섞어 부르면 cache 키가 달라 쿼리가 2회가 된다.
 */
export const findMainCharacterByOwnerCached = cache(findMainCharacterByOwner);

/**
 * 표시용 경량 변형의 요청 단위 메모이즈 버전 — (erp)/layout 헤더 identity 와
 * 크레딧/주식/상점 페이지가 공유한다. lore 전문·play 시트 없이
 * identity + lore.name 만 반환하며, null/throw 의미론은 heavy cached 와 동일.
 */
export const findMainCharacterDisplayLiteByOwnerCached = cache(
  findMainCharacterDisplayLiteByOwner,
);

export type {
  AgentCharacterCard,
  CharacterListItem,
  CharacterRef,
  MainCharacterDisplayLite,
} from "@stargate/shared-db";
