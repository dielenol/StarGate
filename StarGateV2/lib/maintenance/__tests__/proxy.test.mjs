import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as schedule from "../schedule.ts";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const source = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function loadProxy(now) {
  let authCalls = 0;
  const exports = {};
  const modules = {
    "next/server": { NextResponse },
    "next-auth/jwt": { getToken: async () => { authCalls++; throw new Error("unexpected auth lookup"); } },
    "@/lib/auth/callback-url": { safeCallbackUrl: (path) => path },
    "@/lib/auth/guest": { isGuestRestrictedErpRequest: () => false },
    "@/lib/auth/session-runtime": { readAuthSecrets: () => { authCalls++; return []; } },
    "@/lib/erp/local-page-lock-bypass": { buildTrustedErpRequestHeaders: (headers) => headers },
    "@/lib/maintenance/schedule": { ...schedule, getMaintenanceState: () => schedule.getMaintenanceState({}, now) },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => { assert.ok(id in modules, `unexpected module ${id}`); return modules[id]; },
    URL, process: { env: {} },
  });
  return { proxy: exports.proxy, authCalls: () => authCalls };
}

const start = Date.parse(schedule.ERP_MAINTENANCE_WINDOW.startsAt);
const end = Date.parse(schedule.ERP_MAINTENANCE_WINDOW.endsAt);

test("활성 점검은 로그인·GM 형태 쿠키·로컬 우회·RSC 요청보다 먼저 차단한다", async () => {
  const fixture = loadProxy(start);
  for (const path of ["/erp", "/erp/characters/123", "/erp/admin/users?_rsc=probe"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await fixture.proxy(new NextRequest(`http://localhost:43849${path}`, {
        method,
        headers: { Cookie: "authjs.session-token=synthetic-not-a-token", RSC: "1", "x-stargate-erp-local-access": "1" },
      }));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "http://localhost:43849/maintenance");
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("retry-after"), "57600");
    }
  }
  assert.equal(fixture.authCalls(), 0);
});

test("모든 ERP API 메서드와 page Server Action은 실행 전에 503을 받는다", async () => {
  const fixture = loadProxy(start);
  for (const path of ["/api/erp", "/api/erp/credits", "/api/erp/inventory/123"]) {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await fixture.proxy(new NextRequest(`http://localhost:43849${path}`, { method }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "ERP_MAINTENANCE");
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  }
  const action = await fixture.proxy(new NextRequest("http://localhost:43849/erp", { method: "POST", headers: { "Next-Action": "synthetic-probe" } }));
  assert.equal(action.status, 503);
  assert.equal(fixture.authCalls(), 0);
});

test("점검 전·종료 경계에는 기존 인증과 라우팅으로 복귀한다", async () => {
  for (const now of [start - 1, end]) {
    const { proxy } = loadProxy(now);
    const page = await proxy(new NextRequest("http://localhost:43849/erp"));
    assert.equal(page.headers.get("location"), "http://localhost:43849/login");
    const api = await proxy(new NextRequest("http://localhost:43849/api/erp/dashboard"));
    assert.equal(api.headers.get("x-middleware-next"), "1");
    assert.equal(api.headers.get("vary"), "Cookie");
  }
});

test("공개 메인·로그인·점검 조회·유사 접두 경로는 격리 대상이 아니다", async () => {
  const { proxy } = loadProxy(start);
  for (const path of ["/", "/world", "/login", "/api/maintenance", "/api/auth/session", "/erplease", "/api/erplease"]) {
    const response = await proxy(new NextRequest(`http://localhost:43849${path}`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
});
