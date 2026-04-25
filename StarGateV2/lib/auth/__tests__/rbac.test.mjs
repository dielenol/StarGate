/**
 * P5 회귀 보호 — `canEditCharacter` + PLAYER 화이트리스트 정합성
 *
 * 검증 시나리오 (overseer 브리핑의 S1, S3, S5):
 *   S1: canEditCharacter 권한 boundary (admin/player/none × 6 케이스)
 *   S3: PLAYER_EDITABLE_FIELDS (CharacterEditForm) ↔ PLAYER_ALLOWED_CHARACTER_FIELDS (shared-db) sync
 *
 * S2(PATCH 라우트), S4(submit body), S5(existence oracle) 는 구조적으로 본 단위 테스트로
 * 직접 검증이 어려워(Next.js 환경 + 폼 상태) 같은 결정 함수 단위로 boundary 만 covers.
 *
 * 실행:
 *   cd StarGateV2 && node --experimental-strip-types --test lib/auth/__tests__/rbac.test.mjs
 *
 * 외부 의존성: 없음 (canEditCharacter / hasRole 은 순수 함수, shared-db ROLE_LEVEL_RANK 만 참조)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { canEditCharacter, hasRole } from "../rbac.ts";
import { PLAYER_ALLOWED_CHARACTER_FIELDS } from "@stargate/shared-db";

/* ── helpers ── */

const OWNER_ID = "user-owner-001";
const OTHER_ID = "user-other-002";

function character(ownerId) {
  return { ownerId };
}

/* ────────────────────────────────────────────────────────────────────── */
/* S1: canEditCharacter — 권한 boundary                                    */
/* ────────────────────────────────────────────────────────────────────── */

test("S1-1: 미인증(sessionUserId undefined) → none/unauthenticated", () => {
  const decision = canEditCharacter(undefined, undefined, character(OWNER_ID));
  assert.deepEqual(decision, {
    mode: "none",
    allowed: false,
    reason: "unauthenticated",
  });
});

test("S1-2: 미인증(role undefined) → none/unauthenticated", () => {
  const decision = canEditCharacter("u1", undefined, character(OWNER_ID));
  assert.equal(decision.mode, "none");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "unauthenticated");
});

test("S1-3: V 역할 (admin) → owner 무관하게 admin 모드", () => {
  // owner === self
  assert.deepEqual(
    canEditCharacter(OWNER_ID, "V", character(OWNER_ID)),
    { mode: "admin", allowed: true },
  );
  // owner !== self
  assert.deepEqual(
    canEditCharacter("v-user", "V", character(OWNER_ID)),
    { mode: "admin", allowed: true },
  );
  // ownerId === null
  assert.deepEqual(
    canEditCharacter("v-user", "V", character(null)),
    { mode: "admin", allowed: true },
  );
});

test("S1-4: GM 본인 캐릭터 → admin (V 보다 높으니 admin 우선)", () => {
  const decision = canEditCharacter(OWNER_ID, "GM", character(OWNER_ID));
  assert.equal(decision.mode, "admin", "GM은 본인 소유여도 admin 모드");
  assert.equal(decision.allowed, true);
});

test("S1-5: GM + 타인 소유 + null owner — 모두 admin", () => {
  for (const owner of [OWNER_ID, OTHER_ID, null]) {
    const decision = canEditCharacter("gm-user", "GM", character(owner));
    assert.equal(
      decision.mode,
      "admin",
      `GM은 모든 ownerId(${owner})에서 admin`,
    );
  }
});

test("S1-6: 비-V (A/M/H/G/J/U) + 본인 소유 → player 모드", () => {
  for (const role of ["A", "M", "H", "G", "J", "U"]) {
    const decision = canEditCharacter(OWNER_ID, role, character(OWNER_ID));
    assert.deepEqual(
      decision,
      { mode: "player", allowed: true },
      `role=${role} owner=self → player`,
    );
  }
});

test("S1-7: 비-V + 타인 소유 → none/not-owner", () => {
  for (const role of ["A", "M", "H", "G", "J", "U"]) {
    const decision = canEditCharacter(OWNER_ID, role, character(OTHER_ID));
    assert.deepEqual(
      decision,
      { mode: "none", allowed: false, reason: "not-owner" },
      `role=${role} owner=other → none/not-owner`,
    );
  }
});

test("S1-8: 비-V + ownerId === null → none/not-owner", () => {
  // null owner는 자가편집 자격 미충족 (소유자 미지정 캐릭터를 임의로 가져갈 수 없음)
  for (const role of ["A", "M", "H", "G", "J", "U"]) {
    const decision = canEditCharacter("any-user", role, character(null));
    assert.deepEqual(
      decision,
      { mode: "none", allowed: false, reason: "not-owner" },
      `role=${role} owner=null → none/not-owner`,
    );
  }
});

