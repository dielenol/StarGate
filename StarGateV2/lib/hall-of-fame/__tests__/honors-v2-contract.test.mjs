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

test("Hall 모바일 부문 헤더는 단일 열이며 타임라인 인장과 번호 스타일을 분리한다", async () => {
  const [css, client] = await Promise.all([
    source("app/(erp)/erp/hall-of-fame/page.module.css"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
  ]);
  const mobileCss = css.slice(css.indexOf("@container (max-width: 640px)"));
  assert.match(mobileCss, /\.wing__header\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.honorList__seal span\s*\{/);
  assert.match(css, /\.honorList__seal > span:last-child/);
  assert.match(css, /content-visibility: auto/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.match(client, /inert=\{!isActive\}/);
});

test("NOVEX read model은 전 기간 확정 수익을 집계하고 GM·테스트 계정을 양쪽 소유 시점에서 제외한다", async () => {
  const [service, stockAccount, lifetimeReturn, core, query, route, client, stockWriter, backfill] = await Promise.all([
    source("lib/hall-of-fame/honors.ts"),
    source("lib/db/stock-account.ts"),
    source("lib/db/stock-lifetime-return.ts"),
    source("../packages/core/src/domain/hall-of-fame.ts"),
    source("hooks/queries/useHallOfFameQuery.ts"),
    source("app/api/erp/hall-of-fame/novex/route.ts"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
    source("../packages/shared-db/src/crud/stock-market.ts"),
    source("scripts/hall-of-fame/backfill.ts"),
  ]);
  const lifetimeReadModel = lifetimeReturn.slice(
    lifetimeReturn.indexOf("export async function listStockLifetimeReturnCandidatesFromDb"),
  );
  const transactionOwnerFilter = lifetimeReadModel.slice(
    lifetimeReadModel.indexOf('as: "transactionOwner"'),
  );

  assert.match(stockAccount, /listStockLifetimeReturnCandidatesFromDb\(await getDb\(\)\)/);
  assert.match(lifetimeReturn, /\$in: \["STOCK_SELL", "STOCK_DIVIDEND"\]/);
  assert.match(lifetimeReturn, /\$isNumber: "\$metadata\.profit"/);
  assert.match(lifetimeReturn, /\$eq: \["\$type", "STOCK_DIVIDEND"\]/);
  assert.match(lifetimeReturn, /then: "\$amount"/);
  assert.match(lifetimeReturn, /as: "transactionOwner"/);
  assert.match(lifetimeReturn, /as: "currentOwner"/);
  assert.match(lifetimeReturn, /\$ne: \["\$transactionOwner\.role", "GM"\]/);
  assert.match(lifetimeReturn, /\$ne: \["\$currentOwner\.role", "GM"\]/);
  assert.match(lifetimeReturn, /regex: "TEST\$"/);
  assert.match(lifetimeReturn, /from: "characters"/);
  assert.match(lifetimeReturn, /"character\.type": "AGENT"/);
  assert.ok(
    transactionOwnerFilter.indexOf("$regexMatch") <
      transactionOwnerFilter.indexOf('_id: "$_id.characterId"'),
    "거래 시점 owner 필터는 캐릭터 최종 집계보다 먼저 실행해야 한다",
  );
  assert.match(service, /listStockLifetimeReturnCandidates\(\)/);
  assert.match(service, /rankNovexLifetimeReturnCandidates\(candidates\)/);
  assert.match(service, /const loadHallOfFameNovexResponse = cache\(/);
  assert.match(service, /return loadHallOfFameNovexResponse\(\)/);
  assert.match(core, /input\.role === "GM"/);
  assert.match(core, /toUpperCase\(\)\.endsWith\("TEST"\)/);
  assert.ok(
    core.indexOf("totalRealizedReturn: roundStockValue(candidate.totalRealizedReturn)") <
      core.indexOf("right.totalRealizedReturn - left.totalRealizedReturn"),
    "표시 단위 정규화는 순위 정렬 전에 실행해야 한다",
  );
  assert.match(core, /right\.totalRealizedReturn - left\.totalRealizedReturn/);
  assert.match(core, /\.slice\(0, 3\)/);
  const publicNovex = core.slice(
    core.indexOf("export interface HallOfFameNovexResponse"),
    core.indexOf("export interface NovexLifetimeReturnCandidate"),
  );
  assert.match(publicNovex, /period: "ALL_TIME"/);
  assert.match(publicNovex, /basis: "TOTAL_REALIZED_RETURN"/);
  assert.match(publicNovex, /totalRealizedReturn/);
  assert.match(publicNovex, /profitEventCount/);
  assert.doesNotMatch(publicNovex, /characterId|ownerUsername|ownerRole/);
  assert.match(query, /novex: \["hall-of-fame", "novex"\] as const/);
  assert.doesNotMatch(query, /seasonKey/);
  assert.doesNotMatch(route, /searchParams|get\("season"\)/);
  assert.doesNotMatch(client, /seasonPicker|시즌 선택/);
  assert.match(client, /GM \+ TEST EXCLUDED/);
  assert.doesNotMatch(service, /upsertHonorRecord|materializeNovexSeasonHonors/);
  assert.doesNotMatch(service, /domain: "NOVEX"/);
  assert.doesNotMatch(stockWriter, /materializeNovexSeasonHonors/);
  assert.doesNotMatch(stockWriter, /view=novex&season=/);
  assert.match(stockWriter, /link: "\/erp\/stock"/);
  assert.doesNotMatch(backfill, /buildNovexHonorRecords|materializeNovexSeasonHonors/);
  assert.match(backfill, /BACKFILL_NOVEX_SEASON_HONORS_UNSUPPORTED/);
});

test("작전 공적은 DB U 필터와 현재 보고서 U 재검증을 함께 적용한다", async () => {
  const service = await source("lib/hall-of-fame/honors.ts");

  assert.match(service, /domain: "OPERATION",[\s\S]*minRole: "U"/);
  assert.match(service, /findCurrentOperationHonorSources\(\[sourceKey\]\)/);
  assert.match(
    service,
    /normalizeSessionReportMinRole\(report\.minRole\) !== "U"/,
  );
  assert.match(service, /operationReports = await findCurrentOperationHonorSources/);
  assert.match(service, /operationReports\.get\(record\.source\.key\)/);
  assert.match(service, /buildOperationHonorSourceMaterial/);
  assert.match(service, /current\.source\.sourceHash !== record\.sourceHash/);
  assert.match(service, /getHallOfFameReportReviewState/);
  assert.match(service, /HONOR_LORE_REVIEW_REVISION/);
  assert.match(
    service,
    /state\.analyzerRevision === HONOR_LORE_REVIEW_REVISION/,
  );
  assert.match(service, /state\?\.sourceHash === source\.sourceHash/);
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

test("Hall 탭은 현재 부문에 필요한 RSC와 Query만 활성화한다", async () => {
  const [page, client, query] = await Promise.all([
    source("app/(erp)/erp/hall-of-fame/page.tsx"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
    source("hooks/queries/useHallOfFameQuery.ts"),
  ]);

  assert.match(page, /searchParams: Promise</);
  assert.match(page, /const shouldLoadOverview = view === "overview"/);
  assert.match(page, /const shouldLoadResearch = shouldLoadOverview \|\| view === "research"/);
  assert.match(page, /const shouldLoadNovex = shouldLoadOverview \|\| view === "novex"/);
  assert.match(
    page,
    /const shouldLoadCitations =\s*!isGuest && \(shouldLoadOverview \|\| view === "operations"\)/,
  );
  assert.match(page, /const shouldLoadMine = !isGuest && \(shouldLoadOverview \|\| view === "mine"\)/);
  assert.match(page, /shouldLoadOverview\s*\? getHallOfFameOverviewResponse/);
  assert.match(page, /shouldLoadResearch\s*\? getResearchHallOfFameResponse/);
  assert.match(page, /shouldLoadNovex\s*\? getHallOfFameNovexResponse/);
  assert.match(page, /shouldLoadCitations\s*\? getHallOfFameCitationPage/);
  assert.match(page, /shouldLoadMine\s*\? getHallOfFameMineResponse/);
  assert.match(page, /\{ category: operationCategory \}/);
  assert.match(page, /\{ cursor: operationCursor \}/);
  assert.match(client, /enabled: shouldLoadOverview/);
  assert.match(client, /enabled: shouldLoadResearch/);
  assert.match(client, /enabled: shouldLoadNovex/);
  assert.match(client, /enabled: shouldLoadCitations/);
  assert.match(client, /enabled: shouldLoadMine/);
  assert.ok(
    (query.match(/enabled: options\?\.enabled \?\? true/g) ?? []).length >= 5,
    "Hall Query 다섯 부문이 모두 명시적 비활성화를 지원해야 한다",
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

test("내 리본은 소유 캐릭터의 작전 공적 전체 cursor 페이지를 합산한다", async () => {
  const service = await source("lib/hall-of-fame/honors.ts");

  assert.match(service, /listCharactersByOwner\(input\.userId\)/);
  assert.match(service, /for \(const character of characters\)/);
  assert.match(service, /async function listAllHonorRecords/);
  assert.match(service, /do \{[\s\S]*listHonorRecords[\s\S]*while \(cursor\)/);
  assert.match(service, /domain: "OPERATION"[\s\S]*minRole: "U"/);
  assert.doesNotMatch(service, /domain: "NOVEX"/);
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
  assert.match(report, /getHallOfFameReportReviewResponse/);
  assert.match(report, /initialHonors=\{reportHonors\}/);
  assert.match(reportHonors, /useHallOfFameCitations/);
  assert.match(reportHonors, /useHallOfFameReportReviewState/);
  assert.match(reportHonors, /공적 인용 · OFFICIAL HONORS/);
  assert.match(reportHonors, /공적 검토 대기/);
  assert.match(reportHonors, /확정된 공적 인용 없음/);
  assert.match(reportHonors, /엄격한 헌액 기준/);
  assert.doesNotMatch(reportHonors, /자동 심사|자동 헌액/);
  assert.match(reportHonors, /마지막 성공 기록 표시 중/);
  assert.match(dossier, /enabled: canViewHonors && Boolean\(characterId\)/);
  assert.match(dossier, /최신 갱신에 실패해 마지막 공적 기록을 표시합니다/);
  assert.match(research, /hall-of-fame\?view=research/);
  assert.match(stock, /hall-of-fame\?view=novex/);
  assert.match(notifications, /HONOR: \{ label: "HONOR", tone: "gold" \}/);
});

test("Hall 관련 원본 변경은 필요한 Query 범위로 수렴한다", async () => {
  const [queryKeys, mapper] = await Promise.all([
    source("lib/realtime/query-keys.ts"),
    source("../stargate-worker/src/realtime/resource-mapper.ts"),
  ]);

  assert.match(queryKeys, /users:[\s\S]*?\["hall-of-fame"\]/);
  assert.match(queryKeys, /characters:[\s\S]*?\["hall-of-fame"\]/);
  assert.match(mapper, /stock_investment_seasons: \["stocks"\]/);
  assert.match(mapper, /stock_season_performance: \["stocks"\]/);
  assert.match(mapper, /credit_transactions: \["credits"\]/);
  assert.match(mapper, /resources\.push\("hall-of-fame-novex"\)/);
  assert.match(
    queryKeys,
    /"hall-of-fame-novex": \[[\s\S]*?\["hall-of-fame", "overview"\][\s\S]*?\["hall-of-fame", "novex"\]/,
  );
  assert.match(mapper, /session_reports: \["reports", "hall-of-fame"\]/);
  assert.match(mapper, /honor_records: \["hall-of-fame"\]/);
  assert.match(mapper, /honor_analysis_states: \["hall-of-fame"\]/);
});

test("개요 집계는 연구·NOVEX 누적 TOP3·전체 공개 작전 원장의 정확한 합계를 사용한다", async () => {
  const [service, route, query, client] = await Promise.all([
    source("lib/hall-of-fame/honors.ts"),
    source("app/api/erp/hall-of-fame/overview/route.ts"),
    source("hooks/queries/useHallOfFameQuery.ts"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
  ]);

  assert.match(service, /getHallOfFameNovexResponse\(\)/);
  assert.match(service, /listAllHonorRecords\(\{ domain: "OPERATION", minRole: "U" \}\)/);
  assert.match(service, /await toVisibleHonorItems\(operationRecords\)/);
  assert.match(
    service,
    /research\.items\.length \+ novex\.items\.length \+ operationRecordCount/,
  );
  assert.match(service, /novexHonoreeCount: novex\.items\.length/);
  assert.match(route, /isGuest: session\.user\.isGuest === true/);
  assert.match(query, /overview: \["hall-of-fame", "overview"\] as const/);
  assert.match(client, /overview\.data\?\.totalRecords/);
  assert.match(client, /overview\.data\?\.novexHonoreeCount/);
  assert.doesNotMatch(client, /overview\.data\?\.seasonCount/);
  assert.doesNotMatch(client, /citations\.data\?\.items\.length \?\? "—"/);
});

test("작전 공적 원본 링크는 ERP 금색 토큰과 모바일 버튼 형태를 유지한다", async () => {
  const [client, styles] = await Promise.all([
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
    source("app/(erp)/erp/hall-of-fame/page.module.css"),
  ]);

  assert.match(client, /className=\{styles\.honorList__link\}/);
  assert.match(client, /충분한 근거를 검토해 확정한 공식 인용/);
  assert.match(styles, /\.honorList__link\s*\{[\s\S]*?color:\s*var\(--gold\)/);
  assert.match(styles, /\.honorList__link:visited\s*\{\s*color:\s*var\(--gold\)/);
  assert.match(styles, /\.honorList__link\s*\{[\s\S]*?border-radius:\s*999px/);
  assert.doesNotMatch(styles, /\.honorList__link\s*\{\s*grid-column:\s*2;\s*padding:\s*0;/);
});
