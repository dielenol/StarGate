import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("Hall public mapper는 내부 식별자와 분석 감사를 직렬화하지 않는다", async () => {
  const core = await source("../packages/core/src/domain/hall-of-fame.ts");
  const mapper = core.slice(core.indexOf("export function toHallOfFameHonorItem"));

  for (const field of [
    "key",
    "domain",
    "category",
    "codename",
    "title",
    "citation",
    "occurredAt",
    "sourceLabel",
  ]) {
    assert.match(mapper, new RegExp(`\\b${field}\\b`));
  }
  for (const forbidden of [
    "logicalKey",
    "characterId",
    "sourceHash",
    "analyzerRevision",
    "evidenceAudit",
  ]) {
    assert.doesNotMatch(mapper, new RegExp(`\\b${forbidden}\\b`));
  }
});

test("NOVEX read model은 원장 쓰기 없이 확정 시즌 SSOT fallback을 제공한다", async () => {
  const service = await source("lib/hall-of-fame/honors.ts");

  assert.match(service, /listFinalizedNovexSeasons/);
  assert.match(service, /listNovexHonorRecords/);
  assert.match(
    service,
    /records\.length === 0[\s\S]*listNovexHonorFallbackPerformances/,
  );
  assert.match(service, /buildNovexHonorLogicalKey\(season\._id, row\.characterId\)/);
  assert.match(service, /fallbackNovexItems/);
  assert.doesNotMatch(service, /upsertHonorRecord|materializeNovexSeasonHonors/);
});

test("작전 공적은 DB U 필터와 현재 보고서 U 재검증을 함께 적용한다", async () => {
  const service = await source("lib/hall-of-fame/honors.ts");

  assert.match(service, /domain: "OPERATION",[\s\S]*minRole: "U"/);
  assert.match(service, /findReportBySessionId\(sourceKey\)/);
  assert.match(
    service,
    /normalizeSessionReportMinRole\(report\.minRole\) !== "U"/,
  );
  assert.match(service, /operationReports = new Map/);
  assert.match(service, /buildOperationHonorSourceMaterial/);
  assert.match(service, /current\.source\.sourceHash !== record\.sourceHash/);
  assert.match(service, /getHallOfFameReportAnalysisState/);
  assert.match(service, /state\.sourceHash !== source\.sourceHash/);
  assert.match(service, /const remaining = limit - items\.length/);
  assert.match(service, /limit: remaining/);
});

test("작전 원본 링크는 공개 응답에 DB ID 대신 opaque public key만 사용한다", async () => {
  const [service, redirectPage] = await Promise.all([
    source("lib/hall-of-fame/honors.ts"),
    source("app/(erp)/erp/hall-of-fame/source/[key]/page.tsx"),
  ]);
  const visibleMapper = service.slice(
    service.indexOf("async function toVisibleHonorItems"),
    service.indexOf("export async function getHallOfFameSourceRedirect"),
  );

  assert.match(
    visibleMapper,
    /\/erp\/hall-of-fame\/source\/\$\{encodeURIComponent\(record\.publicKey\)\}/,
  );
  assert.doesNotMatch(visibleMapper, /current\.report\._id/);
  assert.match(redirectPage, /isMemberErpViewer\(session\.user\)/);
  assert.match(redirectPage, /getHallOfFameSourceRedirect/);
  assert.match(redirectPage, /if \(!destination\) notFound\(\)/);
});

test("guest는 작전·내 공적 endpoint에서 일반 404만 받고 query도 비활성화할 수 있다", async () => {
  const [citations, status, mine, query] = await Promise.all([
    source("app/api/erp/hall-of-fame/citations/route.ts"),
    source("app/api/erp/hall-of-fame/citations/status/route.ts"),
    source("app/api/erp/hall-of-fame/mine/route.ts"),
    source("hooks/queries/useHallOfFameQuery.ts"),
  ]);

  for (const route of [citations, status, mine]) {
    assert.match(route, /isMemberErpViewer\(session\.user\)/);
    assert.match(route, /error: "Not Found", code: "NOT_FOUND"/);
    assert.match(route, /status: 404/);
  }
  assert.match(query, /enabled: options\?\.enabled \?\? true/);
  assert.match(query, /placeholderData: keepPreviousData/);
  assert.match(
    query,
    /\["hall-of-fame", "citations", category \?\? "all"\] as const/,
  );
});

test("문맥 조회는 보고서 등급과 신원조회 접근권한을 서버에서 재검증한다", async () => {
  const service = await source("lib/hall-of-fame/honors.ts");

  assert.match(service, /if \(input\.reportId\)[\s\S]*findReportById/);
  assert.match(
    service,
    /if \(input\.characterId\)[\s\S]*findCharacterById[\s\S]*canViewCharacter/,
  );
  assert.match(
    service,
    /const visibleItems = await toVisibleHonorItems\(records\)[\s\S]*items: visibleItems/,
  );
});

