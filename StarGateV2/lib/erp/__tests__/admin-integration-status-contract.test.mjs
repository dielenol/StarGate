import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, WEB_ROOT), "utf8");
}

test("관리자 연동 현황은 GM 전용 no-store API와 30초 polling을 사용한다", async () => {
  const [route, page, query, nav] = await Promise.all([
    source("app/api/erp/admin/integration-status/route.ts"),
    source("app/(erp)/erp/admin/page.tsx"),
    source("hooks/queries/useAdminIntegrationStatusQuery.ts"),
    source("components/erp/nav-config.ts"),
  ]);

  assert.match(route, /getActiveSession\(\)/);
  assert.match(route, /hasRole\(session\.user\.role, "GM"\)/);
  assert.match(route, /Cache-Control": "private, no-store"/);
  assert.match(page, /getAdminIntegrationStatusResponse\(\)/);
  assert.match(page, /AdminIntegrationStatusClient initialData=/);
  assert.match(query, /refetchInterval: 30_000/);
  assert.match(query, /refetchIntervalInBackground: false/);
  assert.match(nav, /href: "\/erp\/admin"/);
});

test("관리자 DTO는 outbox payload와 전달 secret·원본 오류를 노출하지 않는다", async () => {
  const [types, client] = await Promise.all([
    source("types/admin-integration-status.ts"),
    source("app/(erp)/erp/admin/AdminIntegrationStatusClient.tsx"),
  ]);

  assert.doesNotMatch(
    types,
    /\b(payload|dedupeKey|leaseToken|messageId|recipientId|lastError)\??:/,
  );
  assert.doesNotMatch(types, /webhookUrl|botToken|secret/i);
  assert.match(types, /sentCount: number/);
  assert.match(types, /skippedCount: number/);
  assert.match(types, /unclassifiedCount: number/);
  assert.match(types, /mode: "shadow" \| "active" \| null/);
  assert.match(types, /missingConsumers: string\[\]/);
  assert.match(client, /신규 처리 완료는 실제 발송과 정책상 생략을 구분/);
  assert.match(client, /이 화면은 읽기 전용입니다/);
});

test("관리자 연동 현황은 상태별 표현과 키보드 접근 가능한 표를 제공한다", async () => {
  const [client, styles] = await Promise.all([
    source("app/(erp)/erp/admin/AdminIntegrationStatusClient.tsx"),
    source("app/(erp)/erp/admin/page.module.css"),
  ]);

  assert.match(client, /data-health=\{data\.worker\.health\.toLowerCase\(\)\}/);
  assert.match(client, /role="heading"/);
  assert.match(client, /role="region"/);
  assert.match(client, /tabIndex=\{0\}/);
  assert.match(client, /onKeyDown=\{handleOutboxTableKeyDown\}/);
  assert.match(client, /role="alert"/);
  assert.match(styles, /\.workerPanel\[data-health="critical"\]/);
  assert.match(styles, /\.tableWrap:focus-visible/);
  assert.doesNotMatch(styles, /\.kpi:nth-child/);
});

test("연구 공로 job과 desired-state consumer를 연동 현황에 포함한다", async () => {
  const [service, types] = await Promise.all([
    source("lib/erp/admin-integration-status.ts"),
    source("types/admin-integration-status.ts"),
  ]);

  assert.match(service, /"research-ranking"/);
  assert.match(service, /RESEARCH_RANKING_STATE_COLLECTION/);
  assert.match(service, /key: "RESEARCH_RANKING"/);
  assert.match(types, /"RESEARCH_RANKING"/);
});