test("S1-9: 비-V + ownerId === '' (빈 문자열) → none/not-owner (truthy 가드)", () => {
  // canEditCharacter 의 `character.ownerId &&` 가드가 빈 문자열을 falsy 처리해야 함
  // (DB 에서 ownerId가 "" 로 저장되는 일은 드물지만 방어적 boundary)
  const decision = canEditCharacter("any-user", "U", character(""));
  assert.equal(decision.mode, "none");
  assert.equal(decision.reason, "not-owner");
});

test("S1-10: 비-V + ownerId === sessionUserId (대소문자 정확히 매칭)", () => {
  // 세션 ID와 ownerId 가 완전히 동일해야 player. 부분 일치/대소문자 무시 등 fuzzy match 없어야 함.
  const decision = canEditCharacter("U1", "U", character("u1"));
  assert.equal(decision.mode, "none", "대소문자 다르면 owner 일치 아님");
  assert.equal(decision.reason, "not-owner");
});

test("S1-11: hasRole 경계 — V 가 admin 의 cutoff", () => {
  // canEditCharacter 가 hasRole(role, 'V') 으로 admin 모드 분기.
  // V 와 GM 만 admin, 나머지 6개는 admin 아님.
  assert.equal(hasRole("GM", "V"), true);
  assert.equal(hasRole("V", "V"), true);
  assert.equal(hasRole("A", "V"), false);
  assert.equal(hasRole("M", "V"), false);
  assert.equal(hasRole("H", "V"), false);
  assert.equal(hasRole("G", "V"), false);
  assert.equal(hasRole("J", "V"), false);
  assert.equal(hasRole("U", "V"), false);
});

/* ────────────────────────────────────────────────────────────────────── */
/* S3: PLAYER_EDITABLE_FIELDS (Form) ↔ PLAYER_ALLOWED_CHARACTER_FIELDS sync */
/* ────────────────────────────────────────────────────────────────────── */

test("S3-1: PLAYER_ALLOWED_CHARACTER_FIELDS — sheet.* 7개 필드 정확히", () => {
  // P5 합의 — 자가편집 가능 필드는 정확히 sheet의 서사 7필드.
  // 새 필드 추가/삭제 시 본 테스트가 실패해 명시적 컨센서스 요구.
  const expected = [
    "sheet.quote",
    "sheet.appearance",
    "sheet.personality",
    "sheet.background",
    "sheet.gender",
    "sheet.age",
    "sheet.height",
  ];
  assert.equal(
    PLAYER_ALLOWED_CHARACTER_FIELDS.size,
    expected.length,
    `예상 ${expected.length}개, 실제 ${[...PLAYER_ALLOWED_CHARACTER_FIELDS].join(",")}`,
  );
  for (const field of expected) {
    assert.ok(
      PLAYER_ALLOWED_CHARACTER_FIELDS.has(field),
      `필수 필드 누락: ${field}`,
    );
  }
});

test("S3-2: PLAYER_ALLOWED_CHARACTER_FIELDS — 이미지 필드 미포함 (image leak 방지)", () => {
  // P5 안전 — 이미지 필드(GM 검수 영역) 가 자가편집 화이트리스트에 들어가면 안 됨.
  for (const forbidden of [
    "sheet.mainImage",
    "sheet.posterImage",
    "previewImage",
    "pixelCharacterImage",
  ]) {
    assert.ok(
      !PLAYER_ALLOWED_CHARACTER_FIELDS.has(forbidden),
      `금지 필드 포함됨: ${forbidden}`,
    );
  }
});

test("S3-3: PLAYER_ALLOWED_CHARACTER_FIELDS — 능력치/식별/소유권 미포함", () => {
  // 능력치(hp/san/atk/def 등)와 codename/role/agentLevel/ownerId 모두 admin 전용.
  for (const forbidden of [
    "sheet.hp",
    "sheet.san",
    "sheet.atk",
    "sheet.def",
    "sheet.equipment",
    "sheet.abilities",
    "sheet.credit",
    "codename",
    "role",
    "agentLevel",
    "ownerId",
    "isPublic",
    "department",
    "sheet.name", // 본명도 admin 영역 — 위장 정체성 변경 차단
  ]) {
    assert.ok(
      !PLAYER_ALLOWED_CHARACTER_FIELDS.has(forbidden),
      `금지 필드 포함됨: ${forbidden}`,
    );
  }
});

