import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("연구 명예의 전당 API는 인증을 요구하되 ERP 게스트를 허용한다", async () => {
  const [route, nav, guestResearch] = await Promise.all([
    source("app/api/erp/hall-of-fame/research/route.ts"),
    source("components/erp/nav-config.ts"),
    source("lib/equipment-shop/guest-research.ts"),
  ]);

  assert.match(route, /getActiveSession\(\)/);
  assert.match(route, /status: 401/);
  assert.doesNotMatch(route, /session\.user\.isGuest/);
  assert.match(route, /private, no-store/);
  assert.match(
    nav,
    /label: "명예의 전당"[\s\S]*?href: "\/erp\/hall-of-fame"/,
  );
  assert.doesNotMatch(
    nav,
    /label: "명예의 전당"[^\n]*gmHref/,
  );

  // 명예의 전당 공개와 별개로 기존 연구소 원장·랭킹은 계속 비운다.
  assert.match(guestResearch, /recentContributions: \[\]/);
  assert.match(guestResearch, /contributionRankings: \[\]/);
});

test("공개 응답은 TOP 3 표시 필드만 직렬화한다", async () => {
  const [types, service] = await Promise.all([
    source("../packages/shared-db/src/types/research-ranking.ts"),
    source("lib/hall-of-fame/research.ts"),
  ]);
  const responseBlock = types.slice(
    types.indexOf("export interface ResearchHallOfFameResponse"),
    types.indexOf("export interface ResearchRankingDiscordPayload"),
  );

  for (const key of [
    "period",
    "cadence",
    "generatedAt",
    "rank",
    "codename",
    "totalCredits",
    "contributionCount",
  ]) {
    assert.match(responseBlock, new RegExp(`\\b${key}\\b`));
  }
  for (const forbidden of [
    "characterId",
    "userId",
    "requestId",
    "lastContributedAt",
  ]) {
    assert.doesNotMatch(responseBlock, new RegExp(`\\b${forbidden}\\b`));
  }

  assert.match(service, /state\?\.publicSnapshot/);
  assert.match(service, /listTeamResearchContributionRankings\(3\)/);
  assert.ok(
    service.indexOf("state?.publicSnapshot") <
      service.indexOf("listTeamResearchContributionRankings(3)"),
    "저장된 일일 스냅샷이 존재하면 live fallback보다 먼저 반환해야 한다",
  );
  assert.match(
    service,
    /items: snapshot\.items\.slice\(0, 3\)\.map[\s\S]*rank: item\.rank[\s\S]*codename: item\.codename[\s\S]*totalCredits: item\.totalCredits[\s\S]*contributionCount: item\.contributionCount/,
  );
});

