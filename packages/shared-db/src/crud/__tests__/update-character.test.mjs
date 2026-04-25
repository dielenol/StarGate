/**
 * P1 검증 — S1/S2/S3: updateCharacter dot path 화이트리스트 보안
 *
 * 목적:
 *   - S1: 플레이어 자가편집 경로(PLAYER_ALLOWED_CHARACTER_FIELDS)에서 sheet 통째 입력이
 *         들어와도 $set에 'sheet' 루트 키가 누설되지 않음 (능력치 덮어쓰기 차단)
 *   - S2: allowedFields 미지정 시 ADMIN_ALLOWED_CHARACTER_FIELDS 디폴트 적용
 *         → 기존 (P1 이전) 호출처 무영향
 *   - S3: PLAYER_ALLOWED_CHARACTER_FIELDS 형상 검증
 *         이미지 3종 / 능력치 4종 / 식별 4종 미포함, 7개 필드만 정확히 포함
 *
 * 실행 방식:
 *   - charactersCol을 mock으로 교체해 updateOne($set 페이로드)를 캡처
 *   - 실제 DB 의존성 없음. node --test 만으로 실행
 *
 * Node 24+의 --experimental-test-module-mocks 플래그 사용.
 * 미지원 환경에서는 skip 처리.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ObjectId } from "mongodb";

/* ── mock.module 가용성 체크 ── */
const testApi = await import("node:test");
const HAS_MODULE_MOCK =
  testApi.mock && typeof testApi.mock.module === "function";