test("S3-4: PLAYER_ALLOWED_CHARACTER_FIELDS — 'sheet' 루트 키 미포함 (덮어쓰기 차단)", () => {
  // sheet 루트가 화이트리스트에 들어가면 sheet 통째로 $set 되어 능력치까지 날아감.
  // dot path 만 사용하는 게 P1 P5 의 안전 핵심.
  assert.ok(
    !PLAYER_ALLOWED_CHARACTER_FIELDS.has("sheet"),
    "PLAYER 화이트리스트는 dot path 만, 루트 'sheet' 키 금지",
  );
});

test("S3-5: PLAYER_ALLOWED_CHARACTER_FIELDS — 모든 항목이 'sheet.' prefix", () => {
  // CharacterEditForm 의 PLAYER_EDITABLE_FIELDS 는 .filter(p=>p.startsWith('sheet.')) 후
  // .slice('sheet.'.length) 로 derive — 만약 sheet 외 필드(예: 'codename')가 들어가면
  // form 헬퍼가 그 필드를 누락해 server↔client drift 발생.
  for (const path of PLAYER_ALLOWED_CHARACTER_FIELDS) {
    assert.ok(
      path.startsWith("sheet."),
      `'sheet.' prefix 외 필드: ${path} — CharacterEditForm.PLAYER_EDITABLE_FIELDS derive 가 누락함`,
    );
  }
});

test("S3-6: CharacterEditForm.PLAYER_EDITABLE_FIELDS — derive 로직 검증", () => {
  // CharacterEditForm.tsx 에서 사용하는 derive 식을 그대로 재현해 결과가 폼이 기대하는
  // 7개 키와 정확히 일치하는지 확인.
  // (CharacterEditForm 자체 import 는 React 코드라 단위 테스트에서 제외.
  //  대신 derive 식을 미러링해 sync 보장.)
  const derived = new Set(
    [...PLAYER_ALLOWED_CHARACTER_FIELDS]
      .filter((p) => p.startsWith("sheet."))
      .map((p) => p.slice("sheet.".length)),
  );

  const expected = new Set([
    "quote",
    "appearance",
    "personality",
    "background",
    "gender",
    "age",
    "height",
  ]);

  assert.equal(derived.size, expected.size, "derive 결과 7개여야 함");
  for (const key of expected) {
    assert.ok(derived.has(key), `폼 헬퍼가 '${key}' 를 잠금 해제해야 함`);
  }
});

/* ────────────────────────────────────────────────────────────────────── */
/* S5 (existence oracle) — boundary 측면 확인                              */
/* ────────────────────────────────────────────────────────────────────── */

test("S5-1: 라우트 oracle 차단 시뮬레이션 — 존재(타인소유) vs 미존재 모두 mode==='none'", () => {
  // 라우트는 `if (!character || decision.mode === 'none')` 로 둘 다 404 통합 응답.
  // 단위 함수 차원에서 두 시나리오가 모두 mode === 'none' 으로 종료되는지 확인.
  //  - 케이스 A: 타인 캐릭터 존재 → not-owner
  //  - 케이스 B: 캐릭터 미존재 (route 가 fallback `{ ownerId: null }` 주입) → not-owner
  const caseA = canEditCharacter("u-other", "U", character(OWNER_ID));
  const caseB = canEditCharacter("u-other", "U", { ownerId: null });

  assert.equal(caseA.mode, "none");
  assert.equal(caseB.mode, "none");
  // reason 은 다르지만 (route 가 둘 다 404 로 통합 + reason 노출 안 함) — 외부 응답 정합성 OK
  assert.equal(caseA.reason, "not-owner");
  assert.equal(caseB.reason, "not-owner");
});

test("S5-2: 인증 사용자 + 미존재 캐릭터(route fallback ownerId:null) → none/not-owner", () => {
  // 라우트는 `character ?? { ownerId: null }` 로 fallback. 비-V 사용자는 not-owner 로 결정.
  // V+ 가 미존재 캐릭터를 PATCH 하면 admin 모드가 나오지만 라우트의 `!character` 가드로 404 반환.
  const decisionForVUser = canEditCharacter("v-user", "V", { ownerId: null });
  assert.equal(decisionForVUser.mode, "admin", "V 는 fallback 에서도 admin");
  // 라우트는 admin 이라도 character == null 이면 404 응답 — 본 단위 테스트 범위 외.

  const decisionForU = canEditCharacter("u-user", "U", { ownerId: null });
  assert.equal(decisionForU.mode, "none");
  assert.equal(decisionForU.reason, "not-owner");
});
