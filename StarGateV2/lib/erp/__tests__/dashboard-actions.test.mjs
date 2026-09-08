import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";

import {
  buildDashboardActionSummary,
  getDashboardActionSummary,
} from "../dashboard-actions.ts";

const dbSource = await readFile(
  new URL("../../db/dashboard-actions.ts", import.meta.url),
  "utf8",
);
const serviceSource = await readFile(
  new URL("../dashboard-actions.ts", import.meta.url),
  "utf8",
);

const NOW = new Date("2026-09-08T08:00:00.000Z");

function available(items = [], totalCount = items.length) {
  return { ok: true, value: { items, totalCount } };
}

function baseLoads() {
  return {
    workshop: available(),
    trades: available(),
    research: available(),
  };
}

test("전역 우선순위로 8건만 표시하고 도메인별 실제 건수는 보존한다", () => {
  const workshopItems = Array.from({ length: 8 }, (_, index) => ({
    id: `workshop-${index}`,
    state: "OWNER_QUOTE",
    characterCodename: "AGENT",
    subject: `장비 ${index}`,
    updatedAt: new Date(NOW.getTime() + index),
  }));
  const summary = buildDashboardActionSummary(
    {
      workshop: available(workshopItems, 10),
      trades: available([
        {
          id: "trade-1",
          counterpartyName: "상대",
          otherConfirmed: true,
          updatedAt: NOW,
        },
      ], 2),
      research: available([
        {
          id: "research-1",
          outputName: "연구 산출물",
          claimDeadline: new Date(NOW.getTime() + 30 * 60_000),
          updatedAt: NOW,
        },
      ]),
    },
    NOW,
  );

  assert.equal(summary.items.length, 8);
  assert.equal(summary.totalCount, 13);
  assert.deepEqual(summary.domains.map(({ key, count }) => [key, count]), [
    ["workshop", 10],
    ["trades", 2],
    ["research", 1],
  ]);
  assert.equal(summary.items[0].id, "research:research-1:claim");
  assert.equal(summary.items[0].tone, "danger");
  assert.equal(summary.items[1].id, "trade:trade-1:confirm");
});

test("공방 완료 시각은 수령 가능을 단정하지 않고 조건 확인으로 안내한다", () => {
  const summary = buildDashboardActionSummary(
    {
      ...baseLoads(),
      workshop: available([
        {
          id: "request/one",
          state: "OWNER_COMPLETION_CHECK",
          characterCodename: "AGENT",
          subject: "시험 장비",
          updatedAt: NOW,
        },
      ]),
    },
    NOW,
  );

  assert.equal(
    summary.items[0].href,
    "/erp/equipment-shop/custom?requestId=request%2Fone",
  );
  assert.match(summary.items[0].title, /수령 조건 확인/);
  assert.doesNotMatch(summary.items[0].title, /수령 가능/);
  assert.doesNotMatch(summary.items[0].detail, /수령 가능/);
});

test("GM 공방 업무가 있으면 도메인 진입점도 관리 화면을 가리킨다", () => {
  const summary = buildDashboardActionSummary(
    {
      ...baseLoads(),
      workshop: available([
        {
          id: "admin-request",
          state: "GM_RELOAD_APPROVAL",
          characterCodename: "AGENT",
          subject: "재장전",
          updatedAt: NOW,
        },
      ]),
    },
    NOW,
  );

  assert.equal(summary.items[0].cta, "승인 검토");
  assert.equal(
    summary.domains.find(({ key }) => key === "workshop")?.href,
    "/erp/admin/equipment-workshop",
  );
});

test("기한이 지난 연구 건은 방어적으로 숨기고 유효한 건만 deadline을 노출한다", () => {
  const summary = buildDashboardActionSummary(
    {
      ...baseLoads(),
      research: available([
        {
          id: "expired",
          outputName: "만료",
          claimDeadline: new Date(NOW.getTime() - 1),
          updatedAt: NOW,
        },
        {
          id: "valid",
          outputName: "유효",
          claimDeadline: new Date(NOW.getTime() + 2 * 60 * 60_000),
          updatedAt: NOW,
        },
      ], 1),
    },
    NOW,
  );

  assert.deepEqual(summary.items.map(({ id }) => id), ["research:valid:claim"]);
  assert.equal(
    summary.items[0].deadlineAt,
    "2026-09-08T10:00:00.000Z",
  );
});

test("도메인 실패는 정상 0건으로 위장하지 않는다", () => {
  const summary = buildDashboardActionSummary(
    {
      workshop: available(),
      trades: { ok: false },
      research: available(),
    },
    NOW,
  );

  assert.deepEqual(summary.unavailableDomains, ["trades"]);
  assert.deepEqual(
    summary.domains.find(({ key }) => key === "trades"),
    { key: "trades", label: "거래", href: "/erp/trades", count: null },
  );
  assert.equal(summary.totalCount, 0);
});

test("게스트는 DB 모듈을 불러오지 않고 빈 개인 업무를 반환한다", async () => {
  const summary = await getDashboardActionSummary({
    userId: null,
    viewerRole: "U",
    mainCharacterId: null,
    now: NOW,
  });

  assert.deepEqual(summary, {
    items: [],
    totalCount: 0,
    domains: [],
    unavailableDomains: [],
  });
});

