import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTowaskiDialogueContext,
  getTowaskiQualificationDialogueLine,
  shouldScheduleTowaskiShopIdle,
} from "../towaski-dialogue.ts";

test("qualification context never schedules general shop idle dialogue", () => {
  const context = getTowaskiDialogueContext(true);

  assert.equal(context, "qualification");
  assert.equal(shouldScheduleTowaskiShopIdle(context), false);
  assert.equal(shouldScheduleTowaskiShopIdle("shop"), true);
});

test("qualification attempts use only range-specific dialogue variants", () => {
  const lines = Array.from({ length: 6 }, (_, index) =>
    getTowaskiQualificationDialogueLine({
      type: "start",
      difficulty: "basic",
      attempt: index + 1,
    }),
  );

  assert.ok(new Set(lines).size > 1);
  for (const line of lines) {
    assert.doesNotMatch(line, /재고|진열장|방호구|소모품|카운터/);
  }
});

test("civilian-hit failure dialogue takes priority over score failures", () => {
  const line = getTowaskiQualificationDialogueLine({
    type: "failed",
    difficulty: "standard",
    attempt: 2,
    reasons: ["hostile_hits", "civilian_hit", "accuracy"],
  });

  assert.match(line, /민간/);
});

test("retry briefing stays in qualification context", () => {
  const line = getTowaskiQualificationDialogueLine({
    type: "briefing",
    difficulty: "expert",
    attempt: 3,
  });

  assert.match(line, /다시|재시험|한 번 더/);
  assert.doesNotMatch(line, /재고|진열장|방호구|소모품|카운터/);
});

test("advanced modes use equipment-specific start and failure dialogue", () => {
  const sonicStart = getTowaskiQualificationDialogueLine({
    type: "start",
    difficulty: "expert",
    mode: "sonic",
    attempt: 1,
  });
  const explosiveFailure = getTowaskiQualificationDialogueLine({
    type: "failed",
    difficulty: "expert",
    mode: "explosive",
    attempt: 1,
    reasons: ["backblast"],
  });

  assert.match(sonicStart, /리듬|박자|적성|보호/);
  assert.match(explosiveFailure, /위험품|격리|검수/);
});

test("specialist modes rotate mode-specific coaching lines", () => {
  const sonicLines = Array.from({ length: 6 }, (_, index) =>
    getTowaskiQualificationDialogueLine({
      type: "start",
      difficulty: "expert",
      mode: "sonic",
      attempt: index + 1,
    }),
  );

  assert.ok(new Set(sonicLines).size > 1);
  for (const line of sonicLines) {
    assert.match(line, /리듬|박자|적성|보호|판정선|단계/);
    assert.doesNotMatch(line, /90밀리초|170밀리초|TARGET|PROTECTED/);
  }
});

test("mode-specific retry briefing repeats the actual controls", () => {
  const sonicBriefing = getTowaskiQualificationDialogueLine({
    type: "briefing",
    difficulty: "expert",
    mode: "sonic",
    attempt: 2,
  });
  const flameBriefing = getTowaskiQualificationDialogueLine({
    type: "briefing",
    difficulty: "expert",
    mode: "flame",
    attempt: 2,
  });

  assert.match(sonicBriefing, /박자|적성|보호|단계/);
  assert.match(flameBriefing, /경로|가로|세로|직선|대각선/);
});

test("sonic protected-hit failure stays in rhythm safety dialogue", () => {
  const line = getTowaskiQualificationDialogueLine({
    type: "failed",
    difficulty: "expert",
    mode: "sonic",
    attempt: 1,
    reasons: ["protected_hit"],
  });

  assert.match(line, /보호 박자|보호 신호|파형|적성 신호/);
  assert.doesNotMatch(line, /TARGET|PROTECTED/);
  assert.doesNotMatch(line, /축소 표적|사분의 일|풍향|호흡/);
});

test("sonic rhythm miss does not falsely report a protected-beat hit", () => {
  const line = getTowaskiQualificationDialogueLine({
    type: "failed",
    difficulty: "expert",
    mode: "sonic",
    attempt: 2,
    reasons: ["rhythm_stages"],
  });

  assert.match(line, /적성|리듬|박자|적중/);
  assert.doesNotMatch(line, /보호 박자 입력이 잡혔다/);
});

test("exact controls and safety thresholds stay in the adjacent rule UI", async () => {
  const source = await readFile(
    new URL(
      "../../../app/(erp)/erp/equipment-shop/TowaskiLicenseTest.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  for (const protectedRule of [
    "1.125초",
    "80ms 간격",
    "X ±8% · Y ±10%",
    "정확히 3칸",
    "TARGET 6 · PROTECTED 2",
    "±170ms",
    "3 반출 · 1 정비 · 1 격리",
  ]) {
    assert.match(source, new RegExp(protectedRule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("user-opened qualification dialogue survives the state transition with sound", async () => {
  const source = await readFile(
    new URL(
      "../../../app/(erp)/erp/equipment-shop/EquipmentShopClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /towaskiPendingAudibleLineRef\.current =[^;]+;[\s\S]*setTowaskiLicenseTestOpen\(true\)/,
  );
  assert.match(
    source,
    /const pendingAudibleLine = towaskiPendingAudibleLineRef\.current;[\s\S]*playTowaskiLine\([\s\S]*sound: true/,
  );
});
