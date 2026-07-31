/**
 * Validator 검증 — Phase 2 P2: 자동링크 타깃 빌더의 ref projection 등가성
 *
 * `buildWikiAutoLinkTargets` 에 ref projection(WikiPageRef/CharacterRef/
 * SessionReportRef/MasterItemRef) 입력을 넣었을 때 full 도큐먼트 입력과
 * **완전히 동일한 타깃 배열**이 나오는지 검증한다. 캐릭터는 각 경로의 마스킹
 * 함수(full→filterCharacterByClearance, ref→filterCharacterForLoreLinks)를
 * 통과시켜 wiki/[id] 페이지의 실제 파이프라인을 재현한다.
 *
 * 핵심 계약:
 *   W-1: 대표 픽스처(위키3/캐릭터3/리포트2/아이템2) × 등급(U/G/GM)에서
 *        old(full) === new(ref) — deepEqual
 *   W-2: 마스킹 결과 "[CLASSIFIED]" 가 자동 스캔 keywords 로 승격되지 않음
 *   W-3: 마스킹된 한글 실명이 keywords 에서 사라짐 (GM 에선 존재 — 게이트 실효 확인)
 *   W-4: currentWikiPageId 제외 동작이 ref 경로에서도 동일
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/__tests__/wiki-auto-links-ref-equivalence.test.mjs
 */

import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of extensionCandidates) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { buildWikiAutoLinkTargets } = await import("../wiki-auto-links.ts");
const { filterCharacterByClearance, filterCharacterForLoreLinks } =
  await import("../personnel.ts");

/* ── projection 시뮬레이터 (shared-db projection MIRRORS — drift 시 동기화) ── */

function pickPresent(doc, fields) {
  const out = {};
  for (const f of fields) {
    if (doc[f] !== undefined) out[f] = doc[f];
  }
  return out;
}

/** listCharacterRefs() projection */
function toCharacterRef(doc) {
  const out = pickPresent(doc, [
    "_id",
    "codename",
    "type",
    "role",
    "agentLevel",
    "department",
    "factionCode",
    "institutionCode",
    "isPublic",
    "clearanceOverrides",
  ]);
  out.lore = pickPresent(doc.lore ?? {}, [
    "name",
    "nameNative",
    "nickname",
    "nameEn",
    "appearsInEvents",
  ]);
  return out;
}

/** listWikiPageRefs() projection — content 제외가 핵심 */
function toWikiPageRef(doc) {
  return pickPresent(doc, ["_id", "slug", "title", "category", "tags", "isPublic"]);
}

/** listSessionReportRefs() projection — summary/highlights 제외 */
function toSessionReportRef(doc) {
  return pickPresent(doc, [
    "_id",
    "sessionId",
    "sessionTitle",
    "reportNumber",
    "locationLabel",
    "participants",
    "createdAt",
  ]);
}

/** listMasterItemRefs() projection — price/shopMeta 등 운영 필드 제외 */
function toMasterItemRef(doc) {
  return pickPresent(doc, [
    "_id",
    "slug",
    "name",
    "nameEn",
    "category",
    "tags",
    "description",
    "damage",
    "effect",
    "lore",
    "loreMd",
    "isPublic",
  ]);
}

/* ── 픽스처 ── */

