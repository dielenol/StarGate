import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CREATE_ROUTE = new URL("../route.ts", import.meta.url);
const UPDATE_ROUTE = new URL("../[id]/route.ts", import.meta.url);
const CREATE_FORM = new URL(
  "../../../../(erp)/erp/sessions/report/new/ReportCreateForm.tsx",
  import.meta.url,
);
const UPDATE_FORM = new URL(
  "../../../../(erp)/erp/sessions/report/[id]/edit/ReportEditForm.tsx",
  import.meta.url,
);
const SHARED_CRUD_ROOT = new URL(
  "../../../../../../packages/shared-db/src/crud/",
  import.meta.url,
);

test("보고서 생성·수정 API가 검증된 구조화 링크만 CRUD로 전달한다", async () => {
  const [createRoute, updateRoute, sharedCrud] = await Promise.all([
    readFile(CREATE_ROUTE, "utf8"),
    readFile(UPDATE_ROUTE, "utf8"),
    readFile(new URL("session-reports.ts", SHARED_CRUD_ROOT), "utf8"),
  ]);

  for (const source of [createRoute, updateRoute]) {
    assert.match(source, /validateSessionReportReferences\(body\)/u);
    assert.match(source, /if \("error" in references\) return references\.error/u);
  }
  assert.match(createRoute, /\.\.\.references\.value/u);
  assert.match(updateRoute, /Object\.assign\(update, references\.value\)/u);
  for (const source of [createRoute, updateRoute]) {
    assert.match(
      source,
      /describeSessionReportReferenceTargetIssues\(error\.issues\)/u,
    );
    assert.match(source, /SessionReportReferenceTargetError/u);
  }
  assert.match(sharedCrud, /validateAndLockSessionReportWrite\(/u);
  assert.match(sharedCrud, /SessionReportAlreadyExistsError/u);
  assert.match(
    sharedCrud,
    /const duplicate = await col\.findOne\(\s*\{ sessionId \}/u,
  );
  assert.match(sharedCrud, /findSessionReportReferenceTargetIssues\(/u);
  assert.match(sharedCrud, /lockSessionReportReferenceTargets\(/u);
});

test("보고서 조회는 역할·target 정제를 거치고 shared 수정이 전체 최종 참조를 재검증한다", async () => {
  const [updateRoute, sharedCrud] = await Promise.all([
    readFile(UPDATE_ROUTE, "utf8"),
    readFile(new URL("session-reports.ts", SHARED_CRUD_ROOT), "utf8"),
  ]);
  assert.match(
    updateRoute,
    /findVisibleReportById\(id, session\.user\.role\)/u,
  );
  const visibleReadFunction = sharedCrud.slice(
    sharedCrud.indexOf("export async function findVisibleReportById("),
    sharedCrud.indexOf("export async function createSessionReport("),
  );
  assert.match(
    visibleReadFunction,
    /sanitizeSessionReportReferencesForPublicTargets\(\[report\], options\)/u,
  );
  assert.match(sharedCrud, /const current = await col\.findOne/u);
  assert.match(sharedCrud, /const finalReferences: SessionReportReferences/u);
  assert.match(
    sharedCrud,
    /current\[field\] \?\? \[\]/u,
  );
  const updateFunction = sharedCrud.slice(
    sharedCrud.indexOf("export async function updateSessionReport("),
    sharedCrud.indexOf("export async function deleteSessionReport("),
  );
  assert.match(
    updateFunction,
    /validateAndLockSessionReportReferences\(\s*finalReferences/u,
  );
  assert.doesNotMatch(updateFunction, /validateAndLockSessionReportWrite\(/u);
});

test("보고서 생성의 post-commit 알림 실패는 생성 성공 응답을 뒤집지 않는다", async () => {
  const createRoute = await readFile(CREATE_ROUTE, "utf8");
  const notifyPosition = createRoute.indexOf("await notifyActiveUsers(");
  const successPosition = createRoute.indexOf(
    "return NextResponse.json({ report }, { status: 201 })",
  );
  assert.ok(notifyPosition > -1 && successPosition > notifyPosition);
  assert.match(
    createRoute.slice(notifyPosition, successPosition),
    /catch \(notificationError\)[\s\S]*?console\.error/u,
  );
});

test("보고서 생성·수정 화면이 구조화 링크를 mutation 입력에 포함한다", async () => {
  const [createForm, updateForm] = await Promise.all([
    readFile(CREATE_FORM, "utf8"),
    readFile(UPDATE_FORM, "utf8"),
  ]);

  for (const source of [createForm, updateForm]) {
    assert.match(source, /<ReportReferenceFields/u);
    assert.match(source, /parseSessionReportReferenceTexts\(referenceTexts\)/u);
    assert.match(source, /\.\.\.references\.value/u);
  }
});

test("참조 target의 삭제·식별자·공개상태 변경은 inbound report와 transaction 경합을 차단한다", async () => {
  const [wikiCrud, characterCrud, inventoryCrud, wikiRoute, characterRoute] =
    await Promise.all([
      readFile(new URL("wiki.ts", SHARED_CRUD_ROOT), "utf8"),
      readFile(new URL("characters.ts", SHARED_CRUD_ROOT), "utf8"),
      readFile(new URL("inventory.ts", SHARED_CRUD_ROOT), "utf8"),
      readFile(
        new URL("../../wiki/[id]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../characters/[id]/route.ts", import.meta.url),
        "utf8",
      ),
    ]);

  for (const source of [wikiCrud, characterCrud, inventoryCrud]) {
    assert.match(source, /lockAndAssertNoSessionReportInboundReference\(/u);
    assert.match(source, /withTransaction\(/u);
  }
  for (const source of [wikiRoute, characterRoute]) {
    assert.match(source, /SessionReportInboundReferenceError/u);
    assert.match(source, /status: 409/u);
  }
});

test("등록 세션 source 삭제도 transaction lock과 inbound report 검사로 차단한다", async () => {
  const sessionsCrud = await readFile(
    new URL("sessions.ts", SHARED_CRUD_ROOT),
    "utf8",
  );
  const deleteFunction = sessionsCrud.slice(
    sessionsCrud.indexOf("export async function deleteSessionById("),
    sessionsCrud.indexOf("export async function updateSessionStatusIfCurrent("),
  );
  assert.match(deleteFunction, /withTransaction\(/u);
  assert.match(deleteFunction, /reportReferenceRevision/u);
  assert.match(deleteFunction, /collection\("session_reports"\)\.findOne/u);
  assert.match(deleteFunction, /SessionReportSourceInboundReferenceError/u);
});
