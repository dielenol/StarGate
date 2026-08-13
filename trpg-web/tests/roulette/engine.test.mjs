import assert from "node:assert/strict";
import test from "node:test";

import {
  createRouletteRace,
  parseRouletteParticipants,
  ROULETTE_FIXED_STEP_SECONDS,
  shuffleRouletteParticipants,
  stepRouletteRace,
} from "../../lib/roulette/engine.ts";

function runToWinner(participants, seed, maxSeconds = 15) {
  const race = createRouletteRace(participants, seed);
  const maxSteps = Math.ceil(maxSeconds / ROULETTE_FIXED_STEP_SECONDS);

  for (let step = 0; step < maxSteps && !race.done; step += 1) {
    stepRouletteRace(race, ROULETTE_FIXED_STEP_SECONDS);
  }

  assert.equal(race.done, true, "race should produce a winner before timeout");
  assert.equal(race.finishOrder.length, 1);
  return race.finishOrder[0];
}

test("participant input accepts lines and commas while normalizing whitespace", () => {
  assert.deepEqual(
    parseRouletteParticipants("  Alice  \nBob,  Carol   Dan\n\nAlice"),
    ["Alice", "Bob", "Carol Dan", "Alice"],
  );
  assert.equal(
    Array.from(parseRouletteParticipants("가".repeat(30))[0]).length,
    24,
  );
});

test("participant shuffle is deterministic for a recorded seed", () => {
  const participants = ["A", "B", "C", "D", "E", "F"];
  const first = shuffleRouletteParticipants(participants, 42);
  const second = shuffleRouletteParticipants(participants, 42);

  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), [...participants].sort());
  assert.notDeepEqual(first, shuffleRouletteParticipants(participants, 43));
});

test("race winner is reproducible from participants and seed", () => {
  const participants = ["A", "B", "C", "D", "E", "F"];

  assert.equal(runToWinner(participants, 20260813), runToWinner(participants, 20260813));
});

test("minimum and maximum participant races both reach the finish", () => {
  for (const count of [2, 32]) {
    const participants = Array.from(
      { length: count },
      (_, index) => `Participant ${index + 1}`,
    );
    const winner = runToWinner(participants, count * 101);

    assert.equal(participants.includes(winner), true);
  }
});

test("race rejects unsupported participant counts", () => {
  assert.throws(() => createRouletteRace(["alone"], 1), RangeError);
  assert.throws(
    () =>
      createRouletteRace(
        Array.from({ length: 33 }, (_, index) => `${index}`),
        1,
      ),
    RangeError,
  );
});