function fullCharacters() {
  return [
    {
      _id: "char-1",
      codename: "AGENT_001",
      type: "AGENT",
      role: "operative",
      agentLevel: "G",
      isPublic: true,
      ownerId: "owner-1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      lore: {
        name: "김철수",
        nameNative: "金鐵洙",
        nickname: "스틸",
        nameEn: "Kim Cheolsu",
        gender: "male",
        age: "30",
        height: "180",
        weight: "75",
        appearance: "tall",
        personality: "calm",
        background: "ex-soldier",
        quote: "ready",
        mainImage: "/m1.png",
        loreTags: ["잠입"],
        appearsInEvents: ["S1E5"],
      },
      play: {
        className: "Operative",
        hp: 80,
        hpDelta: 0,
        san: 60,
        sanDelta: 0,
        def: 5,
        defDelta: 0,
        atk: 7,
        atkDelta: 0,
        abilityType: "강화",
        weaponTraining: [],
        skillTraining: [],
        credit: "0",
        equipment: [],
        abilities: [],
      },
    },
    {
      // identity 상향 override — G 사용자에게도 실명/nickname 마스킹
      _id: "char-2",
      codename: "ZULU-0113",
      type: "NPC",
      role: "entity",
      isPublic: true,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      clearanceOverrides: { identity: "V" },
      lore: {
        name: "박은별",
        nickname: "은별",
        gender: "female",
        age: "??",
        height: "??",
        weight: "??",
        appearance: "..",
        personality: "..",
        background: "..",
        quote: "..",
        mainImage: "/m2.png",
      },
    },
    {
      // 짧은 한글 이름 (allowShortHangul: personnel 은 2자 허용)
      _id: "char-3",
      codename: "NPC_ARA",
      type: "NPC",
      role: "broker",
      isPublic: true,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      lore: {
        name: "아라",
        gender: "female",
        age: "40",
        height: "165",
        weight: "55",
        appearance: "..",
        personality: "..",
        background: "..",
        quote: "..",
        mainImage: "/m3.png",
      },
    },
  ];
}

