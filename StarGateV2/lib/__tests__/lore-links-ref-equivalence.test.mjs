/**
 * Validator 검증 — Phase 2 P2/P3: 연관 매칭의 ref projection 등가성 + full 유지 근거
 *
 * 1) `relatedReportsForWiki` / `relatedPersonnelForReport(s)` / catalog 연관 매칭이
 *    ref projection 입력으로 full 입력과 동일한 결과를 내는지 (매칭 신호 필드가
 *    projection 에 모두 살아있는지) 검증.
 * 2) `relatedWikiForReport` 가 위키 **본문(content)** 을 실제로 읽는지 입증 —
 *    sessions/report/[id] 가 위키만 full 로 유지한 결정의 코드 근거.
 *
 * 핵심 계약:
 *   L-1: relatedWikiForReport — content 에만 있는 매칭 신호("관련 세션: SxEy",
 *        exact key)가 실제로 매칭을 만든다 (content 제거 시 매칭 소실)
 *   L-2: relatedReportsForWiki — SessionReportRef 입력 === full 입력
 *   L-3: relatedPersonnelForReport/relatedPersonnelForReports —
 *        CharacterRef+마스킹 입력 === full+마스킹 입력 (appearsInEvents 매칭 포함)
 *   L-4: 마스킹된 캐릭터의 연관 인물 카드 name 이 "[CLASSIFIED]" 로 유지 (실명 비노출)
 *   L-5: relatedCatalogItemsForReport/ForWiki — MasterItemRef 입력 === full 입력
 *
 * 실행:
 *   cd StarGateV2 && node --test lib/__tests__/lore-links-ref-equivalence.test.mjs
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

const {
  relatedWikiForReport,
  relatedReportsForWiki,
  relatedPersonnelForReport,
  relatedPersonnelForReports,
  toRelatedReportLink,
} = await import("../lore-links.ts");
const {
  relatedCatalogItemsForReport,
  relatedCatalogItemsForWiki,
  relatedReportsForCatalogItem,
} = await import("../catalog/related.ts");
const { filterCharacterByClearance, filterCharacterForLoreLinks } =
  await import("../personnel.ts");

/* ── projection 시뮬레이터 (shared-db projection MIRRORS) ── */

function pickPresent(doc, fields) {
  const out = {};
  for (const f of fields) {
    if (doc[f] !== undefined) out[f] = doc[f];
  }
  return out;
}

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

function toSessionReportRef(doc) {
  return pickPresent(doc, [
    "_id",
    "sessionId",
    "sessionTitle",
    "reportNumber",
    "locationLabel",
    "participants",
    "relatedCatalogSlugs",
    "relatedPersonnelCodenames",
    "relatedWikiSlugs",
    "createdAt",
  ]);
}

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

function makeReport(overrides = {}) {
  return {
    _id: "report-1",
    sessionId: "NOSB-S1E5",
    sessionTitle: "작전 기록 잿빛 새벽",
    locationLabel: "구역 7",
    participants: ["김철수(스틸)", "은별"],
    summary: "요약 본문",
    highlights: ["h1"],
    createdAt: new Date("2026-03-01T00:00:00Z"),
    updatedAt: new Date("2026-03-01T00:00:00Z"),
    ...overrides,
  };
}

