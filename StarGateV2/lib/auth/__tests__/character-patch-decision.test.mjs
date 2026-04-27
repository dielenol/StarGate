/**
 * P5 회귀 보호 — PATCH 라우트의 응답 정합성 (S2 + S5)
 *
 * 실제 Next.js 라우트(`app/api/erp/characters/[id]/route.ts`) 는 auth()/DB 의존이라
 * 단위 테스트로 띄울 수 없다. 대신 라우트의 핵심 분기 로직(권한 결정 ↔ 응답 status 매핑)
 * 을 미러링한 헬퍼로 boundary 를 모두 covers.
 *
 * 라우트 핵심:
 *   1. auth() == null → 401
 *   2. !isValidObjectId → 400
 *   3. character 존재 여부와 decision.mode === 'none' 을 통합 — 둘 다 404
 *      (oracle 차단: 존재는 하나 권한 없음 / 미존재 둘 다 같은 응답)
 *   4. allowedFields = mode === 'admin' ? ADMIN_ALLOWED : PLAYER_ALLOWED
 *
 * 실행:
 *   cd StarGateV2 && node --experimental-strip-types --test lib/auth/__tests__/character-patch-decision.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { canEditLore } from "../rbac.ts";
import {
  ADMIN_ALLOWED_CHARACTER_FIELDS,
  PLAYER_ALLOWED_CHARACTER_FIELDS,
} from "@stargate/shared-db";

/**
 * 라우트 분기 로직 미러링.
 * 입력: session, characterDoc(존재 시 객체, 미존재면 null), id 검증 결과
 * 출력: { status, allowedFields? }
 *
 * route.ts 의 PATCH 흐름과 1:1 대응. 변경 시 본 헬퍼와 route.ts 를 함께 수정.
 */
function decidePatchResponse({ session, character, idValid }) {
  // 1. 미인증
  if (!session?.user) return { status: 401 };
  // 2. ID 형식 검증
  if (!idValid) return { status: 400 };

  // 3. character ?? { ownerId: null } fallback 후 권한 결정
  const decision = canEditLore(
    session.user.id,
    session.user.role,
    character ?? { type: "AGENT", ownerId: null },
  );

  // 4. character 미존재 또는 mode === 'none' → 통합 404 (oracle 차단)
  if (!character || decision.mode === "none") {
    return { status: 404 };
  }

  // 5. mode 별 화이트리스트
  const allowedFields =
    decision.mode === "admin"
      ? ADMIN_ALLOWED_CHARACTER_FIELDS
      : PLAYER_ALLOWED_CHARACTER_FIELDS;
  return { status: 200, allowedFields, mode: decision.mode };
}

const validSession = (id, role) => ({ user: { id, role } });
const charDoc = (ownerId, type = "AGENT") => ({ type, ownerId });

/* ────────────────────────────────────────────────────────────────────── */
/* S2: PATCH 라우트 응답 정합성                                            */
/* ────────────────────────────────────────────────────────────────────── */

test("S2-1: 미인증 → 401", () => {
  const res = decidePatchResponse({
    session: null,
    character: charDoc("any"),
    idValid: true,
  });
  assert.equal(res.status, 401);
});

test("S2-2: 잘못된 ID 형식 → 400 (인증돼도)", () => {
  const res = decidePatchResponse({
    session: validSession("u1", "GM"),
    character: charDoc("any"),
    idValid: false,
  });
  assert.equal(res.status, 400);
});