function fullWikiPages() {
  return [
    {
      _id: "wiki-1",
      slug: "zulu-0113",
      title: "줄루-0113 격리 절차",
      category: "줄루",
      tags: ["ZULU-0113", "격리"],
      content: "본문 — 자동링크 타깃 빌더는 content 를 읽지 않는다. S9E9 노이즈.",
      isPublic: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      _id: "wiki-2",
      slug: "novus-hq",
      title: "본부 통제 구역",
      category: "장소",
      tags: ["일반태그"],
      content: "관련 세션: S1E5",
      isPublic: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      _id: "wiki-current",
      slug: "self-page",
      title: "현재 페이지 자신",
      category: "개념",
      tags: [],
      content: "self",
      isPublic: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
  ];
}

function fullReports() {
  return [
    {
      _id: "report-1",
      sessionId: "NOSB-S1E5",
      sessionTitle: "작전 기록 잿빛 새벽",
      reportNumber: 5,
      locationLabel: "구역 7",
      participants: ["김철수", "아라"],
      summary: "요약 — ref 에서 제외되는 본문성 필드",
      highlights: ["하이라이트"],
      createdAt: new Date("2026-03-01T00:00:00Z"),
      updatedAt: new Date("2026-03-02T00:00:00Z"),
    },
    {
      _id: "report-2",
      sessionId: "NOSB-S1E2",
      sessionTitle: "세션 리포트 흰 소음",
      locationLabel: "구역 2",
      participants: ["박은별"],
      summary: "요약2",
      highlights: [],
      createdAt: new Date("2026-02-01T00:00:00Z"),
      updatedAt: new Date("2026-02-02T00:00:00Z"),
    },
  ];
}

function fullItems() {
  return [
    {
      _id: "item-1",
      slug: "pulse-rifle",
      name: "펄스 라이플",
      nameEn: "Pulse Rifle",
      category: "WEAPON",
      tags: ["NOSB-S1E2", "일반"],
      description: "S1E2 회수 장비",
      damage: "2d6",
      effect: "관통",
      lore: "…",
      loreMd: "…",
      isPublic: true,
      isAvailable: true,
      price: 1200,
      shopMeta: { stock: 3 },
      previewImage: "/i1.png",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      _id: "item-2",
      name: "위장 키트",
      category: "GEAR",
      tags: [],
      description: "표준 위장",
      isPublic: true,
      isAvailable: true,
      price: 300,
      shopMeta: { stock: 9 },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
  ];
}

function buildOldTargets(clearance, currentWikiPageId) {
  return buildWikiAutoLinkTargets({
    catalogItems: fullItems(),
    characters: fullCharacters().map((c) =>
      filterCharacterByClearance(c, clearance),
    ),
    currentWikiPageId,
    reports: fullReports(),
    wikiPages: fullWikiPages(),
  });
}

function buildNewTargets(clearance, currentWikiPageId) {
  return buildWikiAutoLinkTargets({
    catalogItems: fullItems().map(toMasterItemRef),
    characters: fullCharacters()
      .map(toCharacterRef)
      .map((c) => filterCharacterForLoreLinks(c, clearance)),
    currentWikiPageId,
    reports: fullReports().map(toSessionReportRef),
    wikiPages: fullWikiPages().map(toWikiPageRef),
  });
}

/* ── 테스트 ── */

test("W-1: full 입력과 ref projection 입력의 타깃 배열 완전 동일 (U/G/GM)", () => {
  for (const clearance of ["U", "G", "GM"]) {
    const oldTargets = buildOldTargets(clearance, "wiki-current");
    const newTargets = buildNewTargets(clearance, "wiki-current");
    assert.deepEqual(
      newTargets,
      oldTargets,
      `clearance=${clearance} 에서 타깃 불일치`,
    );
    assert.ok(oldTargets.length > 0, "타깃이 비어 있으면 등가성 검증 무의미");
  }
});

test("W-2: '[CLASSIFIED]' 는 자동 스캔 keywords 로 승격되지 않음 (전 등급)", () => {
  for (const clearance of ["U", "J", "G", "M", "V", "GM"]) {
    const targets = buildNewTargets(clearance, undefined);
    for (const target of targets) {
      assert.ok(
        !target.keywords.some((k) => k.toUpperCase() === "[CLASSIFIED]"),
        `clearance=${clearance} ${target.href} keywords 에 [CLASSIFIED] 존재: ${JSON.stringify(target.keywords)}`,
      );
    }
  }
});

test("W-3: 마스킹 게이트 실효 — U 에선 실명 keyword 부재, GM 에선 존재", () => {
  const uTargets = buildNewTargets("U", undefined);
  const gmTargets = buildNewTargets("GM", undefined);

  const uChar1 = uTargets.find((t) => t.href === "/erp/personnel/char-1");
  const gmChar1 = gmTargets.find((t) => t.href === "/erp/personnel/char-1");
  assert.ok(uChar1 && gmChar1, "char-1 타깃 존재");
  assert.ok(!uChar1.keywords.includes("김철수"), "U 등급에 실명 keyword 노출");
  assert.ok(gmChar1.keywords.includes("김철수"), "GM 에선 실명 keyword 존재해야 함");

  // override 상향 캐릭터 (identity V): G 등급에서도 nickname/실명 마스킹
  const gTargets = buildNewTargets("G", undefined);
  const gChar2 = gTargets.find((t) => t.href === "/erp/personnel/char-2");
  assert.ok(gChar2, "char-2 타깃 존재 (codename 은 항상 노출)");
  assert.ok(
    !gChar2.keywords.includes("박은별") && !gChar2.keywords.includes("은별"),
    `override 캐릭터의 실명/nickname 이 G 등급 keywords 에 노출: ${JSON.stringify(gChar2.keywords)}`,
  );
  assert.ok(gChar2.keywords.includes("ZULU-0113"), "codename 은 유지");

  // full 경로도 동일해야 함 (등가성 재확인)
  const gOld = buildOldTargets("G", undefined);
  assert.deepEqual(gChar2, gOld.find((t) => t.href === "/erp/personnel/char-2"));
});

test("W-4: currentWikiPageId 제외가 ref 경로에서도 동일", () => {
  const withCurrent = buildNewTargets("GM", "wiki-current");
  const withoutCurrent = buildNewTargets("GM", undefined);

  assert.ok(
    !withCurrent.some((t) => t.href === "/erp/wiki/wiki-current"),
    "current 페이지가 타깃에서 제외되어야 함",
  );
  assert.ok(
    withoutCurrent.some((t) => t.href === "/erp/wiki/wiki-current"),
    "currentWikiPageId 미지정 시 포함되어야 함",
  );
});

test("W-5: 짧은 한글 실명(2자) personnel 허용 경로도 등가 (allowShortHangul)", () => {
  const gm = buildNewTargets("GM", undefined);
  const ara = gm.find((t) => t.href === "/erp/personnel/char-3");
  assert.ok(ara, "char-3 타깃 존재");
  assert.ok(ara.keywords.includes("아라"), "2자 한글 이름은 personnel 타깃에서 keyword 허용");
  assert.deepEqual(
    ara,
    buildOldTargets("GM", undefined).find((t) => t.href === "/erp/personnel/char-3"),
  );
});
