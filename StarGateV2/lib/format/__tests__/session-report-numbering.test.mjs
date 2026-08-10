import assert from "node:assert/strict";
import test from "node:test";

const { buildOperationReportNumbering } = await import(
  "../session-report.ts"
);

const createdAt = "2026-07-12T00:00:00.000Z";

test("S1E5 악 2부를 정규 보고서 05.5로 고정한다", () => {
  const reports = [
    {
      sessionId: "NOSB-S1E5-EVIL-PART1",
      sessionTitle: "작전 보고서 S1E5: 악 1부",
      createdAt: "2026-06-28T00:00:00.000Z",
    },
    {
      sessionId: "NOSB-S1E5-EVIL-PART2",
      sessionTitle: "작전 보고서 S1E5: 악 2부",
      createdAt,
    },
  ];

  const numbering = buildOperationReportNumbering(reports);

  assert.equal(
    numbering.find(
      ({ report }) => report.sessionId === "NOSB-S1E5-EVIL-PART1",
    )?.number,
    "05",
  );
  assert.equal(
    numbering.find(
      ({ report }) => report.sessionId === "NOSB-S1E5-EVIL-PART2",
    )?.number,
    "05.5",
  );
});

test("세션 ID가 달라도 S1E5 악 part 2 제목은 05.5 fallback을 쓴다", () => {
  const report = {
    sessionId: "LEGACY-EVIL-PART2",
    sessionTitle: "S1E5 악 part 2",
    createdAt,
  };

  const numbering = buildOperationReportNumbering([report]);

  assert.equal(numbering[0]?.number, "05.5");
});

test("S1E6 변곡점 1부를 정규 보고서 06으로 고정한다", () => {
  const reports = [
    {
      sessionId: "NOSB-S1E5-EVIL-PART2",
      sessionTitle: "작전 보고서 S1E5: 악 2부",
      createdAt: "2026-07-12T00:00:00.000Z",
    },
    {
      sessionId: "NOSB-S1E6-TURNING-POINT-PART1",
      sessionTitle: "작전 보고서 S1E6: 변곡점 1부",
      createdAt: "2026-07-26T00:00:00.000Z",
    },
    {
      sessionId: "NOSB-MINI-S1E1-NEW-DUBLIN",
      sessionTitle: "작전 보고서 MINI01: 뉴 더블린",
      createdAt: "2026-03-01T00:00:00.000Z",
    },
  ];

  const numbering = buildOperationReportNumbering(reports);

  assert.deepEqual(
    numbering.map(({ number }) => number),
    ["05.5", "06", "MINI01"],
  );
});

test("세션 ID가 달라도 변곡점 part 1 제목은 06 fallback을 쓴다", () => {
  const report = {
    sessionId: "LEGACY-TURNING-POINT-PART1",
    sessionTitle: "S1E6 변곡점 part 1",
    createdAt,
  };

  const numbering = buildOperationReportNumbering([report]);

  assert.equal(numbering[0]?.number, "06");
});

test("로맨티드를 미니 시리즈 다섯 번째 보고서로 고정한다", () => {
  const reports = [
    {
      sessionId: "NOSB-MINI-HWAYANGYEONHWA",
      sessionTitle: "작전 보고서 MINI04: 화양연화",
      createdAt: "2026-06-09T00:00:00.000Z",
    },
    {
      sessionId: "NOSB-MINI-ROMANTID",
      sessionTitle: "작전 보고서 MINI05: 로맨티드",
      createdAt: "2026-07-19T00:00:00.000Z",
    },
  ];

  const numbering = buildOperationReportNumbering(reports);

  assert.deepEqual(
    numbering.map(({ number }) => number),
    ["MINI04", "MINI05"],
  );
});

test("세션 ID가 달라도 로맨티드 제목은 MINI05 fallback을 쓴다", () => {
  const report = {
    sessionId: "LEGACY-ROMANTID",
    sessionTitle: "Romantid 미니세션",
    createdAt,
  };

  const numbering = buildOperationReportNumbering([report]);

  assert.equal(numbering[0]?.number, "MINI05");
});
