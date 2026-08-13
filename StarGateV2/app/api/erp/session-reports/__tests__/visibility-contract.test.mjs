import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  listPage: new URL("../../../../(erp)/erp/sessions/report/page.tsx", import.meta.url),
  detailPage: new URL("../../../../(erp)/erp/sessions/report/[id]/page.tsx", import.meta.url),
  editPage: new URL("../../../../(erp)/erp/sessions/report/[id]/edit/page.tsx", import.meta.url),
  listApi: new URL("../route.ts", import.meta.url),
  detailApi: new URL("../[id]/route.ts", import.meta.url),
  wikiDetail: new URL("../../../../(erp)/erp/wiki/[id]/page.tsx", import.meta.url),
  catalogDetail: new URL("../../../../(erp)/erp/wiki/catalog/item/[key]/page.tsx", import.meta.url),
  personnelPage: new URL("../../../../(erp)/erp/personnel/[id]/page.tsx", import.meta.url),
  personnelApi: new URL("../../personnel/[id]/route.ts", import.meta.url),
  personnelLinks: new URL("../../../../../lib/personnel-related-reports.ts", import.meta.url),
  loreSearch: new URL("../../../../../lib/db/lore-search.ts", import.meta.url),
};

async function sources() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, url]) => [key, await readFile(url, "utf8")]),
    ),
  );
}

test("보고서 본문·목록·역링크 소비자는 서버에서 viewer role을 전달한다", async () => {
  const source = await sources();
  assert.match(source.listPage, /listVisibleSessionReports\(session\.user\.role\)/u);
  assert.match(source.detailPage, /findVisibleReportById\(id, session\.user\.role\)/u);
  assert.match(source.detailPage, /listVisibleSessionReportRefs\(session\.user\.role\)/u);
  assert.match(source.editPage, /findVisibleReportById\(id, session\.user\.role\)/u);
  assert.match(source.listApi, /listVisibleSessionReports\(session\.user\.role\)/u);
  assert.match(source.listApi, /buildClientSessionReportList\(reports\)/u);

  const getHandler = source.detailApi.slice(
    source.detailApi.indexOf("export async function GET"),
    source.detailApi.indexOf("export async function PATCH"),
  );
  const patchHandler = source.detailApi.slice(
    source.detailApi.indexOf("export async function PATCH"),
    source.detailApi.indexOf("export async function DELETE"),
  );
  assert.match(getHandler, /findVisibleReportById\(id, session\.user\.role\)/u);
  assert.match(patchHandler, /findVisibleReportById\(id, session\.user\.role\)/u);

  assert.match(source.wikiDetail, /listVisibleSessionReportRefs\(session\.user\.role\)/u);
  assert.match(source.catalogDetail, /listVisibleSessionReports\(session\.user\.role\)/u);
  assert.match(source.personnelPage, /session\.user\.role/u);
  assert.match(source.personnelApi, /session\.user\.role/u);
  assert.match(source.personnelLinks, /findSessionReportsForPersonnel\([\s\S]*viewerRole/u);
});

test("통합 검색은 index live-check와 fallback 모두 report visibility를 강제한다", async () => {
  const { loreSearch } = await sources();
  assert.ok(
    loreSearch.match(/sessionReportVisibilityFilter\(viewer\.role\)/gu)?.length >= 2,
  );
  assert.ok(
    loreSearch.match(/isSessionReportVisibleToRole\(doc, "U"\)/gu)?.length >= 2,
  );
});
