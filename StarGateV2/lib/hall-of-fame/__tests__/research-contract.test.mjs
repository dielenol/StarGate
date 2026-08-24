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
  assert.match(page, /initialData=\{initialData\}/);
  assert.match(client, /useResearchHallOfFame\(\{ initialData, initialDataUpdatedAt \}\)/);
  assert.match(query, /research: \["hall-of-fame", "research"\] as const/);
  assert.match(query, /5 \* 60 \* 1000/);
  assert.match(query, /useRealtimeRefetchInterval/);
  assert.match(queryKeys, /"hall-of-fame": \[\["hall-of-fame"\]\]/);
});

test("화면은 오류·빈 결과와 기관 수상 기록판 계약을 제공한다", async () => {
  const [page, client, css] = await Promise.all([
    source("app/(erp)/erp/hall-of-fame/page.tsx"),
    source("app/(erp)/erp/hall-of-fame/HallOfFameClient.tsx"),
    source("app/(erp)/erp/hall-of-fame/page.module.css"),
  ]);

  assert.match(client, /연구 공로 순위를 불러오지 못했습니다/);
  assert.match(client, /if \(!data\)/);
  assert.doesNotMatch(client, /if \(isError \|\| !data\)/);
  assert.match(client, /const refreshWarning = isError/);
  assert.match(client, /마지막으로 확인된 일일 순위를 유지합니다/);
  assert.match(client, /아직 기록된 팀 연구 공로가 없습니다/);
  assert.match(page, /DAILY · 21:00 KST/);
  assert.match(client, /getPixelProfilePath\(item\.codename\)/);
  assert.match(client, /preferOptimizedPublicImagePath\(profilePath\)/);
  assert.match(client, /onError=\{\(\) => setHasImageError\(true\)\}/);
  assert.match(client, /loading=\{item\.rank === 1 \? "eager" : "lazy"\}/);
  assert.match(client, /podium__portraitFallback/);
  assert.doesNotMatch(
    client,
    /podium__portraitFallback\} aria-hidden="true">\s*<IconCrown \/>\s*<span/,
  );
  assert.match(client, /max-width: 960px\) 55vw/);
  assert.match(client, /<li className=\{styles\.podium__card\} data-rank=\{item\.rank\}>/);
  assert.match(client, /data-count=\{data\.items\.length\}/);
  assert.match(
    client,
    /data\.items\.map\(\(item\) => \([\s\S]*<HonoreeCard item=\{item\}/,
  );
  assert.match(css, /max-width: 1280px/);
  assert.match(css, /container-type: inline-size/);
  assert.match(css, /@container \(max-width: 960px\)/);
  assert.match(css, /@container \(max-width: 640px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.6fr\) minmax\(300px, 0\.9fr\)/);
  assert.match(css, /\.podium\[data-count="1"\][\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.podium\[data-count="2"\][\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 960px\)[\s\S]*\.podium\[data-count="1"\],[\s\S]*\.podium\[data-count="2"\][\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@container \(max-width: 640px\)[\s\S]*\.podium\[data-count="2"\] \.podium__card\[data-rank="1"\][\s\S]*min-height: 256px/);
  assert.match(css, /@container \(max-width: 640px\)[\s\S]*\.podium\[data-count="2"\] \.podium__card\[data-rank="2"\][\s\S]*min-height: 150px/);
  assert.doesNotMatch(css, /grid-template-areas:/);
  assert.doesNotMatch(css, /@media \(max-width: 390px\)/);
  assert.match(
    css,
    /@container \(max-width: 640px\)[\s\S]*\.podium \{[\s\S]*display: flex;[\s\S]*flex-direction: column/,
  );
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
