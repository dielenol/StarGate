import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  INTEGRATION_OUTBOX_KINDS,
  RESEARCH_LAB_INDEX_DEFINITIONS,
  RESEARCH_LAB_MAX_WORKER_ATTEMPTS,
  RELATIONSHIP_STATES,
  relationshipStateForScore,
  npcRelationshipSceneDedupeKey,
  npcRelationshipId,
  researchOutstandingKey,
} from "../../../dist/index.js";

test("연구소 공개 enum과 관계 점수 경계가 SSOT 계약과 일치한다", () => {
  assert.deepEqual(RELATIONSHIP_STATES, [
    "CONTEMPT",
    "HOSTILE",
    "DISPLEASED",
    "COLD",
    "NEUTRAL",
    "OBSERVING",
    "ACKNOWLEDGED",
    "FAVORABLE",
    "DELIGHTED",
  ]);
  assert.equal(relationshipStateForScore(-76), "CONTEMPT");
  assert.equal(relationshipStateForScore(-75), "HOSTILE");
  assert.equal(relationshipStateForScore(-5), "NEUTRAL");
  assert.equal(relationshipStateForScore(6), "OBSERVING");
  assert.equal(relationshipStateForScore(100), "DELIGHTED");
});

test("관계 선택 멱등 키와 응답은 scene의 실제 승자 선택으로 고정된다", async () => {
  assert.equal(
    npcRelationshipSceneDedupeKey("user-1", "character-1", "first-impression"),
    "XENO:user-1:character-1:scene:first-impression",
  );
  assert.equal(
    npcRelationshipId("user-1", "character-1"),
    "XENO:user-1:character-1",
  );
  assert.equal(
    RESEARCH_LAB_INDEX_DEFINITIONS.npc_relationship_events.find(
      (index) => index.name === "npc_relationship_events_user_scene_unique",
    )?.unique,
    true,
  );
  const source = await readFile(
    new URL("../research-lab.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /choiceId: existingEvent\.choiceId/);
  assert.match(source, /choiceId: winningEvent\.choiceId/);
});

test("캐릭터/연구선 outstanding과 line active unique index가 동시 중복을 차단한다", () => {
  assert.equal(researchOutstandingKey("character-1", "ZULU_0028"), "character-1:ZULU_0028");
  const indexes = RESEARCH_LAB_INDEX_DEFINITIONS.research_lab_jobs;
  assert.equal(
    indexes.find((index) => index.name === "research_lab_jobs_outstandingKey_unique")?.unique,
    true,
  );
  assert.equal(
    indexes.find((index) => index.name === "research_lab_jobs_activeLineKey_unique")?.unique,
    true,
  );
  assert.equal(RESEARCH_LAB_MAX_WORKER_ATTEMPTS, 8);
  assert.ok(INTEGRATION_OUTBOX_KINDS.includes("RESEARCH_LAB_DM"));
});

test("대화 요약은 누적 10회 경계의 단일 lease와 generation CAS를 사용한다", async () => {
  const source = await readFile(
    new URL("../research-lab.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /totalUsageCount:/);
  assert.match(source, /\$ifNull: \["\$totalUsageCount", 0\]/);
  assert.match(source, /summaryLeaseToken/);
  assert.match(source, /summaryGeneration/);
  assert.match(source, /lastSummarizedUsageCount/);
  assert.match(source, /summaryLeaseUntil: \{ \$gt:/);
  assert.match(source, /turnLeaseToken: input\.turnLeaseToken/);
  assert.match(source, /turnLeaseUntil: \{ \$gt: now \}/);
  assert.match(source, /\$unset: \{ turnLeaseToken: "", turnLeaseUntil: "" \}/);
});

test("전이 알림은 단일 필드 덮어쓰기 대신 FIFO signal queue로 보존한다", async () => {
  const source = await readFile(
    new URL("../research-lab.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /\$push: \{ pendingSignals: "CHARACTER_CLAIMABLE" \}/);
  assert.match(source, /pendingSignals: \["CHARACTER_DIVERTED"\]/);
  assert.match(source, /"pendingSignals\.0": input\.expectedSignal/);
  assert.match(source, /\$pop: \{ pendingSignals: -1 \}/);
  assert.doesNotMatch(source, /signalPending/);
  assert.match(source, /\$pull: \{ pendingSignals: "CHARACTER_CLAIMABLE" \}/);
  assert.match(source, /renewResearchLabSignalLease/);
  assert.match(source, /renewResearchLabReminderLease/);
  assert.match(source, /input\.expectedSignal === "CHARACTER_CLAIMABLE"/);
  assert.match(source, /claimDeadline: \{ \$gt: now \}/);
});
