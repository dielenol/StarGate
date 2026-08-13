import assert from "node:assert/strict";
import test from "node:test";

import {
  createRouletteRace,
  getRouletteSpinnerSegments,
  ROULETTE_COURSES,
  ROULETTE_FIXED_STEP_SECONDS,
  ROULETTE_MAX_TOTAL_BALLS,
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

function runRace(participants, seed, options, maxSeconds = 45) {
  const race = createRouletteRace(participants, seed, options);
  const maxSteps = Math.ceil(maxSeconds / ROULETTE_FIXED_STEP_SECONDS);

  for (let step = 0; step < maxSteps && !race.done; step += 1) {
    stepRouletteRace(race, ROULETTE_FIXED_STEP_SECONDS);
  }

  assert.equal(
    race.done,
    true,
    `${race.courseId} course should finish before timeout`,
  );
  return race;
}

test("four courses expose distinct rotating obstacle layouts", () => {
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => course.id),
    ["sprint", "cascade", "odyssey", "classic"],
  );
  assert.ok(ROULETTE_COURSES[0].height < ROULETTE_COURSES[1].height);
  assert.ok(ROULETTE_COURSES[1].height < ROULETTE_COURSES[2].height);
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => course.spinners.length),
    [2, 3, 4, 5],
  );
  assert.ok(
    ROULETTE_COURSES.every((course) =>
      course.spinners.every((spinner) => spinner.halfLength >= 80),
    ),
    "rotating obstacles should span a meaningful part of every course",
  );
});

test("spinner geometry rotates deterministically over elapsed time", () => {
  const spinner = ROULETTE_COURSES[3].spinners[2];
  const initial = getRouletteSpinnerSegments(spinner, 0);
  const repeated = getRouletteSpinnerSegments(spinner, 0);
  const rotated = getRouletteSpinnerSegments(spinner, 0.5);

  assert.deepEqual(initial, repeated);
  assert.equal(initial.length, spinner.arms);
  assert.notDeepEqual(initial, rotated);
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

test("first-arrival winners are reproducible for every course", () => {
  const participants = makeParticipants(8);

  for (const course of ROULETTE_COURSES) {
    const first = runRace(participants, 20260813, {
      courseId: course.id,
      winnerMode: "first",
      winnerCount: 3,
    });
    const second = runRace(participants, 20260813, {
      courseId: course.id,
      winnerMode: "first",
      winnerCount: 3,
    });

    assert.deepEqual(first.winnerParticipantIds, second.winnerParticipantIds);
    assert.equal(first.winnerParticipantIds.length, 3);
    assert.equal(new Set(first.winnerParticipantIds).size, 3);
  }
});

test("last-arrival winners follow reverse unique finish order on every course", () => {
  for (const course of ROULETTE_COURSES) {
    const race = runRace(
      makeParticipants(7),
      3301,
      {
        courseId: course.id,
        winnerMode: "last",
        winnerCount: 3,
        ballsPerParticipant: 2,
      },
      60,
    );
    const expected = [];

    for (let index = race.finishOrder.length - 1; index >= 0; index -= 1) {
      const participantId = race.finishOrder[index].participantId;
      if (!expected.includes(participantId)) expected.push(participantId);
      if (expected.length === 3) break;
    }

    assert.equal(race.finishOrder.length, 14);
    assert.deepEqual(race.winnerParticipantIds, expected);
    assert.equal(new Set(race.winnerParticipantIds).size, 3);
  }
});

test("multiple marbles create unique ball IDs and repeat participant entries", () => {
  const participants = makeParticipants(4);
  const race = createRouletteRace(participants, 91, {
    ballsPerParticipant: 10,
    winnerCount: 2,
  });

  assert.equal(race.balls.length, 40);
  assert.equal(new Set(race.balls.map((ball) => ball.ballId)).size, 40);
  for (const participant of participants) {
    assert.equal(
      race.balls.filter((ball) => ball.id === participant.id).length,
      10,
    );
  }
});

test("minimum and maximum participant races finish on every course", () => {
  for (const course of ROULETTE_COURSES) {
    for (const count of [2, 32]) {
      const participants = makeParticipants(count);
      const race = runRace(participants, count * 101, {
        courseId: course.id,
      });

      assert.equal(race.finishOrder.length, 1);
      assert.equal(
        participants.some(
          (participant) =>
            participant.id === race.winnerParticipantIds.at(0),
        ),
        true,
      );
    }
  }
});

test("maximum marble load can produce multiple first-arrival winners", () => {
  const participants = makeParticipants(32);
  const race = runRace(
    participants,
    8080,
    {
      courseId: "sprint",
      winnerCount: 5,
      ballsPerParticipant: 3,
    },
    60,
  );

  assert.equal(race.balls.length, ROULETTE_MAX_TOTAL_BALLS);
  assert.equal(race.winnerParticipantIds.length, 5);
});

test("race rejects unsupported participant and draw settings", () => {
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
  assert.throws(
    () => createRouletteRace(makeParticipants(3), 1, { winnerCount: 4 }),
    RangeError,
  );
  assert.throws(
    () =>
      createRouletteRace(makeParticipants(3), 1, {
        ballsPerParticipant: 11,
      }),
    RangeError,
  );
  assert.throws(
    () =>
      createRouletteRace(makeParticipants(32), 1, {
        ballsPerParticipant: 4,
      }),
    RangeError,
  );
});
