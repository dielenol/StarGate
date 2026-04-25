import type { ObjectId } from "mongodb";

import type { RoleLevel } from "./character.js";

/* ── Character change log ──
   캐릭터 문서에 대한 모든 수정(self-edit, 관리자 수정, 자동화)을 기록하는 감사 로그.
   insert는 update 성공 후 호출자가 별도 호출 (트랜잭션 미사용). */

export interface CharacterChangeLogEntry {
  /** 변경된 필드. `sheet.quote` 같은 dot path 그대로 저장. */
  field: string;
  /** 변경 전 값. 필드가 없었으면 undefined(serialize 후 null 될 수 있음). */
  before: unknown;
  /** 변경 후 값. */
  after: unknown;
}

export interface CharacterChangeLog {
  _id: ObjectId;
  characterId: ObjectId;
  /** user._id 의 string 표현 (actor/userId 일관성 위해 string). */
  actorId: string;
  actorRole: RoleLevel;
  /** actor가 캐릭터 ownerId와 일치하는지 여부 (self-edit 구분). */
  actorIsOwner: boolean;
  /** 'player' = 자가편집, 'admin' = 관리자 편집. */
  source: "player" | "admin";
  changes: CharacterChangeLogEntry[];
  /** 선택적 변경 사유. player는 보통 비워둠, admin은 사유 기재 권장. */
  reason?: string;
  createdAt: Date;
  /** 되돌림(revert)이 적용된 시각. null/미설정이면 아직 유효한 변경. */
  revertedAt?: Date | null;
  /** 되돌린 actor (user._id string). */
  revertedBy?: string | null;
}

/** insert 시 호출자가 넘겨야 하는 필드. createdAt/revertedAt/revertedBy 는 CRUD에서 주입. */
export type NewCharacterChangeLog = Omit<
  CharacterChangeLog,
  "_id" | "createdAt" | "revertedAt" | "revertedBy"
>;