test("내 리본은 소유 캐릭터 전체와 모든 cursor 페이지를 합산한다", async () => {
  const service = await source("lib/hall-of-fame/honors.ts");

  assert.match(service, /listCharactersByOwner\(input\.userId\)/);
  assert.match(service, /for \(const character of characters\)/);
  assert.match(service, /async function listAllHonorRecords/);
  assert.match(service, /do \{[\s\S]*listHonorRecords[\s\S]*while \(cursor\)/);
  assert.match(service, /domain: "OPERATION"[\s\S]*minRole: "U"/);
  assert.match(service, /return \{ total: ribbons\.length, ribbons \}/);
});

test("보고서·Dossier·연구·주식·알림이 명예의 전당 read model에 연결된다", async () => {
  const [report, reportHonors, dossier, research, stock, notifications] = await Promise.all([
    source("app/(erp)/erp/sessions/report/[id]/page.tsx"),
    source("app/(erp)/erp/sessions/report/[id]/ReportHonorCitations.tsx"),
    source("app/(erp)/erp/personnel/[id]/DossierClient.tsx"),
    source("app/(erp)/erp/research/ResearchLabView.tsx"),
    source("app/(erp)/erp/stock/StockSeasonLeaderboard.tsx"),
    source("app/(erp)/erp/notifications/NotificationsClient.tsx"),
  ]);

  assert.match(report, /getHallOfFameCitationPage/);
  assert.match(report, /getHallOfFameReportAnalysisResponse/);
  assert.match(report, /initialHonors=\{reportHonors\}/);
  assert.match(reportHonors, /useHallOfFameCitations/);
  assert.match(reportHonors, /useHallOfFameReportAnalysisState/);
  assert.match(reportHonors, /공적 인용 · OFFICIAL HONORS/);
  assert.match(reportHonors, /공적 재심사 중/);
  assert.match(reportHonors, /확정된 공적 인용 없음/);
  assert.match(reportHonors, /마지막 성공 기록 표시 중/);
  assert.match(dossier, /enabled: canViewHonors && Boolean\(characterId\)/);
  assert.match(dossier, /최신 갱신에 실패해 마지막 공적 기록을 표시합니다/);
  assert.match(research, /hall-of-fame\?view=research/);
  assert.match(stock, /hall-of-fame\?view=novex/);
  assert.match(notifications, /HONOR: \{ label: "HONOR", tone: "gold" \}/);
});

test("Hall 관련 원본 변경은 root query invalidation으로 수렴한다", async () => {
  const [queryKeys, mapper] = await Promise.all([
    source("lib/realtime/query-keys.ts"),
    source("../stargate-worker/src/realtime/resource-mapper.ts"),
  ]);

  assert.match(queryKeys, /users:[\s\S]*?\["hall-of-fame"\]/);
  assert.match(queryKeys, /characters:[\s\S]*?\["hall-of-fame"\]/);
  assert.match(
    mapper,
    /stock_investment_seasons: \["stocks", "hall-of-fame"\]/,
  );
  assert.match(
    mapper,
    /stock_season_performance: \["stocks", "hall-of-fame"\]/,
  );
  assert.match(mapper, /session_reports: \["reports", "hall-of-fame"\]/);
  assert.match(mapper, /honor_records: \["hall-of-fame"\]/);
  assert.match(mapper, /honor_analysis_states: \["hall-of-fame"\]/);
});

test("개요 집계는 page slice가 아니라 전체 공개 원장의 정확한 합계를 사용한다", async () => {
  const [service, shared, route, query, client] = await Promise.all([
    source("lib/hall-of-fame/honors.ts"),
    source("../packages/shared-db/src/crud/honors.ts"),
    source("app/api/erp/hall-of-fame/overview/route.ts"),
    source("hooks/queries/useHallOfFameQuery.ts"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
  ]);

  assert.match(shared, /countFinalizedNovexSeasons/);
  assert.match(shared, /countFinalizedNovexTop3Performances/);
  assert.match(service, /listAllHonorRecords\(\{ domain: "OPERATION", minRole: "U" \}\)/);
  assert.match(service, /await toVisibleHonorItems\(operationRecords\)/);
  assert.match(
    service,
    /research\.items\.length \+ novexRecordCount \+ operationRecordCount/,
  );
  assert.match(route, /isGuest: session\.user\.isGuest === true/);
  assert.match(query, /overview: \["hall-of-fame", "overview"\] as const/);
  assert.match(client, /overview\.data\?\.totalRecords/);
  assert.match(client, /overview\.data\?\.seasonCount/);
  assert.doesNotMatch(client, /citations\.data\?\.items\.length \?\? "—"/);
});