if (!HAS_MODULE_MOCK) {
  test("S1/S2/S3: updateCharacter mock 테스트 — module mock 미지원", { skip: true }, () => {});
} else {
  // node:test의 mock.module은 ESM 그래프에 hook을 걸어 import 결과를 가로챈다.
  // CommonJS와 달리 import.meta 시점에 결정되므로, 테스트 파일 최상단에서
  // 호출해야 후속 import가 mock된 모듈을 받는다.
  let capturedSetPayload = null;
  let capturedFilter = null;

  const fakeUpdateOne = async (filter, doc) => {
    capturedFilter = filter;
    // doc의 형태: { $set: { ...sanitized, updatedAt: Date } }
    capturedSetPayload = doc.$set;
    return { modifiedCount: 1, matchedCount: 1, acknowledged: true };
  };

  const fakeCol = {
    updateOne: fakeUpdateOne,
  };

  // mock.module: collections.js의 charactersCol export를 fake로 교체
  testApi.mock.module(
    new URL("../../../dist/collections.js", import.meta.url).href,
    {
      namedExports: {
        charactersCol: async () => fakeCol,
      },
    }
  );

  // mock 등록 후 import — 이 import는 mocked collections.js를 사용한다
  const charactersModule = await import("../../../dist/crud/characters.js");
  const {
    updateCharacter,
    PLAYER_ALLOWED_CHARACTER_FIELDS,
    ADMIN_ALLOWED_CHARACTER_FIELDS,
    ALLOWED_CHARACTER_FIELDS,
  } = charactersModule;

  const VALID_ID = new ObjectId().toHexString();

  /* ── S3: PLAYER_ALLOWED_CHARACTER_FIELDS 형상 검증 ── */

  test("S3: PLAYER_ALLOWED_CHARACTER_FIELDS — 정확히 7개 필드만 포함", () => {
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
      `의도와 다른 필드 수: ${[...PLAYER_ALLOWED_CHARACTER_FIELDS].join(",")}`
    );
    for (const field of expected) {
      assert.ok(
        PLAYER_ALLOWED_CHARACTER_FIELDS.has(field),
        `누락된 필드: ${field}`
      );
    }
  });

  test("S3: PLAYER_ALLOWED — 이미지 필드 3종 (previewImage, sheet.mainImage, sheet.posterImage) 미포함", () => {
    for (const forbidden of [
      "previewImage",
      "sheet.mainImage",
      "sheet.posterImage",
      "pixelCharacterImage",
      "warningVideo",
    ]) {
      assert.ok(
        !PLAYER_ALLOWED_CHARACTER_FIELDS.has(forbidden),
        `이미지 필드 ${forbidden}가 PLAYER_ALLOWED에 포함됨 — 자가편집 경로에서 이미지 변경이 가능해짐`
      );
    }
  });

  test("S3: PLAYER_ALLOWED — 능력치 필드 4종 미포함", () => {
    for (const forbidden of [
      "sheet.hp",
      "sheet.atk",
      "sheet.def",
      "sheet.san",
    ]) {
      assert.ok(
        !PLAYER_ALLOWED_CHARACTER_FIELDS.has(forbidden),
        `능력치 ${forbidden}가 PLAYER_ALLOWED에 포함됨 — 자가편집 경로에서 스탯 조작 가능`
      );
    }
  });

  test("S3: PLAYER_ALLOWED — 식별/권한 필드 미포함 (codename/role/agentLevel/class/ownerId)", () => {
    for (const forbidden of [
      "codename",
      "role",
      "agentLevel",
      "class",
      "ownerId",
      "isPublic",
      "factionCode",
      "institutionCode",
      "department",
      "type",
    ]) {
      assert.ok(
        !PLAYER_ALLOWED_CHARACTER_FIELDS.has(forbidden),
        `식별 필드 ${forbidden}가 PLAYER_ALLOWED에 포함됨`
      );
    }
  });

  test("S3: PLAYER_ALLOWED — 'sheet' 루트 키 자체는 미포함 (전체 덮어쓰기 차단)", () => {
    assert.ok(
      !PLAYER_ALLOWED_CHARACTER_FIELDS.has("sheet"),
      "PLAYER_ALLOWED에 'sheet' 루트 키가 포함되면 sheet 전체가 $set으로 덮어써져 능력치 손실"
    );
  });

  /* ── S1: sheet 덮어쓰기 차단 (보안 핵심) ── */

  test("S1: PLAYER 화이트리스트 + sheet 통째 입력 — 'sheet' 루트 키가 $set에 누설되지 않음", async () => {
    capturedSetPayload = null;
    capturedFilter = null;

    // 악성/실수 입력: sheet 통째를 새 객체로 던짐 (능력치 덮어쓰기 시도)
    const result = await updateCharacter(
      VALID_ID,
      {
        sheet: {
          hp: 0,
          san: 0,
          def: 0,
          atk: 999,
          quote: "악의의 견적",
          appearance: "악의 외형",
          // 능력치 필드도 sheet 안에 같이 넣어서 시도
          codename: "HACKED",
          mainImage: "/evil.png",
          posterImage: "/evil-wide.png",
        },
      },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );

    assert.equal(result, true, "updateCharacter 성공 반환");
    assert.ok(capturedSetPayload, "$set 페이로드가 캡처되어야 함");

    // 1) 루트 키 'sheet' 가 절대 $set에 들어가면 안 됨
    assert.ok(
      !("sheet" in capturedSetPayload),
      `$set에 'sheet' 루트 키가 누설됨. 키 목록: ${Object.keys(capturedSetPayload).join(",")}`
    );

    // 2) PLAYER_ALLOWED에 있는 dot path만 통과해야 함
    assert.equal(
      capturedSetPayload["sheet.quote"],
      "악의의 견적",
      "sheet.quote는 dot path로 정상 통과"
    );
    assert.equal(
      capturedSetPayload["sheet.appearance"],
      "악의 외형",
      "sheet.appearance는 dot path로 정상 통과"
    );

    // 3) 능력치 dot path는 PLAYER_ALLOWED에 없으므로 절대 누설되지 않음
    for (const stat of ["sheet.hp", "sheet.atk", "sheet.def", "sheet.san"]) {
      assert.ok(
        !(stat in capturedSetPayload),
        `${stat}이 $set에 누설됨 — 능력치 덮어쓰기 차단 실패`
      );
    }

    // 4) 이미지 dot path도 누설되지 않음
    for (const img of ["sheet.mainImage", "sheet.posterImage"]) {
      assert.ok(
        !(img in capturedSetPayload),
        `${img}이 $set에 누설됨 — 이미지 변경 차단 실패`
      );
    }

    // 5) 식별 필드(codename)도 누설되지 않음 (sheet 내부 codename 시도 차단)
    assert.ok(
      !("codename" in capturedSetPayload),
      "sheet 내부의 codename이 루트 codename으로 승격되어 누설되면 안 됨"
    );

    // 6) updatedAt만 추가로 들어감
    assert.ok(
      capturedSetPayload.updatedAt instanceof Date,
      "updatedAt이 자동 주입되어야 함"
    );
  });

  test("S1: PLAYER 화이트리스트 + 루트 codename/role 시도 — silent drop", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(
      VALID_ID,
      {
        codename: "HACKED",
        role: "관리자",
        agentLevel: "GM",
        ownerId: "evil-user-id",
        isPublic: true,
        sheet: { quote: "정상 변경" },
      },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );

    assert.equal(result, true);
    assert.ok(capturedSetPayload);

    // sheet.quote만 통과
    assert.equal(capturedSetPayload["sheet.quote"], "정상 변경");

    // 식별/권한 필드는 모두 silent drop
    for (const forbidden of ["codename", "role", "agentLevel", "ownerId", "isPublic"]) {
      assert.ok(
        !(forbidden in capturedSetPayload),
        `${forbidden}이 $set에 누설됨`
      );
    }
  });

  test("S1: PLAYER 화이트리스트 + sheet 자체 누락(undefined) — 다른 dot path도 모두 silent drop", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(
      VALID_ID,
      {
        // sheet 객체 자체가 없음 — 모든 sheet.* dot path는 undefined로 drop
        codename: "X",
      },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );

    // 빈 패치이므로 false 반환 (early return)
    assert.equal(
      result,
      false,
      "허용 필드 입력이 모두 undefined면 updateOne 호출 없이 false"
    );
    assert.equal(
      capturedSetPayload,
      null,
      "허용 필드가 비어 있으면 updateOne이 호출되지 않아야 함"
    );
  });

  test("S1: PLAYER 화이트리스트 + sheet null/typeof != object — silent drop, $set 비어 false", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(
      VALID_ID,
      { sheet: null },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );
    assert.equal(result, false);
    assert.equal(capturedSetPayload, null);

    capturedSetPayload = null;
    const result2 = await updateCharacter(
      VALID_ID,
      { sheet: "not an object" },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );
    assert.equal(result2, false);
    assert.equal(capturedSetPayload, null);
  });

  test("S1: PLAYER 화이트리스트 + 일부 dot path만 채움 — 채워진 것만 $set에 포함", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(
      VALID_ID,
      {
        sheet: {
          quote: "Q",
          age: "32",
          // appearance/personality/background/gender/height는 미포함
        },
      },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );

    assert.equal(result, true);
    const keys = Object.keys(capturedSetPayload).filter(
      (k) => k !== "updatedAt"
    );
    assert.deepEqual(
      new Set(keys),
      new Set(["sheet.quote", "sheet.age"]),
      "채워진 dot path만 $set에 포함 (undefined 필드는 제외)"
    );
  });

  /* ── S2: allowedFields 미지정 시 ADMIN 디폴트 ── */

  test("S2: allowedFields 미지정 → ADMIN 디폴트 적용", async () => {
    capturedSetPayload = null;

    // sheet 통째 + 다른 ADMIN 허용 필드들 — ADMIN 모드에서는 다 통과
    const result = await updateCharacter(VALID_ID, {
      codename: "AGENT_NEW",
      role: "field",
      agentLevel: "G",
      sheet: { hp: 100, san: 80, def: 5, atk: 7, quote: "정상" },
      isPublic: true,
      loreTags: ["test"],
    });

    assert.equal(result, true);
    assert.ok(capturedSetPayload);

    // ADMIN 경로에서는 'sheet' 루트 키가 통째로 들어감 (의도된 동작)
    assert.deepEqual(
      capturedSetPayload.sheet,
      { hp: 100, san: 80, def: 5, atk: 7, quote: "정상" },
      "ADMIN 디폴트에서는 sheet 루트 키가 통째로 $set에 포함되어야 함 (기존 동작)"
    );
    assert.equal(capturedSetPayload.codename, "AGENT_NEW");
    assert.equal(capturedSetPayload.role, "field");
    assert.equal(capturedSetPayload.agentLevel, "G");
    assert.equal(capturedSetPayload.isPublic, true);
    assert.deepEqual(capturedSetPayload.loreTags, ["test"]);
  });

  test("S2: ADMIN_ALLOWED_CHARACTER_FIELDS === ALLOWED_CHARACTER_FIELDS (별칭)", () => {
    assert.equal(
      ADMIN_ALLOWED_CHARACTER_FIELDS,
      ALLOWED_CHARACTER_FIELDS,
      "ADMIN_ALLOWED_CHARACTER_FIELDS는 ALLOWED_CHARACTER_FIELDS의 별칭이어야 함 (기존 호출처 무수정)"
    );
  });

  test("S2: ADMIN 디폴트는 'sheet' 루트 키 포함 (PLAYER와 대조)", () => {
    assert.ok(
      ADMIN_ALLOWED_CHARACTER_FIELDS.has("sheet"),
      "ADMIN 디폴트는 sheet 루트 키를 포함 (전체 교체 의도)"
    );
    assert.ok(
      !PLAYER_ALLOWED_CHARACTER_FIELDS.has("sheet"),
      "PLAYER는 sheet 루트 키를 미포함 (부분 업데이트만 허용)"
    );
  });

  test("S2: ADMIN 디폴트 — 허용 외 필드는 silent drop", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(VALID_ID, {
      codename: "VALID",
      randomEvilField: "should-be-dropped",
      __proto__: { polluted: true },
    });

    assert.equal(result, true);
    assert.equal(capturedSetPayload.codename, "VALID");
    assert.ok(
      !("randomEvilField" in capturedSetPayload),
      "허용 외 필드는 silent drop"
    );
    // __proto__는 객체 키 순회 특성상 자연 제외 — 별도 체크
    assert.ok(
      !("polluted" in capturedSetPayload),
      "__proto__ 인젝션도 누설 차단"
    );
  });

  /* ── 경계 ── */

  test("경계: 잘못된 ObjectId — 즉시 false, DB 호출 없음", async () => {
    capturedSetPayload = null;
    capturedFilter = null;

    const result = await updateCharacter("not-a-valid-id", { codename: "X" });
    assert.equal(result, false);
    assert.equal(
      capturedSetPayload,
      null,
      "잘못된 id면 charactersCol().updateOne 호출되면 안 됨"
    );
    assert.equal(capturedFilter, null);
  });

  test("경계: 빈 update 객체 — false, DB 호출 없음", async () => {
    capturedSetPayload = null;
    capturedFilter = null;

    const result = await updateCharacter(VALID_ID, {});
    assert.equal(result, false);
    assert.equal(
      capturedSetPayload,
      null,
      "허용 필드 0건이면 updateOne 호출되면 안 됨"
    );
  });

  test("경계: 빈 update 객체 + PLAYER 화이트리스트 — false", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(
      VALID_ID,
      {},
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );
    assert.equal(result, false);
    assert.equal(capturedSetPayload, null);
  });

  test("경계: undefined 값은 $set에서 제외", async () => {
    capturedSetPayload = null;

    const result = await updateCharacter(VALID_ID, {
      codename: "VALID",
      role: undefined,
      agentLevel: undefined,
    });

    assert.equal(result, true);
    assert.equal(capturedSetPayload.codename, "VALID");
    assert.ok(
      !("role" in capturedSetPayload),
      "undefined 값은 $set 패치에서 제외"
    );
    assert.ok(!("agentLevel" in capturedSetPayload));
  });

  /* ── 보안 — 프로토타입 오염 방어 ── */

  test("보안: JSON.parse 경로 — __proto__ 키는 own property로 처리되어 codename 누설 없음", async () => {
    capturedSetPayload = null;

    // 실제 HTTP API에서 들어올 형태: JSON.parse로 만든 객체
    const evil = JSON.parse(
      '{"__proto__":{"codename":"HACKED","role":"GM"},"isPublic":true}'
    );
    const result = await updateCharacter(VALID_ID, evil);

    assert.equal(result, true);
    assert.ok(
      !("codename" in capturedSetPayload),
      "JSON.parse 경로에서 __proto__를 통한 codename 누설 없음"
    );
    assert.ok(!("role" in capturedSetPayload));
    assert.equal(capturedSetPayload.isPublic, true, "isPublic은 정상 통과");
  });

  test("보안: PLAYER 경로 — input.sheet가 Date/Array일 때 silent drop, 크래시 없음", async () => {
    // input.sheet가 Date 객체
    capturedSetPayload = null;
    const result1 = await updateCharacter(
      VALID_ID,
      { sheet: new Date() },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );
    assert.equal(result1, false, "Date 객체에서 sheet.quote 등이 추출되지 않아 빈 패치 → false");
    assert.equal(capturedSetPayload, null);

    // input.sheet가 Array
    capturedSetPayload = null;
    const result2 = await updateCharacter(
      VALID_ID,
      { sheet: ["array", "values"] },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );
    // Array는 typeof === "object"이고 정수 인덱스로만 접근됨 → quote 등 키는 undefined
    assert.equal(result2, false);
    assert.equal(capturedSetPayload, null);

    // input.sheet가 Map (typeof object지만 [seg] 접근으로는 빈 값)
    capturedSetPayload = null;
    const m = new Map([["quote", "no-leak"]]);
    const result3 = await updateCharacter(
      VALID_ID,
      { sheet: m },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );
    assert.equal(result3, false, "Map은 bracket 접근으로 quote 키를 노출하지 않음");
    assert.equal(capturedSetPayload, null);
  });

  test("보안: PLAYER 경로 — sheet 내부 dot path 시도 직접 (sheet의 단순 prototype) 차단", async () => {
    capturedSetPayload = null;

    // 깊은 dot path가 포함된 잘못된 입력 — getPathValue는 segments=[seg]로 split하므로
    // PLAYER_ALLOWED에 없는 dot path는 애초에 루프 진입 안 함
    const result = await updateCharacter(
      VALID_ID,
      {
        "sheet.hp": 999,
        "sheet.atk": 999,
        sheet: { quote: "정상" },
      },
      { allowedFields: PLAYER_ALLOWED_CHARACTER_FIELDS }
    );

    assert.equal(result, true);
    // PLAYER 화이트리스트에 없는 dot key는 input의 top-level에 있어도 무시
    assert.ok(
      !("sheet.hp" in capturedSetPayload),
      "input top-level의 'sheet.hp' 키는 PLAYER 화이트리스트에 없어 silent drop"
    );
    assert.ok(!("sheet.atk" in capturedSetPayload));
    // sheet.quote만 정상 통과
    assert.equal(capturedSetPayload["sheet.quote"], "정상");
  });
}