test("S2-3: V 사용자 + 정상 캐릭터 → 200 admin (ADMIN_ALLOWED)", () => {
  const res = decidePatchResponse({
    session: validSession("v-user", "V"),
    character: charDoc("other"),
    idValid: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.mode, "admin");
  assert.strictEqual(res.allowedFields, ADMIN_ALLOWED_CHARACTER_FIELDS);
});

test("S2-4: GM 사용자 + 정상 캐릭터 → 200 admin", () => {
  const res = decidePatchResponse({
    session: validSession("gm-user", "GM"),
    character: charDoc("other"),
    idValid: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.mode, "admin");
  assert.strictEqual(res.allowedFields, ADMIN_ALLOWED_CHARACTER_FIELDS);
});

test("S2-5: 비-V owner 본인 → 200 player (PLAYER_ALLOWED)", () => {
  const res = decidePatchResponse({
    session: validSession("u-self", "U"),
    character: charDoc("u-self"),
    idValid: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.mode, "player");
  assert.strictEqual(res.allowedFields, PLAYER_ALLOWED_CHARACTER_FIELDS);
});

test("S2-5b: 비-V owner 본인 NPC → 404 (NPC self-edit 차단)", () => {
  const res = decidePatchResponse({
    session: validSession("u-self", "U"),
    character: charDoc("u-self", "NPC"),
    idValid: true,
  });
  assert.equal(res.status, 404);
});

test("S2-6: 비-V 사용자 + 타인 캐릭터 (존재) → 404", () => {
  const res = decidePatchResponse({
    session: validSession("u-other", "U"),
    character: charDoc("u-self"),
    idValid: true,
  });
  assert.equal(res.status, 404, "권한 없음을 404 로 통합");
});

test("S2-7: 비-V 사용자 + 미존재 캐릭터 → 404", () => {
  const res = decidePatchResponse({
    session: validSession("u-other", "U"),
    character: null,
    idValid: true,
  });
  assert.equal(res.status, 404);
});

test("S2-8: V 사용자 + 미존재 캐릭터 → 404 (admin 라도 character null 시 404)", () => {
  const res = decidePatchResponse({
    session: validSession("v-user", "V"),
    character: null,
    idValid: true,
  });
  assert.equal(res.status, 404);
});

test("S2-9: 응답에 reason 노출 안 됨 (route handler 응답 스키마 미러)", () => {
  // 라우트는 console.warn 으로만 reason 을 로깅하고 NextResponse.json 에는 포함하지 않음.
  // 본 헬퍼는 status 만 반환 — body 비교 단위 테스트는 라우트 통합 테스트 영역.
  // 여기서는 헬퍼 응답에 reason 키가 없는지만 확인.
  const res = decidePatchResponse({
    session: validSession("u-other", "U"),
    character: charDoc("u-self"),
    idValid: true,
  });
  assert.equal(res.status, 404);
  assert.equal("reason" in res, false, "응답에 reason 노출 금지");
  assert.equal("mode" in res, false, "404 응답에 mode 노출 금지");
});

/* ────────────────────────────────────────────────────────────────────── */
/* S5: existence oracle 차단                                                */
/* ────────────────────────────────────────────────────────────────────── */

test("S5-1: 비-V 사용자 — 존재(타인소유) vs 미존재 → 동일 status 404", () => {
  // P5 핵심 안전성: 비-V 사용자가 임의의 ObjectId 로 PATCH 시도해도 캐릭터 존재 여부를
  // 응답 status 차이로 알아낼 수 없어야 함.
  const sessionU = validSession("u-other", "U");

  const existsButNotOwned = decidePatchResponse({
    session: sessionU,
    character: charDoc("u-self"),
    idValid: true,
  });
  const doesNotExist = decidePatchResponse({
    session: sessionU,
    character: null,
    idValid: true,
  });

  assert.deepEqual(
    existsButNotOwned,
    doesNotExist,
    "두 시나리오의 응답이 완전히 동일해야 oracle 차단 성립",
  );
  assert.equal(existsButNotOwned.status, 404);
});

test("S5-2: 비-V 사용자 — null owner 캐릭터 vs 미존재 → 동일 404", () => {
  // ownerId: null 인 NPC 같은 케이스도 존재 자체를 노출하지 않아야 함.
  const sessionU = validSession("u-any", "U");

  const nullOwnerExists = decidePatchResponse({
    session: sessionU,
    character: charDoc(null),
    idValid: true,
  });
  const doesNotExist = decidePatchResponse({
    session: sessionU,
    character: null,
    idValid: true,
  });

  assert.deepEqual(nullOwnerExists, doesNotExist);
});

test("S5-3: V 사용자 — 존재 vs 미존재 → 다른 응답 (oracle 무관, admin이라 OK)", () => {
  // V 이상은 어차피 admin 모드라 모든 캐릭터에 접근 가능 — oracle 보호 대상 아님.
  // 미존재만 404, 존재는 200.
  const sessionV = validSession("v-user", "V");

  const exists = decidePatchResponse({
    session: sessionV,
    character: charDoc("any"),
    idValid: true,
  });
  const doesNotExist = decidePatchResponse({
    session: sessionV,
    character: null,
    idValid: true,
  });

  assert.equal(exists.status, 200);
  assert.equal(doesNotExist.status, 404);
});