test("RSC 초기 데이터와 realtime 5분 fallback Query를 연결한다", async () => {
  const [page, client, query, queryKeys] = await Promise.all([
    source("app/(erp)/erp/hall-of-fame/page.tsx"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
    source("hooks/queries/useHallOfFameQuery.ts"),
    source("lib/realtime/query-keys.ts"),
  ]);

  assert.match(page, /getResearchHallOfFameResponse\(\)/);
  assert.match(page, /getHallOfFameOverviewResponse/);
  assert.match(page, /initialData=\{initialData\}/);
  assert.match(page, /initialOverviewData=\{initialOverviewData\}/);
  assert.match(client, /useResearchHallOfFame\(\{ initialData, initialDataUpdatedAt \}\)/);
  assert.match(client, /useHallOfFameOverview/);
  assert.match(query, /research: \["hall-of-fame", "research"\] as const/);
  assert.match(query, /5 \* 60 \* 1000/);
  assert.match(query, /useRealtimeRefetchInterval/);
  assert.match(queryKeys, /"hall-of-fame": \[\["hall-of-fame"\]\]/);
});

test("화면은 오류·빈 결과와 통합 공적 허브 계약을 제공한다", async () => {
  const [page, client, css, background] = await Promise.all([
    source("app/(erp)/erp/hall-of-fame/page.tsx"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
    source("app/(erp)/erp/hall-of-fame/page.module.css"),
    readFile(
      new URL(
        "public/assets/research/hall-of-fame-background.webp",
        ROOT,
      ),
    ),
  ]);

  assert.match(client, /연구 공로 순위를 불러오지 못했습니다/);
  assert.match(client, /첫 연구 공적을 기다리고 있습니다/);
  assert.match(client, /StaleNotice/);
  assert.match(client, /마지막 성공 데이터를 표시합니다/);
  assert.match(page, /OFFICIAL · LIVING ARCHIVE/);
  assert.match(client, /DAILY · 21:00 KST/);
  assert.match(client, /NOVUS ORDO HONORS ARCHIVE/);
  assert.match(client, /<NovusEmblem/);
  assert.match(css, /url\("\/assets\/StarGate_logo\.webp"\)/);
  assert.match(client, /const researchLeader = research\.data\?\.items\.find\(\(item\) => item\.rank === 1\)/);
  assert.match(client, /LIVE RESEARCH LEAD/);
  assert.match(client, /팀 연구 누적 공로 1위/);
  assert.match(client, /formatCredits\(researchLeader\.totalCredits\)/);
  assert.match(client, /researchLeader\.contributionCount\.toLocaleString/);
  assert.match(client, /research\.isError \? "마지막 성공 기록 확인 필요"/);
  assert.match(client, /novex\.isError \? "수익 원장 조회 실패"/);
  assert.match(client, /citations\.isError \? "작전 원장 조회 실패"/);
  assert.match(client, /aria-roledescription="carousel"/);
  assert.match(client, /SPOTLIGHT_INTERVAL_MS = 6_500/);
  assert.match(client, /translatePercent = safeIndex === 0 \? 0 : safeIndex \* -100/);
  assert.match(client, /onTouchEnd=\{handleTouchEnd\}/);
  assert.match(client, /onTouchCancel=/);
  assert.match(client, /prefers-reduced-motion: reduce/);
  assert.match(client, /label="MY RIBBONS"/);
  assert.match(client, /ribbonHighlights/);
  assert.match(client, /자동 순환 정지/);
  assert.doesNotMatch(client, /styles\["panel--mine"\]/);
  assert.match(client, /VIEWS = \["overview", "research", "novex", "operations", "mine"\]/);
  assert.match(client, /isGuest && \(view === "operations" \|\| view === "mine"\)/);
  assert.match(client, /enabled: !isGuest/);
  assert.match(client, /getPixelProfilePath\(codename\)/);
  assert.match(client, /preferOptimizedPublicImagePath\(profilePath\)/);
  assert.match(client, /onError=\{\(\) => setHasImageError\(true\)\}/);
  assert.match(client, /loading=\{rank === 1 \? "eager" : "lazy"\}/);
  assert.match(client, /className=\{styles\.portraitFallback\}/);
  assert.match(client, /sizes=\{PORTRAIT_SIZES\[rank\]\}/);
  assert.match(client, /className=\{styles\.researchPodium__card\} data-rank=\{item\.rank\}/);
  assert.match(
    client,
    /data\.items\.map\(\(item\) => <li[\s\S]*key=\{`\$\{item\.rank\}-\$\{item\.codename\}`\}/,
  );
  assert.match(css, /max-width: 1280px/);
  assert.match(css, /container-type: inline-size/);
  assert.match(page, /className=\{styles\.page\}/);
  assert.match(css, /url\("\/assets\/research\/hall-of-fame-background\.webp"\)/);
  assert.ok(background.byteLength > 10_000);
  assert.match(css, /@container \(max-width: 960px\)/);
  assert.match(css, /@container \(max-width: 640px\)/);
  assert.match(css, /grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(css, /--archive-grid:/);
  assert.match(css, /\.overview::before/);
  assert.match(css, /\.overview,[\s\S]*?border-radius: 28px/);
  assert.match(css, /\.panel \{[\s\S]*?border-radius: 20px/);
  assert.match(css, /\.panel--featured \{[\s\S]*?border-radius: 24px/);
  assert.match(css, /\.spotlight__track/);
  assert.match(css, /touch-action: pan-y/);
  assert.doesNotMatch(css, /researchPodium--compact[^\n]*border-top: 0/);
  assert.doesNotMatch(css, /\.panel--featured, \.panel--registry, \.panel--research \{[^}]*border-right: 0/);
  assert.match(css, /\.featured__orbit/);
  assert.match(css, /\.archiveChannel__orbit/);
  assert.match(css, /border-bottom: 1px dashed/);
  assert.match(css, /\.researchPodium\[data-count="1"\]/);
  assert.match(css, /\.researchPodium\[data-count="2"\]/);
  assert.match(css, /@container \(max-width: 640px\)[\s\S]*\.overview__grid \{ display: flex; flex-direction: column/);
  assert.match(css, /@container \(max-width: 640px\)[\s\S]*\.researchPodium \{ display: flex; flex-direction: column/);
  assert.doesNotMatch(css, /grid-template-areas:/);
  assert.doesNotMatch(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
});

test("명예의 전당 모바일 GM 잠금 HUD는 기록판을 가리지 않도록 축소한다", async () => {
  const [control, css] = await Promise.all([
    source("components/erp/PageLockControl/PageLockControl.tsx"),
    source("components/erp/PageLockControl/PageLockControl.module.css"),
  ]);

  assert.match(control, /pathname === "\/erp\/hall-of-fame"/);
  assert.match(control, /control--hallOfFame/);
  assert.match(css, /@media \(max-width: 2047px\), \(max-height: 900px\)/);
  assert.match(css, /\.control\.control--hallOfFame \{[\s\S]*position: relative/);
  assert.match(css, /\.control\.control--hallOfFame \{[\s\S]*right: auto;[\s\S]*bottom: auto/);
  assert.match(css, /\.control__error \{[\s\S]*position: absolute/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.control\.control--hallOfFame/);
  assert.match(css, /\.control--hallOfFame \.control__copy \{[\s\S]*display: none/);
  assert.match(css, /\.control--hallOfFame \.control__switch \{[\s\S]*min-width: 60px/);
});
