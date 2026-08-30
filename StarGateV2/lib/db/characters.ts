/**
 * characters CRUD — shared-db로 이전됨 (shim)
 *
 * @deprecated shared-db에서 직접 import하세요.
 */

import { cache } from "react";

import "./init";

import {
  findDisplayDashboardCharacterByOwner,
  findDisplayCharacterByOwner,
  findDisplayCharacterLiteByOwner,
  findMainCharacterByOwner,
  findMainCharacterDisplayLiteByOwner,
  findMainDashboardCharacterByOwner,
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
  findDashboardCharacterById,
  findCharacterByCodename,
  findCharactersByIdsLite,
  findCharactersByCodenames,
  listCharactersByOwner,
  listCharactersByOwnerIds,
  findDisplayCharacterByOwner,
  findDisplayCharacterLiteByOwner,
  findMainCharacterByOwner,
  findMainCharacterLiteByOwner,
  findMainCharacterDisplayLiteByOwner,
  ADMIN_ALLOWED_CHARACTER_FIELDS,
  createCharacter,
  updateCharacter,
  applyCharacterFieldPatch,
  deleteCharacter,
} from "@stargate/shared-db";

/**
 * 요청 단위 메모이즈 버전. React cache()는 RSC 렌더 수명이라 요청 간 공유가 없고,
 * throw(1인 1 MAIN 정합성 위반)도 원본과 동일하게 전파된다. 페이지(서버 컴포넌트)
 * 경로 전용이며 API 라우트는 원본을 그대로 쓴다.
 *
 * lore 전문/play 시트를 실제 소비하는 렌더 경로(장비 상점 라이선스 자격 판정,
 * 시뮬레이터 스탯) 전용. 표시 필드만 쓰는 페이지는
 * `findMainCharacterDisplayLiteByOwnerCached`를 사용할 것.
 */
export const findMainCharacterByOwnerCached = cache(findMainCharacterByOwner);

/**
 * 헤더/대시보드 신원 표시 전용. 경제·인벤토리·주식 메인 캐릭터와 분리해
 * ACTIVE GM의 명시적 NPC 연결을 표시할 수 있다.
 */
export const findDisplayCharacterByOwnerCached = cache(
  findDisplayCharacterByOwner,
);

export const findDisplayCharacterLiteByOwnerCached = cache(
  findDisplayCharacterLiteByOwner,
);

/** 대시보드의 초상·HP/SAN/포인트만 요청 단위로 읽는 경량 조회. */
export const findMainDashboardCharacterByOwnerCached = cache(
  findMainDashboardCharacterByOwner,
);
export const findDisplayDashboardCharacterByOwnerCached = cache(
  findDisplayDashboardCharacterByOwner,
);

/**
 * 경제 화면 표시용 경량 변형의 요청 단위 메모이즈 버전. lore 전문·play 시트 없이
 * 실제 메인 캐릭터의 identity + lore.name 만 반환한다. ERP 헤더는 display 전용
 * cached wrapper를 사용해 GM 표시 NPC와 경제 메인을 분리한다.
 */
export const findMainCharacterDisplayLiteByOwnerCached = cache(
  findMainCharacterDisplayLiteByOwner,
);

export type {
  AgentCharacterCard,
  CharacterListItem,
  CharacterRef,
  DashboardCharacter,
  MainCharacterDisplayLite,
} from "@stargate/shared-db";
