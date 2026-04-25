/**
 * P5 회귀 보호 — Form ↔ Server 화이트리스트 e2e 정합성 (S3/S4 보강)
 *
 * 목적:
 *   - CharacterEditForm.handleSubmit 의 body 빌더가 만드는 payload가
 *     서버의 buildUpdatePatch + PLAYER_ALLOWED_CHARACTER_FIELDS 를 거쳤을 때
 *     정확히 의도한 7필드 dot path 만 $set 에 들어가는지 e2e 시뮬레이션.
 *   - reviewer 가 합의한 `Record<string, unknown>` 캐스트 + sheet 부분객체 흐름이
 *     화이트리스트와 정확히 결합하는지 (drift 회귀 보호).
 *   - 응답 body 에 reason 노출 안 됨 (route handler 미러 검증)
 *
 * 실행:
 *   cd StarGateV2 &&
 *     node --test --experimental-test-module-mocks \
 *       lib/auth/__tests__/character-edit-e2e.test.mjs
 *
 * 의존:
 *   - shared-db dist 빌드되어 있어야 함 (`pnpm --filter @stargate/shared-db build`)
 *   - mock.module 로 charactersCol 가짜 교체 → DB 의존 없음
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ObjectId } from "mongodb";

import { canEditCharacter } from "../rbac.ts";

const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("P5 e2e: module mock 미지원 환경 — skip", { skip: true }, () => {});
} else {
  let capturedSetPayload = null;

  const fakeCol = {
    updateOne: async (_filter, doc) => {
      capturedSetPayload = doc.$set;
      return { modifiedCount: 1, matchedCount: 1, acknowledged: true };
    },
  };

  // shared-db dist 의 collections.js 를 mock 으로 교체
  const sharedDbRoot = new URL(
    "../../../../packages/shared-db/dist/",
    import.meta.url,
  );
  testApi.mock.module(new URL("collections.js", sharedDbRoot).href, {
    namedExports: {
      charactersCol: async () => fakeCol,
    },
  });

  // mock 등록 후 import — characters.js 가 mocked collections 를 사용
  const { updateCharacter, PLAYER_ALLOWED_CHARACTER_FIELDS } = await import(
    new URL("crud/characters.js", sharedDbRoot).href
  );

  const VALID_ID = new ObjectId().toHexString();

  /**
   * CharacterEditForm.handleSubmit 의 player 모드 body 빌더 미러링.
   * (실제 컴포넌트는 React 라 직접 import 불가 — 분기 로직만 추출)
   */
  function buildPlayerBody(form) {
    return {
      sheet: {
        quote: form.quote,
        appearance: form.appearance,
        personality: form.personality,
        background: form.background,
        gender: form.gender,
        age: form.age,
        height: form.height,
      },
    };
  }

  /**
   * CharacterEditForm.handleSubmit 의 admin 모드 body 빌더 (AGENT) 미러링.
   */
  function buildAdminAgentBody(form) {
    const sheetBase = {
      codename: form.codename,
      name: form.name,
      mainImage: form.mainImage,
      posterImage: form.posterImage,
      quote: form.quote,
      gender: form.gender,
      age: form.age,
      height: form.height,
      appearance: form.appearance,
      personality: form.personality,
      background: form.background,
    };
    return {
      codename: form.codename,
      role: form.role,
      previewImage: form.previewImage,
      isPublic: form.isPublic,
      ownerId: form.ownerId || null,
      sheet: {
        ...sheetBase,
        weight: form.weight,
        className: form.className,
        hp: form.hp,
        san: form.san,
        def: form.def,
        atk: form.atk,
        abilityType: form.abilityType,
        credit: form.credit,
        weaponTraining: form.weaponTraining,
        skillTraining: form.skillTraining,
        equipment: form.equipment,
        abilities: form.abilities,
      },
    };
  }

  /* ────────────────────────────────────────────────────────────────────── */
  /* S4-1: player 모드 body → PLAYER 화이트리스트 → 정확히 7개 dot path        */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S4-1: 정상 player body — sheet 7필드 dot path 만 $set 에 통과", async () => {
    capturedSetPayload = null;

    const form = {
      quote: "오늘도 살아남자.",
      appearance: "슬림한 체격",
      personality: "냉정함",
      background: "전직 군인",
      gender: "male",
      age: "29",
      height: "183cm",
    };
    const body = buildPlayerBody(form);

    const result = await updateCharacter(VALID_ID, body, {
      allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS,
    });
    assert.equal(result, true);
    assert.ok(capturedSetPayload);

    // 정확히 7개 dot path + updatedAt 만 들어가야 함
    const keys = Object.keys(capturedSetPayload).filter(
      (k) => k !== "updatedAt",
    );
    assert.deepEqual(
      new Set(keys),
      new Set([
        "sheet.quote",
        "sheet.appearance",
        "sheet.personality",
        "sheet.background",
        "sheet.gender",
        "sheet.age",
        "sheet.height",
      ]),
      `의도한 7개 dot path 외 키 누설 — 실제: ${keys.join(",")}`,
    );

    // 값 정합성
    assert.equal(capturedSetPayload["sheet.quote"], "오늘도 살아남자.");
    assert.equal(capturedSetPayload["sheet.appearance"], "슬림한 체격");
    assert.equal(capturedSetPayload["sheet.gender"], "male");
    assert.equal(capturedSetPayload["sheet.age"], "29");

    // 루트 'sheet' 키 누설 없음
    assert.ok(
      !("sheet" in capturedSetPayload),
      "'sheet' 루트 키가 $set 에 누설되면 안 됨",
    );
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* S4-2: 악의적 player body — admin 필드 + 능력치 시도, 모두 silent drop     */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S4-2: 악의적 player body — codename/role/agentLevel/이미지/능력치 모두 silent drop", async () => {
    capturedSetPayload = null;

    // form 변조: 클라이언트 코드 우회해 PLAYER 모드인데 admin 필드까지 붙여 보냄
    const evilBody = {
      ...buildPlayerBody({
        quote: "Q",
        appearance: "A",
        personality: "P",
        background: "B",
        gender: "G",
        age: "A",
        height: "H",
      }),
      // 악의 추가
      codename: "HACKED",
      role: "GM",
      agentLevel: "GM",
      ownerId: "evil-owner",
      isPublic: true,
      previewImage: "/evil.png",
    };

    // sheet 안에도 능력치/이미지 시도
    evilBody.sheet.hp = 999;
    evilBody.sheet.atk = 999;
    evilBody.sheet.mainImage = "/evil-main.png";
    evilBody.sheet.posterImage = "/evil-poster.png";
    evilBody.sheet.codename = "HACKED2";

    const result = await updateCharacter(VALID_ID, evilBody, {
      allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS,
    });
    assert.equal(result, true);

    // 1) admin 필드 누설 없음
    for (const forbidden of [
      "codename",
      "role",
      "agentLevel",
      "ownerId",
      "isPublic",
      "previewImage",
    ]) {
      assert.ok(
        !(forbidden in capturedSetPayload),
        `${forbidden} silent drop 실패`,
      );
    }

    // 2) sheet 내부 능력치/이미지 dot path 누설 없음
    for (const forbidden of [
      "sheet.hp",
      "sheet.atk",
      "sheet.def",
      "sheet.san",
      "sheet.mainImage",
      "sheet.posterImage",
      "sheet.codename",
    ]) {
      assert.ok(
        !(forbidden in capturedSetPayload),
        `${forbidden} silent drop 실패`,
      );
    }

    // 3) sheet 루트 키 누설 없음
    assert.ok(!("sheet" in capturedSetPayload));

    // 4) 정상 7필드는 통과
    assert.equal(capturedSetPayload["sheet.quote"], "Q");
    assert.equal(capturedSetPayload["sheet.appearance"], "A");
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* S4-3: admin body — sheet 통째 + 메타 모두 통과 (회귀 0)                  */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S4-3: 정상 admin AGENT body — sheet 통째 + 메타 모두 $set 에 포함", async () => {
    capturedSetPayload = null;

    const form = {
      codename: "AGENT_001",
      role: "field operative",
      previewImage: "/preview.png",
      isPublic: true,
      ownerId: "user-self",
      name: "John Doe",
      mainImage: "/main.png",
      posterImage: "/poster.png",
      quote: "Q",
      gender: "M",
      age: "30",
      height: "180",
      appearance: "A",
      personality: "P",
      background: "B",
      weight: "75",
      className: "Combat",
      hp: 100,
      san: 80,
      def: 5,
      atk: 7,
      abilityType: "Type-A",
      credit: 1000,
      weaponTraining: "Pistol",
      skillTraining: "Stealth",
      equipment: [],
      abilities: [],
    };
    const body = buildAdminAgentBody(form);

    // admin 모드는 allowedFields 미지정 → ADMIN 디폴트
    const result = await updateCharacter(VALID_ID, body);
    assert.equal(result, true);

    // 1) sheet 루트 키가 통째 포함되어야 함 (admin 의 의도된 동작)
    assert.deepEqual(capturedSetPayload.sheet, body.sheet);

    // 2) 최상위 메타 필드 모두 포함
    assert.equal(capturedSetPayload.codename, "AGENT_001");
    assert.equal(capturedSetPayload.role, "field operative");
    assert.equal(capturedSetPayload.previewImage, "/preview.png");
    assert.equal(capturedSetPayload.isPublic, true);
    assert.equal(capturedSetPayload.ownerId, "user-self");
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* S4-4: ownerId 빈 문자열 → null 변환 (form 의 `ownerId || null`)            */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S4-4: admin body 의 ownerId === '' → null 로 정규화", async () => {
    capturedSetPayload = null;

    const form = {
      codename: "X",
      role: "X",
      previewImage: "",
      isPublic: false,
      ownerId: "", // 빈 문자열
      name: "",
      mainImage: "",
      posterImage: "",
      quote: "",
      gender: "",
      age: "",
      height: "",
      appearance: "",
      personality: "",
      background: "",
      weight: "",
      className: "",
      hp: 0,
      san: 0,
      def: 0,
      atk: 0,
      abilityType: "",
      credit: "",
      weaponTraining: "",
      skillTraining: "",
      equipment: [],
      abilities: [],
    };
    const body = buildAdminAgentBody(form);

    assert.equal(body.ownerId, null, "form 빌더가 빈 문자열을 null 로 변환");

    const result = await updateCharacter(VALID_ID, body);
    assert.equal(result, true);
    assert.equal(
      capturedSetPayload.ownerId,
      null,
      "DB 에 null 로 저장되어야 함",
    );
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* S4-5: player body — undefined 필드 (typescript 우회) → silent drop       */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S4-5: player body 일부 필드 undefined — undefined 필드는 $set 에서 제외", async () => {
    capturedSetPayload = null;

    // 일부 필드만 채움 — 나머지 undefined
    const body = {
      sheet: {
        quote: "Q",
        appearance: undefined,
        personality: "P",
        background: undefined,
        gender: undefined,
        age: undefined,
        height: undefined,
      },
    };

    const result = await updateCharacter(VALID_ID, body, {
      allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS,
    });
    assert.equal(result, true);

    // 채운 것만 통과
    assert.equal(capturedSetPayload["sheet.quote"], "Q");
    assert.equal(capturedSetPayload["sheet.personality"], "P");

    // undefined 는 제외
    for (const forbidden of [
      "sheet.appearance",
      "sheet.background",
      "sheet.gender",
      "sheet.age",
      "sheet.height",
    ]) {
      assert.ok(
        !(forbidden in capturedSetPayload),
        `undefined ${forbidden} 누설`,
      );
    }
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* S5-3: 라우트 응답 body — reason 노출 없음 (재현)                         */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S5-3: 라우트 권한 거부 응답 body 시뮬레이션 — reason 노출 없음", () => {
    // route.ts 의 NextResponse.json 페이로드 재현
    const sessionUser = { id: "u-other", role: "U" };
    const character = { ownerId: "u-self" };
    const decision = canEditCharacter(
      sessionUser.id,
      sessionUser.role,
      character,
    );

    // 서버 console.warn 으로만 reason 로깅 — 응답에는 미포함
    const responseBody =
      decision.mode === "none"
        ? { error: "캐릭터를 찾을 수 없습니다." }
        : { success: true };

    assert.equal(responseBody.error, "캐릭터를 찾을 수 없습니다.");
    assert.ok(
      !("reason" in responseBody),
      "응답 body 에 reason 노출 금지 (외부 oracle 차단)",
    );
    assert.ok(!("mode" in responseBody), "응답 body 에 mode 노출 금지");
    assert.ok(!("decision" in responseBody), "응답 body 에 decision 노출 금지");
  });

  test("S5-4: 미존재 캐릭터 응답 body — reason 노출 없음", () => {
    // character 가 null 이라 canEditCharacter 도 호출 안 되거나 admin 일 수 있음.
    // 라우트는 character 가 null 이면 무조건 통합 404 응답.
    const responseBody = { error: "캐릭터를 찾을 수 없습니다." };
    assert.ok(!("reason" in responseBody));
    assert.equal(responseBody.error, "캐릭터를 찾을 수 없습니다.");
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* 추가 보안: session.user.id 가 빈 문자열 / null / undefined                */
  /* ────────────────────────────────────────────────────────────────────── */

  test("보안: session.user.id 가 빈 문자열 → none/unauthenticated", () => {
    const decision = canEditCharacter("", "U", { ownerId: "" });
    assert.equal(decision.mode, "none");
    assert.equal(
      decision.reason,
      "unauthenticated",
      "빈 string id 는 falsy 가드로 unauthenticated 처리",
    );
  });

  test("보안: ownerId 가 sessionUserId 의 prefix → 매칭 안 됨", () => {
    // 사용자가 abc, ownerId 가 abcd 일 때 부분 매칭으로 player 모드로 빠지면 안 됨
    const decision = canEditCharacter("abc", "U", { ownerId: "abcd" });
    assert.equal(decision.mode, "none");
    assert.equal(decision.reason, "not-owner");
  });

  test("보안: ownerId 가 trim 차이 → 매칭 안 됨 (정확 동등)", () => {
    const decision = canEditCharacter("user1", "U", {
      ownerId: " user1",
    });
    assert.equal(decision.mode, "none", "공백 trim 등 normalize 없음");
  });

  /* ────────────────────────────────────────────────────────────────────── */
  /* S6-1: PLAYER 화이트리스트 client/server set sync (drift 회귀 보호)        */
  /*                                                                          */
  /* CharacterEditForm 은 mongodb 누수 방지로 shared-db 에서 직접 import 못 하고 */
  /* hardcoded 7 필드를 유지한다. 둘 중 한쪽만 변경되어도 silent drift 가 발생하 */
  /* 므로 본 테스트가 사이의 sync 를 강제한다.                                  */
  /* ────────────────────────────────────────────────────────────────────── */

  test("S6-1: client PLAYER_EDITABLE_FIELDS ↔ server PLAYER_ALLOWED_CHARACTER_FIELDS sync", () => {
    // CharacterEditForm 의 hardcoded 세트 미러링 (수정 시 함께 갱신).
    const CLIENT_PLAYER_EDITABLE_FIELDS = new Set([
      "quote",
      "appearance",
      "personality",
      "background",
      "gender",
      "age",
      "height",
    ]);

    // 서버 화이트리스트는 'sheet.*' prefix 형태이므로 prefix 제거 후 비교.
    const serverWithoutPrefix = new Set(
      [...PLAYER_ALLOWED_CHARACTER_FIELDS].map((f) =>
        f.replace(/^sheet\./, ""),
      ),
    );

    assert.deepEqual(
      CLIENT_PLAYER_EDITABLE_FIELDS,
      serverWithoutPrefix,
      "CharacterEditForm 의 PLAYER_EDITABLE_FIELDS 와 shared-db 의 PLAYER_ALLOWED_CHARACTER_FIELDS 가 어긋남 — 둘 중 하나만 변경되었는지 확인",
    );
  });
}
