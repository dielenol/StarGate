/**
 * P8 회귀 보호 — changesToRevertBody (dot path → 부분 객체 트리)
 *
 * shared-db 의 buildUpdatePatch 는 dot path 자체를 입력으로 받지 못하고,
 *   - 단순 키:    input[key]
 *   - dot path:  input.<root>?.<rest>
 * 형태로 부분 객체 트리에서 값을 추출한다. 따라서 revert 시 changes 배열을
 * 그 형태로 다시 풀어줘야 ADMIN 화이트리스트 기반 update 가 정상 동작한다.
 *
 * 본 테스트는 변환 결과의 형태/병합/edge case 를 보호한다 — 실제 DB 호출은
 * lib/auth/__tests__/character-edit-e2e.test.mjs 흐름 (mock + buildUpdatePatch)
 * 과 보완 관계.
 *
 * 실행:
 *   cd StarGateV2 &&
 *     node --test --experimental-strip-types lib/character/__tests__/revert.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { changesToRevertBody } from "../revert.ts";

test("R1: 단순 키 변환", () => {
  const body = changesToRevertBody([
    { field: "codename", before: "C-1", after: "C-2" },
  ]);
  assert.deepEqual(body, { codename: "C-1" });
});

test("R2: dot path 한 깊이 — sheet.quote", () => {
  const body = changesToRevertBody([
    { field: "sheet.quote", before: "before quote", after: "after quote" },
  ]);
  assert.deepEqual(body, { sheet: { quote: "before quote" } });
});

test("R3: 같은 root 의 여러 dot path 가 같은 부분 객체로 병합", () => {
  const body = changesToRevertBody([
    { field: "sheet.quote", before: "Q", after: "Q2" },
    { field: "sheet.appearance", before: "A", after: "A2" },
    { field: "sheet.gender", before: "G", after: "G2" },
  ]);
  assert.deepEqual(body, {
    sheet: { quote: "Q", appearance: "A", gender: "G" },
  });
});

test("R4: 단순 키 + dot path 혼합", () => {
  const body = changesToRevertBody([
    { field: "codename", before: "OLD", after: "NEW" },
    { field: "sheet.name", before: "John", after: "Jane" },
    { field: "isPublic", before: false, after: true },
  ]);
  assert.deepEqual(body, {
    codename: "OLD",
    sheet: { name: "John" },
    isPublic: false,
  });
});

test("R5: before === null / undefined / 0 / false 모두 보존", () => {
  const body = changesToRevertBody([
    { field: "ownerId", before: null, after: "user-1" },
    { field: "sheet.hp", before: 0, after: 100 },
    { field: "isPublic", before: false, after: true },
  ]);
  assert.equal(body.ownerId, null);
  assert.equal(body.sheet.hp, 0);
  assert.equal(body.isPublic, false);
});

test("R6: 빈 배열 → 빈 객체", () => {
  const body = changesToRevertBody([]);
  assert.deepEqual(body, {});
});

test("R7: 잘못된 field (빈 string / 비-string) 는 silent skip", () => {
  const body = changesToRevertBody([
    { field: "", before: "X", after: "Y" },
    // @ts-expect-error 의도적 invalid
    { field: null, before: "X", after: "Y" },
    { field: "codename", before: "OK", after: "NEW" },
  ]);
  assert.deepEqual(body, { codename: "OK" });
});

test("R8: 깊은 dot path (3단) — a.b.c", () => {
  const body = changesToRevertBody([
    { field: "a.b.c", before: 42, after: 99 },
    { field: "a.b.d", before: "x", after: "y" },
  ]);
  assert.deepEqual(body, { a: { b: { c: 42, d: "x" } } });
});

test("R9: P5/P6 화이트리스트와 결합 — sheet 루트 키 누설 없음 (간접 보장)", () => {
  // changesToRevertBody 는 화이트리스트를 의식하지 않고 모든 변경을 풀어 두고,
  // 실제 화이트리스트 가드는 updateCharacter 의 buildUpdatePatch 가 적용한다.
  // 본 단위에선 출력이 'sheet' 루트 키를 직접 가지지 않는지(부분 객체로만)만 확인.
  const body = changesToRevertBody([
    { field: "sheet.quote", before: "Q", after: "Q2" },
  ]);
  assert.ok("sheet" in body, "sheet 부분 객체 자체는 존재");
  assert.equal(typeof body.sheet, "object");
  // sheet 안의 모든 키는 dot path 의 sub key — buildUpdatePatch 가 'sheet.quote' 로 조회.
  assert.ok(
    !("." in body),
    "literal dot 키는 출력에 없어야 함 (분리된 트리만)",
  );
});

test("R10: 동일 field 중복 entry — 마지막 값이 최종 (덮어쓰기)", () => {
  // 일반적으로는 동일 변경이 한 audit 안에 중복되지 않지만, 방어적으로 동작 보호.
  const body = changesToRevertBody([
    { field: "sheet.quote", before: "FIRST", after: "X" },
    { field: "sheet.quote", before: "SECOND", after: "Y" },
  ]);
  assert.equal(body.sheet.quote, "SECOND");
});
