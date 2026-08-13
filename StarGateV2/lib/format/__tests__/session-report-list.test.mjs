import assert from "node:assert/strict";
import test from "node:test";

const {
  buildClientSessionReportList,
  getSessionReportMapPoint,
} = await import("../session-report-list.ts");

function report(overrides = {}) {
  return {
    _id: "report-1",
    sessionId: "UNKNOWN-SESSION",
    sessionTitle: "작전 보고서",
    summary: "",
    highlights: [],
    gmName: "기록통제실 A. Tester",
    createdAt: new Date("2026-08-13T00:00:00.000Z"),
    ...overrides,
  };
}

test("저장 좌표를 범위 안으로 보정하고 위치 메타를 유지한다", () => {
  assert.deepEqual(
    getSessionReportMapPoint(
      report({
        mapX: 120,
        mapY: -20,
        locationLabel: "격리 구역",
        mapPrecision: "confirmed",
      }),
      0,
    ),
    {
      x: 100,
      y: 0,
      label: "격리 구역",
      precision: "confirmed",
    },
  );
});

test("legacy 본문 키워드의 한반도·맨해튼 위치 fallback을 보존한다", () => {
  assert.deepEqual(
    getSessionReportMapPoint(report({ summary: "한국 현장 작전" }), 0),
    {
      x: 81.55,
      y: 42,
      label: "한반도 남부",
      precision: "confirmed",
    },
  );
  assert.deepEqual(
    getSessionReportMapPoint(
      report({ highlights: ["Manhattan contact established"] }),
      0,
    ),
    {
      x: 27.5,
      y: 40.4,
      label: "미국 맨해튼",
      precision: "confirmed",
    },
  );
});

test("목록 DTO는 지도에 필요한 필드만 남기고 본문을 제외한다", () => {
  const [item] = buildClientSessionReportList([
    report({
      sessionId: "NOSB-S1E1-ORDER",
      sessionTitle: "작전 기록 S1E1: 질서",
      summary: "긴 본문",
      highlights: ["긴 하이라이트"],
    }),
  ]);

  assert.equal(item.number, "01");
  assert.equal(item.mapPoint.label, "한반도 남부");
  assert.equal(item.createdAt, "2026-08-13T00:00:00.000Z");
  assert.equal("summary" in item, false);
  assert.equal("highlights" in item, false);
});
