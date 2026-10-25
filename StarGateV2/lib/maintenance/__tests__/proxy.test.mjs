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

function loadProxy(now, env = {}) {
  let authCalls = 0;
  const exports = {};
  const modules = {
    "next/server": { NextResponse },
    "next-auth/jwt": { getToken: async () => { authCalls++; throw new Error("unexpected auth lookup"); } },
    "@/lib/auth/callback-url": { safeCallbackUrl: (path) => path },
    "@/lib/auth/guest": { isGuestRestrictedErpRequest: () => false },
    "@/lib/auth/session-runtime": { readAuthSecrets: () => { authCalls++; return []; } },
    "@/lib/erp/local-page-lock-bypass": { buildTrustedErpRequestHeaders: (headers) => headers },
    "@/lib/maintenance/schedule": { ...schedule, getMaintenanceState: () => schedule.getMaintenanceState(env, now) },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => { assert.ok(id in modules, `unexpected module ${id}`); return modules[id]; },
    URL, process: { env: { NODE_ENV: "production" } },
  });
  return { proxy: exports.proxy, config: exports.config, authCalls: () => authCalls };
}

const start = Date.parse(schedule.ERP_MAINTENANCE_WINDOW.startsAt);
const end = Date.parse(schedule.ERP_MAINTENANCE_WINDOW.endsAt);

test("공개·로그인·ERP·확장자 경로가 권한·RSC 헤더보다 먼저 봉쇄된다", async () => {
  const fixture = loadProxy(start);
  assert.deepEqual(Array.from(fixture.config.matcher), ["/:path*"]);
  for (const path of ["/", "/world", "/login", "/apply", "/survey/x", "/erp", "/erp/admin/users?_rsc=probe", "/download.json", "/assets/probe.html", "/_next/data/id/index.json"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await fixture.proxy(new NextRequest(`http://localhost:43849${path}`, {
        method,
        headers: { Cookie: "authjs.session-token=synthetic-not-a-token", RSC: "1", "x-stargate-erp-local-access": "1" },
      }));
      assert.equal(response.status, 307, path);
      assert.equal(response.headers.get("location"), "http://localhost:43849/maintenance");
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  }
  assert.equal(fixture.authCalls(), 0);
});

test("인증·ERP·cron·worker를 포함한 모든 API 메서드와 Server Action을 차단한다", async () => {
  const fixture = loadProxy(start);
  for (const path of ["/api", "/api/erp", "/api/auth/session", "/api/auth/callback/credentials", "/api/cron/test", "/api/worker/test", "/api/vtt/test", "/api/maintenance/write"]) {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const response = await fixture.proxy(new NextRequest(`http://localhost:43849${path}`, { method }));
      assert.equal(response.status, 503, `${path} ${method}`);
      const payload = await response.json();
      assert.equal(payload.code, "SITE_MAINTENANCE");
      assert.equal(payload.resumePolicy, "manual");
      assert.equal(payload.endsAt, undefined);
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
  }
  for (const path of ["/", "/erp", "/maintenance", "/api/maintenance", "/_next/static/probe.js", "/assets/StarGate_logo_watermark.webp"]) {
    const action = await fixture.proxy(new NextRequest(`http://localhost:43849${path}`, { method: "POST", headers: { "Next-Action": "synthetic-probe" } }));
    assert.equal(action.status, 503, path);
  }
  assert.equal(fixture.authCalls(), 0);
});

test("안내 시각 및 2개월 이후도 차단하며 명시적 해제만 원래 경로로 복귀한다", async () => {
  for (const now of [end, end + 62 * 86_400_000]) {
    const { proxy } = loadProxy(now);
    assert.equal((await proxy(new NextRequest("http://localhost:43849/"))).status, 307);
    assert.equal((await proxy(new NextRequest("http://localhost:43849/api/erp/dashboard"))).status, 503);
  }
  for (const [now, env] of [[start - 1, {}], [end, { ERP_MAINTENANCE_DISABLED: "1" }]]) {
    const { proxy } = loadProxy(now, env);
    assert.equal((await proxy(new NextRequest("http://localhost:43849/"))).headers.get("x-middleware-next"), "1");
    const page = await proxy(new NextRequest("http://localhost:43849/erp"));
    assert.equal(page.headers.get("location"), "http://localhost:43849/login");
    const api = await proxy(new NextRequest("http://localhost:43849/api/erp/dashboard"));
    assert.equal(api.headers.get("x-middleware-next"), "1");
    assert.equal(api.headers.get("vary"), "Cookie");
  }
});

test("공지와 필요한 정적 리소스의 읽기만 통과한다", async () => {
  const { proxy } = loadProxy(start);
  for (const path of ["/maintenance", "/api/maintenance", "/_next/static/chunks/app.js", "/assets/StarGate_logo_watermark.webp", "/assets/favicon.ico"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await proxy(new NextRequest(`http://localhost:43849${path}`, { method }));
      assert.equal(response.headers.get("x-middleware-next"), "1", path);
    }
  }
  assert.equal((await proxy(new NextRequest("http://localhost:43849/maintenance/preview"))).status, 307);
});
