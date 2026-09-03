import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WEB_ROOT = new URL("../../../../../../", import.meta.url);

function readWeb(relativePath) {
  return readFile(new URL(relativePath, WEB_ROOT), "utf8");
}

test("GET과 POST는 active session의 GM 역할을 서버에서 다시 검사한다", async () => {
  const [statusRoute, actionRoute] = await Promise.all([
    readWeb("app/api/erp/admin/vtt-runtime/route.ts"),
    readWeb("app/api/erp/admin/vtt-runtime/actions/route.ts"),
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

test("POST는 same-origin과 유효한 request ID를 제어 호출 전에 검사한다", async () => {
  const route = await readWeb("app/api/erp/admin/vtt-runtime/actions/route.ts");
  const originIndex = route.indexOf("requestIsSameOrigin(request)");
  const keyIndex = route.indexOf("readIdempotencyKey(request)");
  const actionIndex = route.indexOf("await performVttRuntimeAction(");
  assert.ok(originIndex >= 0);
  assert.ok(keyIndex > originIndex);
  assert.ok(actionIndex > keyIndex);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /Idempotency-Key/);
});

test("분리 모드의 VPS START는 공개 VPS 경로와 HOME 정지를 서버에서 먼저 확인한다", async () => {
  const route = await readWeb("app/api/erp/admin/vtt-runtime/actions/route.ts");
  const modeIndex = route.indexOf("isVttHostControlModeEnabled()");
  const statusIndex = route.indexOf("await getVttHostStatus()");
  const actionIndex = route.indexOf("await performVttRuntimeAction(");
  assert.ok(modeIndex >= 0);
  assert.ok(statusIndex > modeIndex);
  assert.ok(actionIndex > statusIndex);
  assert.match(route, /hostStatus\.routeHost !== "VPS"/);
  assert.match(route, /hostStatus\.hosts\.HOME\.reachable &&/);
  assert.match(route, /hostStatus\.hosts\.HOME\.state !== "STOPPED"/);
  assert.match(route, /!hostStatus\.hosts\.VPS\.reachable/);
  assert.match(route, /hostStatus\.hosts\.VPS\.sourceRevision !== hostStatus\.expectedSourceRevision/);
  assert.match(route, /VPS_REVISION_MISMATCH/);
  assert.match(route, /input\.homeStoppedConfirmed !== true/);
  assert.match(route, /HOME_STOP_UNCONFIRMED/);
  assert.match(route, /HOST_OPERATION_LOCKED/);
});

test("성공한 조작은 request ID dedupe 감사로 기록하고 감사 실패는 재조작하지 않는다", async () => {
  const [route, audit] = await Promise.all([
    readWeb("app/api/erp/admin/vtt-runtime/actions/route.ts"),
    readWeb("lib/notifications/gm-admin-audit.ts"),
  ]);
  const actionIndex = route.indexOf("await performVttRuntimeAction(");
  const auditIndex = route.indexOf("await scheduleGmAdminAudit(");
  assert.ok(actionIndex >= 0);
  assert.ok(auditIndex > actionIndex);
  assert.match(route, /dedupeKey: `vtt-runtime:\$\{requestId\}`/);
  assert.match(route, /auditRecorded = false/);
  assert.equal((route.match(/performVttRuntimeAction\(/g) || []).length, 1);
  assert.match(audit, /dedupeKey\?: string/);
});

test("브라우저 UI는 15초·전환 2초 polling, mutation 무재시도, 종료 재확인을 고정한다", async () => {
  const [query, mutation, client, nav] = await Promise.all([
    readWeb("hooks/queries/useVttRuntimeStatusQuery.ts"),
    readWeb("hooks/mutations/useVttRuntimeMutation.ts"),
    readWeb("app/(erp)/erp/admin/vtt/VttRuntimeClient.tsx"),
    readWeb("components/erp/nav-config.ts"),
  ]);
  assert.match(query, /\? 2_000 : 15_000/);
  assert.match(mutation, /retry: false/);
  assert.match(mutation, /Idempotency-Key/);
  assert.match(client, /error\.code === "ACTIVE_CONNECTIONS"/);
  assert.match(client, /confirmationText !== "종료"/);
  assert.match(client, /force: true/);
  assert.match(client, /startConfirmationText !== "HOME 종료"/);
  assert.match(client, /homeStoppedConfirmed: true/);
  assert.match(client, /status\.state === "UNREACHABLE"/);
  assert.match(nav, /href: "\/erp\/admin\/vtt"/);
});

test("제어 비밀값과 host는 server-only client에만 있고 공개 타입에 나타나지 않는다", async () => {
  const [controlClient, browserClient, publicTypes] = await Promise.all([
    readWeb("lib/vtt-runtime/control-client.ts"),
    readWeb("app/(erp)/erp/admin/vtt/VttRuntimeClient.tsx"),
    readWeb("types/vtt-runtime.ts"),
  ]);
  assert.match(controlClient, /import "server-only"/);
  assert.match(controlClient, /CF-Access-Client-Secret/);
  assert.match(controlClient, /NOCHICHIM_CONTROL_HMAC_SECRET/);
  assert.doesNotMatch(browserClient, /control\.nochiijjim\.com|CF-Access|HMAC_SECRET/);
  assert.doesNotMatch(publicTypes, /controlUrl|hmacSecret|cfAccess/i);
});
