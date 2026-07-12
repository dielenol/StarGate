import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = new URL("../route.ts", import.meta.url);
const PROXY = new URL("../../../../../proxy.ts", import.meta.url);
const CLIENT_GATE = new URL(
  "../../../../../components/erp/PageLockControl/PageLockGate.tsx",
  import.meta.url,
);
const LAYOUT = new URL("../../../../../app/(erp)/layout.tsx", import.meta.url);
const LOCAL_BYPASS = new URL(
  "../../../../../lib/erp/local-page-lock-bypass.ts",
  import.meta.url,
);
const PACKAGE_JSON = new URL("../../../../../package.json", import.meta.url);

test("페이지 잠금 변경은 최신 세션의 GM만 허용한다", async () => {
  const source = await readFile(ROUTE, "utf8");

  assert.match(source, /getActiveSession\(\)/);
  assert.match(source, /session\.user\.role !== "GM"/);
  assert.match(source, /findNavItemByLockKey\(lockKey\)/);
});

test("ERP pathname은 proxy가 신뢰 헤더로 덮어쓴다", async () => {
  const source = await readFile(PROXY, "utf8");

  assert.match(
    source,
    /buildTrustedErpRequestHeaders\(request\.headers/,
  );
  assert.match(source, /pathname: request\.nextUrl\.pathname/);
  assert.match(source, /hostname: request\.nextUrl\.hostname/);
  assert.match(source, /NextResponse\.next\(\{[\s\S]*request: \{ headers: requestHeaders \}/);
  assert.match(source, /matcher: \["\/erp", "\/erp\/:path\*"\]/);
});

test("client navigation과 polling 상태 변경도 페이지 잠금 gate를 통과한다", async () => {
  const source = await readFile(CLIENT_GATE, "utf8");

  assert.match(source, /usePathname\(\)/);
  assert.match(source, /usePageLocks\(/);
  assert.match(source, /!bypassPageLocks &&[\s\S]*isNavPathLocked/);
  assert.match(source, /isNavPathLocked\(pathname, pageLocks\?\.overrides\)/);
  assert.match(source, /return <PageLockedState/);
});

test("로컬 잠금 우회는 development localhost 요청에만 적용한다", async () => {
  const { buildTrustedErpRequestHeaders, shouldBypassPageLocks } =
    await import(LOCAL_BYPASS.href);

  assert.equal(
    shouldBypassPageLocks({ hostname: "localhost", nodeEnv: "development" }),
    true,
  );
  assert.equal(
    shouldBypassPageLocks({ hostname: "127.0.0.1", nodeEnv: "development" }),
    true,
  );
  assert.equal(
    shouldBypassPageLocks({ hostname: "localhost", nodeEnv: "production" }),
    false,
  );
  assert.equal(
    shouldBypassPageLocks({ hostname: "stargate.example", nodeEnv: "development" }),
    false,
  );

  const spoofed = new Headers({ "x-stargate-erp-local-access": "1" });
  const production = buildTrustedErpRequestHeaders(spoofed, {
    pathname: "/erp/factions",
    hostname: "localhost",
    nodeEnv: "production",
  });
  const remoteDevelopment = buildTrustedErpRequestHeaders(spoofed, {
    pathname: "/erp/factions",
    hostname: "192.168.0.5",
    nodeEnv: "development",
  });
  const localDevelopment = buildTrustedErpRequestHeaders(new Headers(), {
    pathname: "/erp/factions",
    hostname: "localhost",
    nodeEnv: "development",
  });

  assert.equal(production.get("x-stargate-erp-local-access"), "0");
  assert.equal(remoteDevelopment.get("x-stargate-erp-local-access"), "0");
  assert.equal(localDevelopment.get("x-stargate-erp-local-access"), "1");
  assert.equal(localDevelopment.get("x-stargate-erp-pathname"), "/erp/factions");
});

test("ERP 레이아웃은 신뢰된 로컬 플래그를 모든 잠금 UI에 전달한다", async () => {
  const source = await readFile(LAYOUT, "utf8");

  assert.match(source, /get\("x-stargate-erp-local-access"\) === "1"/);
  assert.match(source, /!bypassPageLocks &&[\s\S]*isNavPathLocked/);
  assert.match(source, /<ERPSidebar[\s\S]*bypassPageLocks=\{bypassPageLocks\}/);
  assert.match(source, /<PageLockGate[\s\S]*bypassPageLocks=\{bypassPageLocks\}/);
  assert.match(source, /<CommandKDeferred bypassPageLocks=\{bypassPageLocks\}/);
});

test("로컬 개발 서버는 loopback 인터페이스에만 바인딩한다", async () => {
  const packageJson = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));

  assert.match(packageJson.scripts.dev, /--hostname 127\.0\.0\.1/);
});
