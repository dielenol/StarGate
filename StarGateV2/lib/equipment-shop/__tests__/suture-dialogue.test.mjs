import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSutureBlockedLine,
  buildSutureContributionLine,
  buildSutureNodeLine,
  buildSutureRecoveryLine,
  buildSutureResearchStartedLine,
  buildSutureRushLine,
  buildSutureScopeLine,
  buildSutureWelcomeLine,
  SUTURE_DEBUG_LINES,
  SUTURE_DIALOGUE_LINES,
  SUTURE_IDLE_LINES,
} from "../suture-dialogue.ts";

test("Suture welcomes the assigned AGENT as a patient rather than a record", () => {
  const line = buildSutureWelcomeLine({
    codename: "TEST AGENT",
    profile: "assault",
  });

  assert.match(line, /^TEST AGENT, 왔군요\./);
  assert.match(line, /힘|신경|손|출력/);
  assert.doesNotMatch(line, /기록을 열었습니다|기준으로 검토/);
  assert.equal(
    buildSutureWelcomeLine({ codename: null, profile: "balanced" }),
    SUTURE_DIALOGUE_LINES.welcome,
  );
});

test("personal and team scope lines explain the human safety difference", () => {
  assert.match(buildSutureScopeLine("personal"), /당신 몸|불편하면/);
  assert.match(buildSutureScopeLine("team"), /가장 지친 한 명|버틸 규격/);
});

test("research node dialogue keeps the effect but replaces protocol recitation with clinical concern", () => {
  const statLine = buildSutureNodeLine({
    nodeName: "조준 보정",
    scope: "personal",
    effect: { kind: "stat", stat: "atk" },
    effectText: "ATK +1",
  });
  const economyLine = buildSutureNodeLine({
    nodeName: "견적 표준화",
    scope: "team",
    effect: { kind: "research_cost_discount" },
    effectText: "연구 비용 5% 감소",
  });

  assert.match(statLine, /ATK \+1|멈추는 신호/);
  assert.match(statLine, /당신 몸/);
  assert.match(economyLine, /팀 전원|검사 항목/);
  assert.doesNotMatch(`${statLine} ${economyLine}`, /T\d .*프로토콜입니다|기준으로 .*검토하겠습니다/);
});

test("blocked dialogue rotates clear refusals without softening Suture's safety line", () => {
  for (const reason of ["noAgent", "start", "contribution", "rush", "complete"]) {
    const lines = new Set(
      [0, 1, 2].map((variant) => buildSutureBlockedLine(reason, variant)),
    );
    assert.equal(lines.size, 3);
  }

  assert.match(buildSutureBlockedLine("rush"), /몸이 갚아요|안 됩니다/);
  assert.match(buildSutureBlockedLine("complete"), /두 번|실수/);
});

test("debug and idle lines carry consent, phantom pain, and exposed-frame principles", () => {
  assert.deepEqual(Object.keys(SUTURE_DEBUG_LINES).sort(), [
    "assessment",
    "blocked",
    "funding",
    "idle",
    "procedure",
    "protocol",
    "recovery",
    "welcome",
  ]);

  const corpus = [
    ...Object.values(SUTURE_DEBUG_LINES),
    ...SUTURE_IDLE_LINES.map((entry) => entry.text),
  ].join(" ");
  assert.match(corpus, /계속할까요|동의/);
  assert.match(corpus, /환상통|없는 팔/);
  assert.match(corpus, /접속부|금이 갔으면|드러내/);
});

test("research lifecycle lines sound spoken while preserving the operational result", () => {
  assert.match(buildSutureResearchStartedLine("생체 보정"), /생체 보정|평소와 다른 것/);
  assert.match(
    buildSutureContributionLine({
      projectKey: "BIO-01",
      chargedAmount: "¤ 120",
      started: false,
    }),
    /¤ 120|기록했어요/,
  );
  assert.match(
    buildSutureContributionLine({
      projectKey: "BIO-01",
      chargedAmount: "¤ 120",
      started: true,
    }),
    /BIO-01|재원은 모였네요/,
  );
  assert.match(buildSutureRushLine("6시간"), /6시간|관찰 간격/);
  assert.match(buildSutureRecoveryLine("BIO-01"), /BIO-01|손끝|돌아오/);
});
