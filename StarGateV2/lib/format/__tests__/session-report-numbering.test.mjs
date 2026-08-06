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
