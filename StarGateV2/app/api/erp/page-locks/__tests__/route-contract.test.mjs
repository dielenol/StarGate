import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = new URL("../route.ts", import.meta.url);
const PROXY = new URL("../../../../../proxy.ts", import.meta.url);
const CLIENT_GATE = new URL(
  "../../../../../components/erp/PageLockControl/PageLockGate.tsx",
  import.meta.url,
);

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
    /requestHeaders\.set\("x-stargate-erp-pathname", request\.nextUrl\.pathname\)/,
  );
  assert.match(source, /NextResponse\.next\(\{[\s\S]*request: \{ headers: requestHeaders \}/);
});

test("client navigation과 polling 상태 변경도 페이지 잠금 gate를 통과한다", async () => {
  const source = await readFile(CLIENT_GATE, "utf8");

  assert.match(source, /usePathname\(\)/);
  assert.match(source, /usePageLocks\(/);
  assert.match(source, /isNavPathLocked\(pathname, pageLocks\?\.overrides\)/);
  assert.match(source, /return <PageLockedState/);
});