test("거래는 EXCHANGE OPEN 중 현재 revision을 본인이 미확정한 MAIN 건만 조회한다", () => {
  assert.match(dbSource, /kind: "EXCHANGE"/);
  assert.match(dbSource, /status: "OPEN"/);
  assert.match(dbSource, /"initiator\.characterId": input\.mainCharacterId/);
  assert.match(dbSource, /"counterparty\.characterId": input\.mainCharacterId/);
  assert.match(
    dbSource,
    /\$ifNull: \["\$initiatorConfirmedRevision", -1\][\s\S]*"\$revision"/,
  );
  assert.match(
    dbSource,
    /\$ifNull: \["\$counterpartyConfirmedRevision", -1\][\s\S]*"\$revision"/,
  );
  assert.doesNotMatch(dbSource, /kind: "GIFT"/);
});

test("공방·연구 조회는 소유 MAIN과 실제 행동 가능 조건을 DB 경계에 둔다", () => {
  assert.match(
    dbSource,
    /userId: input\.userId,[\s\S]*characterId: input\.mainCharacterId,[\s\S]*status: "QUOTED"/,
  );
  assert.match(dbSource, /readyAt: \{ \$lte: input\.now \}/);
  assert.match(
    dbSource,
    /"quote\.approvalGate": \{ \$exists: false \}/,
  );
  assert.match(
    dbSource,
    /destination: "CHARACTER",[\s\S]*status: "CLAIMABLE",[\s\S]*claimDeadline: \{ \$gt: input\.now \}/,
  );
  assert.match(dbSource, /!isResearchLabMutationConfigured\(\)/);
  assert.doesNotMatch(dbSource, /isResearchLabProductionRuntimeReady/);
  assert.ok(
    dbSource.indexOf("if (!input.mainCharacterId)") <
      dbSource.indexOf("!isResearchLabMutationConfigured()"),
  );
});

test("관리 업무는 GM에서만 활성화하고 내부 메모·거래 제안은 DTO로 복사하지 않는다", () => {
  assert.match(serviceSource, /const isGM = input\.viewerRole === "GM"/);
  assert.match(serviceSource, /includeAdmin: isGM/);
  for (const privateField of [
    "internalNote",
    "operatorNote",
    "initiatorOffer",
    "counterpartyOffer",
    "details: row.details",
  ]) {
    assert.doesNotMatch(serviceSource, new RegExp(privateField));
  }
});


const ts = createRequire(import.meta.url)("typescript");
const compiledService = ts.transpileModule(serviceSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function serviceHarness({ locked = [], locksFail = false, failed = [] } = {}) {
  const calls = [];
  const load = (domain) => async (input) => {
    calls.push({ domain, input });
    if (failed.includes(domain)) throw new Error("test unavailable");
    return { items: [], totalCount: 0 };
  };
  const dependencies = {
    "@/components/erp/nav-config": { isNavPathLocked: (path) => locked.includes(path) },
    "@/lib/db/erp-page-locks": { getErpPageLockOverrides: async () => { if (locksFail) throw new Error("test lock error"); return {}; } },
    "@/lib/auth/player-service-test-access": { hasPlayerServiceTestPathAccess: (user,path) => user.role === "J" && user.username === "JTEST" && path === "/erp/equipment-shop/custom" },
    "@/lib/db/dashboard-actions": { readDashboardWorkshopActions: load("workshop"), readDashboardTradeActions: load("trades"), readDashboardResearchActions: load("research") },
  };
  const exports = {};
  vm.runInNewContext(compiledService, { exports, Date, Error, URLSearchParams, require: (name) => { assert(name in dependencies, name); return dependencies[name]; } });
  return { get: exports.getDashboardActionSummary, calls };
}
const actor = { userId:"owner", viewerRole:"J", mainCharacterId:"main", now:NOW };

test("운영 잠금은 해당 도메인의 IO 자체를 생략하며 테스트 예외는 기존 공방 경로만 허용한다", async () => {
  const locked = ["/erp/equipment-shop/custom", "/erp/trades", "/erp/research"];
  const ordinary = serviceHarness({ locked });
  assert.equal((await ordinary.get(actor)).totalCount, 0);
  assert.deepEqual(ordinary.calls, []);
  const testAccount = serviceHarness({ locked });
  await testAccount.get({ ...actor, username:"JTEST" });
  assert.deepEqual(testAccount.calls.map(c=>c.domain), ["workshop"]);
  assert.equal(testAccount.calls[0].input.includeAdmin, false);
});

test("MAIN 없음은 개인 IO를 생략하고 GM만 MAIN 없이 운영 접수함을 조회한다", async () => {
  const ordinary = serviceHarness();
  await ordinary.get({ ...actor, mainCharacterId:null });
  assert.deepEqual(ordinary.calls, []);
  const gm = serviceHarness({ locksFail:true });
  await gm.get({ ...actor, viewerRole:"GM", mainCharacterId:null });
  assert.equal(gm.calls.find(c=>c.domain==="workshop").input.includeAdmin, true);
  assert.equal(gm.calls.find(c=>c.domain==="workshop").input.mainCharacterId, null);
});

test("업무 하나의 조회 실패와 잠금 정책 조회 실패는 0건으로 은폐하지 않는다", async () => {
  const partial = serviceHarness({ failed:["trades"] });
  const summary = await partial.get(actor);
  assert.equal(summary.unavailableDomains.join(), "trades");
  assert.equal(summary.domains[0].count, null);
  const closed = serviceHarness({ locksFail:true });
  const unavailable = await closed.get(actor);
  assert.equal(unavailable.unavailableDomains.length, 3);
  assert.deepEqual(closed.calls, []);
  const gm = serviceHarness({ failed:["workshop"] });
  assert.equal((await gm.get({...actor,viewerRole:"GM"})).domains[0].href,"/erp/admin/equipment-workshop");
});