function makeWikiPage(overrides = {}) {
  return {
    _id: "wiki-1",
    slug: "sector-7",
    title: "구역 7 통제소",
    category: "장소",
    tags: [],
    content: "일반 설명 문단.",
    isPublic: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeCharacters() {
  return [
    {
      // participants 문자열 매칭으로 걸리는 AGENT
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
        nickname: "스틸",
        gender: "male",
        age: "30",
        height: "180",
        weight: "75",
        appearance: "tall",
        personality: "calm",
        background: "ex-soldier",
        quote: "ready",
        mainImage: "/m1.png",
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
      // participants 로는 안 걸리고 appearsInEvents 로만 걸리는 NPC —
      // projection 이 appearsInEvents 를 빠뜨리면 이 캐릭터가 연관 목록에서 사라진다
      _id: "char-2",
      codename: "NPC_GHOST",
      type: "NPC",
      role: "observer",
      isPublic: true,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      lore: {
        name: "유령감시자",
        gender: "?",
        age: "?",
        height: "?",
        weight: "?",
        appearance: "..",
        personality: "..",
        background: "..",
        quote: "..",
        mainImage: "/m2.png",
        appearsInEvents: ["NOSB-S1E5"],
      },
    },
    {
      // 어떤 신호로도 안 걸리는 대조군
      _id: "char-3",
      codename: "NPC_FAR",
      type: "NPC",
      role: "merchant",
      isPublic: true,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      lore: {
        name: "무관자",
        gender: "?",
        age: "?",
        height: "?",
        weight: "?",
        appearance: "..",
        personality: "..",
        background: "..",
        quote: "..",
        mainImage: "/m3.png",
      },
    },
  ];
}

function makeItems() {
  return [
    {
      _id: "item-1",
      slug: "pulse-rifle",
      name: "펄스 라이플",
      nameEn: "Pulse Rifle",
      category: "WEAPON",
      tags: [],
      description: "NOSB-S1E5 작전에서 회수",
      damage: "2d6",
      effect: "관통",
      isPublic: true,
      isAvailable: true,
      price: 1200,
      shopMeta: { stock: 3 },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      _id: "item-2",
      slug: "camo-kit",
      name: "위장 키트",
      category: "GEAR",
      tags: [],
      description: "표준 위장",
      isPublic: true,
      isAvailable: true,
      price: 300,
      shopMeta: { stock: 9 },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ];
}

/* ── L-1: relatedWikiForReport 의 content 의존성 입증 ── */

test("L-1: content 에만 있는 신호로 위키가 매칭됨 — full 유지 결정의 근거", () => {
  const report = makeReport();

  // (a) 완화 키 경로: content 의 "관련 세션: S1E5" 마커로만 매칭
  const contentOnlyPage = makeWikiPage({
    _id: "wiki-content-only",
    title: "신호 없는 제목",
    tags: [],
    content: "긴 본문… 관련 세션: S1E5 …",
  });
  // (b) exact 키 경로: content 의 NOSB-S1E5 전체 코드로만 매칭
  const exactContentPage = makeWikiPage({
    _id: "wiki-exact-content",
    title: "다른 제목",
    tags: [],
    content: "각주: NOSB-S1E5 참조",
  });
  const noSignalPage = makeWikiPage({
    _id: "wiki-none",
    title: "무관 문서",
    tags: [],
    content: "아무 신호 없음",
  });

  const matched = relatedWikiForReport(report, [
    contentOnlyPage,
    exactContentPage,
    noSignalPage,
  ]);
  const ids = matched.map((l) => l.id);
  assert.ok(ids.includes("wiki-exact-content"), "content 의 exact 세션 코드 매칭 실패");
  assert.ok(!ids.includes("wiki-none"), "무신호 문서가 매칭됨");

  // content 를 비우면 exact 매칭이 사라진다 → content 가 실제 매칭 참여 증거
  const stripped = relatedWikiForReport(report, [
    { ...exactContentPage, content: "" },
    noSignalPage,
  ]);
  assert.equal(
    stripped.length,
    0,
    "content 제거 후에도 매칭됨 — content 의존이 아니라면 ref 전환 가능했음",
  );

  // 완화 키 마커("관련 세션: SxEy") 경로 — exact 키 없는 리포트에서 검증
  const softReport = makeReport({
    _id: "report-soft",
    sessionId: "S1E5",
    sessionTitle: "작전 기록 잿빛 새벽",
  });
  const softMatched = relatedWikiForReport(softReport, [
    contentOnlyPage,
    noSignalPage,
  ]);
  assert.deepEqual(
    softMatched.map((l) => l.id),
    ["wiki-content-only"],
    "content 의 '관련 세션:' 마커 매칭 실패",
  );
});

/* ── L-2: relatedReportsForWiki — ref 등가성 ── */

test("L-2: relatedReportsForWiki — SessionReportRef 입력 === full 입력", () => {
  const page = makeWikiPage({
    title: "작전 보고서 잿빛 새벽",
    content: "관련 세션: S1E5 / NOSB-S1E2 언급",
    tags: ["S1E9"],
  });
  const reports = [
    makeReport(),
    makeReport({
      _id: "report-2",
      sessionId: "NOSB-S1E2",
      sessionTitle: "세션 리포트 흰 소음",
      participants: ["박은별"],
      createdAt: new Date("2026-02-01T00:00:00Z"),
    }),
    makeReport({
      _id: "report-3",
      sessionId: "NOSB-S3E1",
      sessionTitle: "무관 세션",
      participants: [],
      createdAt: new Date("2026-01-15T00:00:00Z"),
    }),
  ];

  const fullResult = relatedReportsForWiki(page, reports);
  const refResult = relatedReportsForWiki(page, reports.map(toSessionReportRef));

  assert.deepEqual(refResult, fullResult);
  assert.ok(fullResult.length > 0, "매칭 0건이면 등가성 검증 무의미");
});

/* ── L-3/L-4: 연관 인물 — ref+마스킹 등가성 ── */

test("L-3: relatedPersonnelForReport — CharacterRef+마스킹 === full+마스킹 (appearsInEvents 포함)", () => {
  const report = makeReport();
  const chars = makeCharacters();

  for (const clearance of ["U", "G", "GM"]) {
    const fullResult = relatedPersonnelForReport(
      report,
      chars.map((c) => filterCharacterByClearance(c, clearance)),
    );
    const refResult = relatedPersonnelForReport(
      report,
      chars.map(toCharacterRef).map((c) => filterCharacterForLoreLinks(c, clearance)),
    );
    assert.deepEqual(refResult, fullResult, `clearance=${clearance}`);

    const ids = refResult.map((p) => p.id);
    assert.ok(ids.includes("char-1"), "participants 매칭 캐릭터 누락");
    assert.ok(
      ids.includes("char-2"),
      "appearsInEvents 로만 걸리는 캐릭터 누락 — projection 에서 신호 소실",
    );
    assert.ok(!ids.includes("char-3"), "무관 캐릭터가 연관 목록에 포함");
  }
});

test("L-3b: relatedPersonnelForReports (위키 상세 경로) — ref 등가 + dedupe 보존", () => {
  const chars = makeCharacters();
  const links = [
    toRelatedReportLink(toSessionReportRef(makeReport())),
    toRelatedReportLink(toSessionReportRef(makeReport({ _id: "report-dup" }))),
  ];

  for (const clearance of ["U", "GM"]) {
    const fullResult = relatedPersonnelForReports(
      links,
      chars.map((c) => filterCharacterByClearance(c, clearance)),
    );
    const refResult = relatedPersonnelForReports(
      links,
      chars.map(toCharacterRef).map((c) => filterCharacterForLoreLinks(c, clearance)),
    );
    assert.deepEqual(refResult, fullResult, `clearance=${clearance}`);

    // 같은 캐릭터가 두 리포트에 걸려도 1회만 (dedupe)
    const ids = refResult.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "dedupe 붕괴");
  }
});

test("L-4: 마스킹된 캐릭터의 연관 인물 카드 — 실명 대신 [CLASSIFIED] 유지", () => {
  const chars = makeCharacters();

  // (a) 실명만으로는 U 등급에서 매칭 자체가 안 됨 — 마스킹이 매칭 전에 적용되는
  //     기존 시맨틱(oracle 차단)이 ref 경로에서도 동일함을 고정
  const nameOnlyReport = makeReport({ participants: ["김철수"] });
  const nameOnlyFull = relatedPersonnelForReport(
    nameOnlyReport,
    chars.map((c) => filterCharacterByClearance(c, "U")),
  );
  const nameOnlyRef = relatedPersonnelForReport(
    nameOnlyReport,
    chars.map(toCharacterRef).map((c) => filterCharacterForLoreLinks(c, "U")),
  );
  assert.deepEqual(nameOnlyRef, nameOnlyFull);
  assert.ok(
    !nameOnlyRef.some((p) => p.id === "char-1"),
    "U 등급에서 실명 매칭이 살아 있음 — 마스킹 전 데이터로 매칭된 것 (oracle 누출)",
  );

  // (b) nickname(identity 그룹, U 노출)으로 매칭된 경우 — 카드 name 은 [CLASSIFIED]
  const nicknameReport = makeReport({ participants: ["스틸"] });
  const refResult = relatedPersonnelForReport(
    nicknameReport,
    chars.map(toCharacterRef).map((c) => filterCharacterForLoreLinks(c, "U")),
  );
  const agent = refResult.find((p) => p.id === "char-1");
  assert.ok(agent, "nickname 매칭은 U 등급에서도 동작해야 함");
  assert.equal(agent.name, "[CLASSIFIED]", "U 등급 카드에 실명 노출");
  assert.ok(
    !(agent.aliases ?? []).includes("김철수"),
    "aliases 에 실명 누출",
  );
  // full 경로와 동일
  assert.deepEqual(
    refResult,
    relatedPersonnelForReport(
      nicknameReport,
      chars.map((c) => filterCharacterByClearance(c, "U")),
    ),
  );
});

/* ── L-5: 카탈로그 연관 — MasterItemRef 등가성 ── */

test("L-5: relatedCatalogItemsForReport/ForWiki — MasterItemRef === full", () => {
  const report = makeReport();
  const page = makeWikiPage({
    title: "펄스 라이플 정비 지침",
    content: "NOSB-S1E5 회수 장비 정비 절차",
  });
  const items = makeItems();

  const fullForReport = relatedCatalogItemsForReport(report, items);
  const refForReport = relatedCatalogItemsForReport(
    report,
    items.map(toMasterItemRef),
  );
  assert.deepEqual(refForReport, fullForReport);
  assert.ok(fullForReport.length > 0, "리포트-카탈로그 매칭 0건");

  const fullForWiki = relatedCatalogItemsForWiki(page, items);
  const refForWiki = relatedCatalogItemsForWiki(page, items.map(toMasterItemRef));
  assert.deepEqual(refForWiki, fullForWiki);
  assert.ok(fullForWiki.length > 0, "위키-카탈로그 매칭 0건");
});

test("명시적 report graph key는 텍스트 추론과 무관하게 visible 후보에서 우선 결합", () => {
  const report = makeReport({
    sessionId: "NO-TEXT-MATCH",
    sessionTitle: "무관 제목",
    summary: "무관 요약",
    highlights: [],
    participants: [],
    relatedWikiSlugs: ["explicit-wiki"],
    relatedPersonnelCodenames: ["NPC_FAR"],
    relatedCatalogSlugs: ["camo-kit"],
  });
  const pages = [
    makeWikiPage({
      _id: "explicit-wiki-id",
      slug: "explicit-wiki",
      title: "명시 위키",
      content: "연관 신호 없음",
    }),
  ];

  assert.deepEqual(
    relatedWikiForReport(report, pages).map((entry) => entry.id),
    ["explicit-wiki-id"],
  );
  assert.deepEqual(
    relatedPersonnelForReport(report, makeCharacters()).map((entry) => entry.id),
    ["char-3"],
  );
  assert.deepEqual(
    relatedCatalogItemsForReport(report, makeItems()).map((entry) => entry.key),
    ["camo-kit"],
  );

  // 호출자가 visibility를 적용해 후보에서 제거한 대상은 명시 key여도 복구하지 않는다.
  assert.deepEqual(relatedWikiForReport(report, []), []);
  assert.deepEqual(relatedPersonnelForReport(report, []), []);
  assert.deepEqual(relatedCatalogItemsForReport(report, []), []);
});

test("명시적 report graph key는 대상의 역링크에서도 추론 없이 결합", () => {
  const report = makeReport({
    sessionId: "NO-TEXT-MATCH",
    sessionTitle: "무관 제목",
    summary: "무관 요약",
    highlights: [],
    participants: [],
    relatedWikiSlugs: ["explicit-wiki"],
    relatedPersonnelCodenames: ["NPC_FAR"],
    relatedCatalogSlugs: ["camo-kit"],
  });
  const page = makeWikiPage({
    slug: "explicit-wiki",
    title: "명시 위키",
    content: "연관 신호 없음",
  });
  const reportRef = toSessionReportRef(report);

  assert.deepEqual(
    relatedReportsForWiki(page, [reportRef]).map((entry) => entry.id),
    ["report-1"],
  );
  assert.deepEqual(
    relatedReportsForCatalogItem(makeItems()[1], [report]).map(
      (entry) => entry.id,
    ),
    ["report-1"],
  );
  assert.deepEqual(
    relatedPersonnelForReports(
      [toRelatedReportLink(reportRef)],
      makeCharacters().map(toCharacterRef),
    ).map((entry) => entry.id),
    ["char-3"],
  );
});
