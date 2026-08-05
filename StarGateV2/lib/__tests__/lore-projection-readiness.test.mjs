import { strict as assert } from "node:assert";
import test from "node:test";

import { isLoreSignalProjectionReady } from "../lore-projection-readiness.ts";

const complete = {
  generationReady: true,
  latestStatus: "succeeded",
  latestStartedAt: new Date("2026-08-05T00:00:00.000Z"),
  wikiCount: 52,
  reportCount: 12,
  projectedWikiCount: 52,
  projectedReportCount: 12,
  wikiChangedAfterGeneration: false,
  reportChangedAfterGeneration: false,
};

test("완전하고 최신인 projection만 조직 시그널 집계에 사용한다", () => {
  assert.equal(isLoreSignalProjectionReady(complete), true);
});

test("실패/진행 generation, coverage 차이, 이후 domain 변경은 fallback한다", () => {
  for (const override of [
    { generationReady: false },
    { latestStatus: "failed" },
    { latestStatus: "running" },
    { projectedWikiCount: 51 },
    { projectedReportCount: 11 },
    { wikiChangedAfterGeneration: true },
    { reportChangedAfterGeneration: true },
  ]) {
    assert.equal(
      isLoreSignalProjectionReady({ ...complete, ...override }),
      false,
      JSON.stringify(override),
    );
  }
});
