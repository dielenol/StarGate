import assert from "node:assert/strict";
import test from "node:test";

import {
  createRouletteRace,
  ROULETTE_COURSES,
  ROULETTE_FIXED_STEP_SECONDS,
  shuffleRouletteParticipants,
  stepRouletteRace,
} from "../../lib/roulette/engine.ts";

function makeParticipants(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `discord-${index + 1}`,
    name: `Participant ${index + 1}`,
    avatarUrl: null,
  }));
}

function runToWinner(participants, seed, courseId, maxSeconds = 30) {
  const race = createRouletteRace(participants, seed, courseId);
  const maxSteps = Math.ceil(maxSeconds / ROULETTE_FIXED_STEP_SECONDS);

  for (let step = 0; step < maxSteps && !race.done; step += 1) {
    stepRouletteRace(race, ROULETTE_FIXED_STEP_SECONDS);
  }

  assert.equal(
    race.done,
    true,
    `${courseId} course should produce a winner before timeout`,
  );
  assert.equal(race.finishOrder.length, 1);
  return race.finishOrder[0];
}

test("four courses expose unique IDs and increasing physical heights", () => {
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => course.id),
    ["sprint", "cascade", "odyssey", "classic"],
  );
  assert.ok(ROULETTE_COURSES[0].height < ROULETTE_COURSES[1].height);
  assert.ok(ROULETTE_COURSES[1].height < ROULETTE_COURSES[2].height);
});

test("participant shuffle is deterministic for a recorded seed", () => {
  const participants = makeParticipants(6);
  const first = shuffleRouletteParticipants(participants, 42);
  const second = shuffleRouletteParticipants(participants, 42);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((participant) => participant.id).sort(),
    participants.map((participant) => participant.id).sort(),
  );
  assert.notDeepEqual(first, shuffleRouletteParticipants(participants, 43));
});

test("race winner is reproducible for every course", () => {
  const participants = makeParticipants(8);

  for (const course of ROULETTE_COURSES) {
    assert.equal(
      runToWinner(participants, 20260813, course.id),
      runToWinner(participants, 20260813, course.id),
    );
  }
});

test("minimum and maximum participant races finish on every course", () => {
  for (const course of ROULETTE_COURSES) {
    for (const count of [2, 32]) {
      const participants = makeParticipants(count);
      const winnerId = runToWinner(participants, count * 101, course.id);

      assert.equal(
        participants.some((participant) => participant.id === winnerId),
        true,
      );
    }
  }
});

test("race rejects unsupported or duplicate participants", () => {
  assert.throws(() => createRouletteRace(makeParticipants(1), 1), RangeError);
  assert.throws(() => createRouletteRace(makeParticipants(33), 1), RangeError);
  assert.throws(
    () =>
      createRouletteRace(
        [
          { id: "same", name: "A", avatarUrl: null },
          { id: "same", name: "B", avatarUrl: null },
        ],
        1,
      ),
    RangeError,
  );
});
