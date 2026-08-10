import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toGuestResearchLabOverview } from "../../research/guest-overview.ts";

test("게스트 샘플 연구소 응답은 작업·캐릭터·공용 재고 원장을 제거한다", () => {
  const overview = toGuestResearchLabOverview({
    serverNow: "2026-08-10T00:00:00.000Z",
    viewer: {
      eligibilityCode: "ELIGIBLE",
      character: {
        id: "private-character-id",
        codename: "PRIVATE_AGENT",
        className: "과학자",
        agentLevel: "H",
      },
      isScientist: true,
      balance: 999,
      mutationsEnabled: true,
    },
    lines: [
      {
        recipe: {
          id: "ZULU_0028",
          label: "깨진 음절 연구선",
          eyebrow: "ZULU SAMPLE · 0028",
          description: "공개 설명",
          gameplayNote: null,
          source: {
            slug: "source",
            name: "공개 재료",
            image: "/source.webp",
            category: "SPECIAL",
            quantity: 1,
            sharedQuantity: 77,
            catalogPrice: 0,
            registered: true,
          },
          output: {
            slug: "output",
            name: "공개 산출물",
            image: "/output.webp",
            category: "MATERIAL",
            quantity: 1,
            sharedQuantity: 33,
            catalogPrice: 0,
            registered: true,
          },
          initialDurationMs: 1000,
          repeatDurationMs: 500,
          repeatCreditCost: 500,
        },
        status: "OPEN",
        submittedByCharacterCodename: "PRIVATE_AGENT",
        startedAt: "2026-08-01T00:00:00.000Z",
        completesAt: "2026-08-02T00:00:00.000Z",
        openedAt: "2026-08-03T00:00:00.000Z",
        activeJob: {
          id: "private-job-id",
          recipeId: "ZULU_0028",
          kind: "REPEAT",
          status: "RUNNING",
          destination: "PERSONAL",
          characterCodename: "PRIVATE_AGENT",
          isMine: true,
          position: null,
          queuedAt: "2026-08-01T00:00:00.000Z",
          startedAt: "2026-08-01T00:00:00.000Z",
          completesAt: "2026-08-02T00:00:00.000Z",
          claimDeadline: null,
          canCancel: false,
          canClaim: false,
        },
        queue: [],
        myJob: null,
      },
    ],
    xeno: null,
  });

  assert.equal(overview.viewer.character, null);
  assert.equal(overview.viewer.balance, null);
  assert.equal(overview.viewer.mutationsEnabled, false);
  assert.equal(overview.lines[0].recipe.source.sharedQuantity, 0);
  assert.equal(overview.lines[0].recipe.output.sharedQuantity, 0);
  assert.equal(overview.lines[0].submittedByCharacterCodename, null);
  assert.equal(overview.lines[0].startedAt, null);
  assert.equal(overview.lines[0].completesAt, null);
  assert.equal(overview.lines[0].openedAt, null);
  assert.equal(overview.lines[0].activeJob, null);
  assert.deepEqual(overview.lines[0].queue, []);
  assert.equal(overview.lines[0].myJob, null);
  assert.doesNotMatch(JSON.stringify(overview), /private-(?:job|character)-id/u);
  assert.doesNotMatch(JSON.stringify(overview), /PRIVATE_AGENT/u);
});

test("샘플 연구소 API와 RSC는 동일한 게스트 공개 투영을 사용한다", async () => {
  const root = new URL("../../../", import.meta.url);
  const [apiSource, pageSource] = await Promise.all([
    readFile(new URL("app/api/erp/research/route.ts", root), "utf8"),
    readFile(new URL("app/(erp)/erp/research/page.tsx", root), "utf8"),
  ]);

  assert.match(apiSource, /toGuestResearchLabOverview/u);
  assert.match(pageSource, /toGuestResearchLabOverview/u);
});
