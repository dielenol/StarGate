import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../../../../", import.meta.url);

function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("v2 GET과 POST는 active session의 GM 역할을 서버에서 다시 검사한다", async () => {
  const [statusRoute, actionRoute] = await Promise.all([
    readWeb("app/api/erp/admin/vtt-hosts/route.ts"),
    readWeb("app/api/erp/admin/vtt-hosts/actions/route.ts"),
  ]);
  for (const source of [statusRoute, actionRoute]) {
    const sessionIndex = source.indexOf("await getActiveSession()");
    const roleIndex = source.indexOf('hasRole(session.user.role, "GM")');
    assert.ok(sessionIndex >= 0);
    assert.ok(roleIndex > sessionIndex);
    assert.match(source, /status: 401/);
    assert.match(source, /status: 403/);
    assert.match(source, /export const runtime = "nodejs"/);
  }
});

test("v2 POST는 same-origin과 유효한 request ID 뒤에만 controller를 호출한다", async () => {
  const route = await readWeb("app/api/erp/admin/vtt-hosts/actions/route.ts");
  const originIndex = route.indexOf("requestIsSameOrigin(request)");
  const keyIndex = route.indexOf("readIdempotencyKey(request)");
  const actionIndex = route.indexOf("await performVttHostAction(");
  assert.ok(originIndex >= 0);
  assert.ok(keyIndex > originIndex);
  assert.ok(actionIndex > keyIndex);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /Idempotency-Key/);
  assert.equal((route.match(/performVttHostAction\(/g) || []).length, 1);
});

test("성공한 경로·동기화 접수는 durable GM audit에 request ID로 중복 방지 기록한다", async () => {
  const route = await readWeb("app/api/erp/admin/vtt-hosts/actions/route.ts");
  const actionIndex = route.indexOf("await performVttHostAction(");
  const auditIndex = route.indexOf("await scheduleGmAdminAudit(");
  assert.ok(actionIndex >= 0);
  assert.ok(auditIndex > actionIndex);
  assert.match(route, /dedupeKey: `vtt-host:\$\{requestId\}`/);
  assert.match(route, /Nochichim VTT \$\{actionLabel\} 요청 접수/);
  assert.match(route, /action: "SELECT_ROUTE"/);
  assert.match(route, /action: "SYNC_DATA"/);
  assert.match(route, /timestamp: new Date\(result\.body\.requestedAt\)/);
  assert.doesNotMatch(route, /timestamp: new Date\(\)/);
  assert.match(route, /auditRecorded = false/);
  assert.match(route, /status: result\.status/);
});

test("완료 status는 조회와 독립 Cron에서 같은 durable audit 조정을 사용한다", async () => {
  const [route, audit, cron, vercelConfigSource] = await Promise.all([
    readWeb("app/api/erp/admin/vtt-hosts/route.ts"),
    readWeb("lib/vtt-runtime/host-audit.ts"),
    readWeb("app/api/cron/vtt-host-audits/route.ts"),
    readWeb("vercel.json"),
  ]);
  assert.match(route, /reconcileCompletedVttHostAudit\(status\)/);
  assert.match(audit, /"ROUTE_SELECTED"/);
  assert.match(audit, /"DATA_SYNCED"/);
  assert.match(audit, /status\.completedActions/);
  assert.doesNotMatch(audit, /status\.lastAction/);
  assert.match(audit, /missingActions\.map\(action => scheduleGmAdminAudit/);
  assert.match(audit, /findMissingGmAdminAuditDedupeKeys/);
  const enqueueIndex = audit.indexOf("await Promise.all(missingActions.map");
  const ackIndex = audit.lastIndexOf("await acknowledgeVttHostAudits(");
  assert.ok(enqueueIndex >= 0);
  assert.ok(ackIndex > enqueueIndex);
  assert.match(audit, /"이전 공개 경로"/);
  assert.match(audit, /"데이터 원본"/);
  assert.match(audit, /"선택 공개 경로"/);
  assert.match(audit, /"데이터 대상"/);
  assert.match(audit, /action\.sourceRevision/);
  assert.match(audit, /return `vtt-host-completed:\$\{requestId\}`/);
  assert.match(audit, /dedupeKey: completedAuditDedupeKey\(action\.requestId\)/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /reconcileCompletedVttHostAudit\(status\)/);
  const vercelConfig = JSON.parse(vercelConfigSource);
  assert.deepEqual(
    vercelConfig.crons.find(entry => entry.path === "/api/cron/vtt-host-audits"),
    { path: "/api/cron/vtt-host-audits", schedule: "10 18 * * *" },
  );
});

test("브라우저는 분리된 경로·동기화·VPS 앱 제어 계약을 고정한다", async () => {
  const [query, mutation, client, page] = await Promise.all([
    readWeb("hooks/queries/useVttHostStatusQuery.ts"),
    readWeb("hooks/mutations/useVttHostMutation.ts"),
    readWeb("app/(erp)/erp/admin/vtt/VttHostControlClient.tsx"),
    readWeb("app/(erp)/erp/admin/vtt/page.tsx"),
  ]);
  assert.match(query, /\? 2_000 : 15_000/);
  assert.match(mutation, /retry: false/);
  assert.match(mutation, /Idempotency-Key/);
  assert.match(client, /action: "SELECT_ROUTE"/);
  assert.match(client, /action: "SYNC_DATA"/);
  assert.match(client, /confirmationText !== "동기화"/);
  assert.doesNotMatch(client, /force: true/);
  assert.match(client, /targetHost === "HOME"/);
  assert.match(client, /status\.routeHost !== "OFFLINE"/);
  assert.match(client, /status\.hosts\.VPS\.state !== "STOPPED"/);
  assert.match(client, /status\.hosts\.HOME\.reachable && status\.hosts\.HOME\.state !== "STOPPED"/);
  assert.match(client, /cloudflared tunnel run nochichim/);
  assert.match(client, /status\.state === "RECOVERY_REQUIRED"/);
  assert.match(client, /status\.auditBacklogBlocked/);
  assert.match(client, /status\.routeHost === "OFFLINE" && bothAppsStopped/);
  assert.match(client, /status\.hosts\[host\]\.reachable && status\.hosts\[host\]\.state === "STOPPED"/);
  assert.match(client, /if \(globallyLocked \|\| status\.routeHost === targetHost\) return true/);
  assert.match(page, /isVttHostControlModeEnabled\(\)/);
  assert.match(page, /Promise\.all/);
  assert.match(page, /VttHostControlClient/);
  assert.match(page, /VttRuntimeClient/);
});

test("제어 URL과 인증 비밀값은 server-only client 밖으로 노출하지 않는다", async () => {
  const [serverClient, browserClient, publicTypes] = await Promise.all([
    readWeb("lib/vtt-runtime/host-control-client.ts"),
    readWeb("app/(erp)/erp/admin/vtt/VttHostControlClient.tsx"),
    readWeb("types/vtt-host-control.ts"),
  ]);
  assert.match(serverClient, /import "server-only"/);
  assert.match(serverClient, /CF-Access-Client-Secret/);
  assert.match(serverClient, /NOCHICHIM_HOST_CONTROL_HMAC_SECRET/);
  assert.doesNotMatch(browserClient, /control\.nochiijjim\.com|CF-Access|HMAC_SECRET/);
  assert.doesNotMatch(publicTypes, /controlUrl|hmacSecret|cfAccess/i);
});
