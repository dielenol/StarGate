import assert from "node:assert/strict";
import test from "node:test";

import {
  createRouletteRace,
  getRouletteCameraTop,
  getRouletteCourse,
  getRouletteMoverState,
  getRouletteSpinnerSegments,
  getRouletteViewHeight,
  hasRouletteCamera,
  resolveRouletteMoverCollision,
  resolveRoulettePegCollision,
  ROULETTE_CAMERA_LEAD_RATIO,
  ROULETTE_COURSES,
  ROULETTE_DEFAULT_COURSE_ID,
  ROULETTE_FIXED_STEP_SECONDS,
  ROULETTE_MAX_TOTAL_BALLS,
  shuffleRouletteParticipants,
  stepRouletteCameraTop,
  stepRouletteRace,
} from "../../lib/roulette/engine.ts";

function makeParticipants(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `discord-${index + 1}`,
    name: `Participant ${index + 1}`,
    avatarUrl: null,
  }));
}

function makeBall(overrides = {}) {
  return {
    id: "discord-1",
    name: "Participant 1",
    avatarUrl: null,
    ballId: 0,
    color: "hsl(0 0% 0%)",
    x: 100,
    y: 90,
    vx: 0,
    vy: 300,
    radius: 15,
    finished: false,
    ...overrides,
  };
}

/** 코스가 길수록 시간 제한을 늘린다 (기대 완주 시간의 3배, 최소 45초). */
function runRace(participants, seed, options = {}, maxSeconds) {
  const course = getRouletteCourse(
    options.courseId ?? ROULETTE_DEFAULT_COURSE_ID,
  );
  const limitSeconds = maxSeconds ?? Math.max(45, course.expectedSeconds * 3);
  const race = createRouletteRace(participants, seed, options);
  const maxSteps = Math.ceil(limitSeconds / ROULETTE_FIXED_STEP_SECONDS);

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

function normalizeBarAngle(angle) {
  return ((angle % Math.PI) + Math.PI) % Math.PI;
}

test("five courses expose distinct obstacle layouts and only the marathon uses a camera", () => {
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => course.id),
    ["sprint", "cascade", "odyssey", "classic", "marathon"],
  );
  assert.ok(ROULETTE_COURSES[0].height < ROULETTE_COURSES[1].height);
  assert.ok(ROULETTE_COURSES[1].height < ROULETTE_COURSES[2].height);
  assert.ok(
    ROULETTE_COURSES.slice(0, 4).every(
      (course) => course.height < ROULETTE_COURSES[4].height,
    ),
    "marathon should be the tallest course",
  );
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => course.spinners.length),
    [2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => course.movers.length),
    [0, 0, 0, 0, 4],
  );
  assert.ok(
    ROULETTE_COURSES.every((course) =>
      course.spinners.every((spinner) => spinner.halfLength >= 80),
    ),
    "rotating obstacles should span a meaningful part of every course",
  );
  assert.deepEqual(
    ROULETTE_COURSES.map((course) => hasRouletteCamera(course)),
    [false, false, false, false, true],
  );
  assert.ok(
    ROULETTE_COURSES.every(
      (course) => course.duration === `약 ${course.expectedSeconds}초`,
    ),
    "duration label must match expectedSeconds",
  );

  const marathon = getRouletteCourse("marathon");
  assert.equal(getRouletteViewHeight(marathon), 960);
  assert.ok(getRouletteViewHeight(marathon) < marathon.height);
  assert.equal(getRouletteViewHeight(getRouletteCourse("classic")), 1_030);
  assert.ok(
    marathon.pegs.some((peg) => peg.kick > 0),
    "marathon should include kick bumpers",
  );
});

test("course geometry leaves marble clearance between wheels and keeps movers well-formed", () => {
  // 마블 반지름 15 + 막대 반폭 7, 양쪽 → 두 휠의 팁 사이에 마블 하나가 지나갈 최소 폭.
  const minimumWheelGap = 2 * (15 + 7);
  // 포춘 클래식의 두 번째·세 번째 휠은 이 규칙 이전부터 일부러 교차시킨 배치라 예외로 둔다.
  const knownOverlaps = new Set(["classic:1:2"]);

  for (const course of ROULETTE_COURSES) {
    for (let first = 0; first < course.spinners.length; first += 1) {
      for (let second = first + 1; second < course.spinners.length; second += 1) {
        if (knownOverlaps.has(`${course.id}:${first}:${second}`)) continue;
        const a = course.spinners[first];
        const b = course.spinners[second];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.halfLength - b.halfLength;
        assert.ok(
          gap >= minimumWheelGap,
          `${course.id} spinners ${first}/${second} leave only ${gap.toFixed(1)}px`,
        );
      }
    }
    for (const mover of course.movers) {
      assert.ok(mover.period > 0, `${course.id} mover period must be positive`);
      assert.ok(
        Number.isFinite(mover.dx) && Number.isFinite(mover.dy),
        `${course.id} mover travel must be finite`,
      );
      assert.notEqual(
        mover.ay,
        mover.by,
        `${course.id} movers must be tilted so marbles roll off`,
      );
    }
  }
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

test("multi-arm spinners space their bars evenly around the hub", () => {
  const marathon = getRouletteCourse("marathon");
  const triple = marathon.spinners.find((spinner) => spinner.arms === 3);
  const quad = marathon.spinners.find((spinner) => spinner.arms === 4);
  assert.ok(triple && quad, "marathon should have 3-arm and 4-arm wheels");

  for (const spinner of [triple, quad]) {
    const segments = getRouletteSpinnerSegments(spinner, 0.25);
    assert.equal(segments.length, spinner.arms);

    const angles = segments.map((segment) =>
      normalizeBarAngle(
        Math.atan2(segment.by - segment.ay, segment.bx - segment.ax),
      ),
    );
    for (let index = 1; index < angles.length; index += 1) {
      const gap = normalizeBarAngle(angles[index] - angles[index - 1]);
      assert.ok(
        Math.abs(gap - Math.PI / spinner.arms) < 1e-9,
        `arm ${index} of a ${spinner.arms}-arm wheel should sit π/${spinner.arms} apart`,
      );
    }
    for (const segment of segments) {
      const midX = (segment.ax + segment.bx) / 2;
      const midY = (segment.ay + segment.by) / 2;
      assert.ok(Math.abs(midX - spinner.x) < 1e-9);
      assert.ok(Math.abs(midY - spinner.y) < 1e-9);
    }
  }

  // 두 막대 휠은 기존과 같은 직각 배치를 유지한다.
  const classicArms = getRouletteSpinnerSegments(
    { x: 0, y: 0, halfLength: 10, angularVelocity: 0, initialAngle: 0, arms: 2 },
    0,
  );
  assert.ok(Math.abs(classicArms[0].ax + 10) < 1e-9);
  assert.ok(Math.abs(classicArms[0].ay) < 1e-9);
  assert.ok(Math.abs(classicArms[0].bx - 10) < 1e-9);
  assert.ok(Math.abs(classicArms[0].by) < 1e-9);
  assert.ok(Math.abs(classicArms[1].ax) < 1e-9);
  assert.ok(Math.abs(classicArms[1].ay + 10) < 1e-9);
});

test("movers oscillate around their rest pose with a matching surface velocity", () => {
  const mover = {
    ax: 100,
    ay: 200,
    bx: 200,
    by: 240,
    dx: 50,
    dy: 0,
    period: 2,
    phase: 0,
  };

  const rest = getRouletteMoverState(mover, 0);
  assert.deepEqual(rest.segment, { ax: 100, ay: 200, bx: 200, by: 240 });
  assert.ok(Math.abs(rest.vx - 50 * Math.PI) < 1e-9);
  assert.equal(Math.abs(rest.vy), 0);

  const extreme = getRouletteMoverState(mover, 0.5);
  assert.ok(Math.abs(extreme.segment.ax - 150) < 1e-9);
  assert.ok(Math.abs(extreme.segment.bx - 250) < 1e-9);
  assert.ok(Math.abs(extreme.vx) < 1e-9);

  const back = getRouletteMoverState(mover, 2);
  assert.ok(Math.abs(back.segment.ax - 100) < 1e-9);
  assert.deepEqual(
    getRouletteMoverState(mover, 1.3),
    getRouletteMoverState(mover, 1.3),
  );

  const piston = getRouletteMoverState(
    { ...mover, dx: 0, dy: 36, phase: Math.PI },
    0,
  );
  assert.equal(Math.abs(piston.vx), 0);
  assert.ok(piston.vy < 0, "a π-phase piston starts moving up");
});

test("rising pistons launch overlapping marbles and receding bars leave them alone", () => {
  // 수평 막대 y=120, 마블 중심 y=100 → 거리 20 < 15 + 7 이라 접촉 상태.
  const segment = { ax: 0, ay: 120, bx: 200, by: 120 };

  const resting = makeBall({ y: 100, vy: 0 });
  resolveRouletteMoverCollision(resting, { segment, vx: 0, vy: -150 });
  assert.ok(
    Math.abs(resting.vy - -(1 + 0.7) * 150) < 1e-9,
    "a bar rising at 150px/s should launch a resting marble with restitution 0.7",
  );
  assert.equal(resting.y, 98, "overlap is corrected along the normal");

  const receding = makeBall({ y: 100, vy: 0 });
  resolveRouletteMoverCollision(receding, { segment, vx: 0, vy: 150 });
  assert.equal(receding.vy, 0, "a bar moving away must not add velocity");
  assert.equal(receding.y, 98);

  const sideways = makeBall({ y: 100, vy: 0, vx: 0 });
  resolveRouletteMoverCollision(sideways, { segment, vx: 400, vy: 0 });
  assert.equal(sideways.vy, 0, "tangential bar motion has no normal component");
  assert.equal(sideways.vx, 0);

  const clear = makeBall({ y: 60, vy: 0 });
  resolveRouletteMoverCollision(clear, { segment, vx: 0, vy: -150 });
  assert.equal(clear.y, 60);
  assert.equal(clear.vy, 0);
});

test("kick bumpers return marbles faster than plain pegs", () => {
  const plain = makeBall();
  resolveRoulettePegCollision(plain, { x: 100, y: 110, radius: 10 });
  const kicked = makeBall();
  resolveRoulettePegCollision(kicked, { x: 100, y: 110, radius: 10, kick: 240 });

  assert.ok(plain.vy < 0, "plain peg should bounce the marble back up");
  assert.ok(kicked.vy < plain.vy, "kick bumper should add upward speed");
  assert.ok(Math.abs(plain.vy - kicked.vy - 240) < 1e-9);
  assert.equal(plain.y, kicked.y, "kick must not change the overlap correction");

  const untouched = makeBall();
  resolveRoulettePegCollision(untouched, { x: 300, y: 300, radius: 10, kick: 240 });
  assert.equal(untouched.vy, 300);
  assert.equal(untouched.y, 90);

  // 이미 멀어지는 마블은 범퍼 안에 있어도 다시 차지 않는다.
  const leaving = makeBall({ vy: -50 });
  resolveRoulettePegCollision(leaving, { x: 100, y: 110, radius: 10, kick: 240 });
  assert.equal(leaving.vy, -50);
});

test("camera follows the leader for first arrival, the trailer for last arrival, and clamps to the course", () => {
  const marathon = getRouletteCourse("marathon");
  const classic = getRouletteCourse("classic");
  const viewHeight = getRouletteViewHeight(marathon);

  assert.equal(getRouletteCameraTop(null, marathon), 0);

  const classicRace = createRouletteRace(makeParticipants(3), 7, {
    courseId: "classic",
  });
  classicRace.balls[0].y = 900;
  assert.equal(getRouletteCameraTop(classicRace, classic), 0);

  const race = createRouletteRace(makeParticipants(3), 7, {
    courseId: "marathon",
  });
  race.balls[0].y = 1_500;
  race.balls[1].y = 1_200;
  race.balls[2].y = 900;

  const leaderTop = getRouletteCameraTop(race, marathon);
  assert.ok(1_500 >= leaderTop && 1_500 <= leaderTop + viewHeight);
  assert.ok(
    1_500 - leaderTop < viewHeight / 2,
    "leader should sit above the centre so the track ahead is visible",
  );

  race.winnerMode = "last";
  const trailerTop = getRouletteCameraTop(race, marathon);
  assert.ok(900 >= trailerTop && 900 <= trailerTop + viewHeight);
  assert.ok(trailerTop < leaderTop);

  race.winnerMode = "first";
  race.balls[0].finished = true;
  assert.ok(
    Math.abs(
      getRouletteCameraTop(race, marathon) -
        (1_200 + viewHeight * ROULETTE_CAMERA_LEAD_RATIO - viewHeight / 2),
    ) < 1e-9,
    "finished marbles are ignored when picking the leader",
  );
  race.balls[0].finished = false;

  race.balls[0].y = -500;
  race.balls[1].y = -600;
  race.balls[2].y = -700;
  assert.equal(getRouletteCameraTop(race, marathon), 0);

  race.balls[0].y = 10_000;
  assert.equal(
    getRouletteCameraTop(race, marathon),
    marathon.height - viewHeight,
  );

  race.done = true;
  assert.equal(
    getRouletteCameraTop(race, marathon),
    Math.min(
      marathon.height - viewHeight,
      Math.max(
        0,
        marathon.finishY + viewHeight * ROULETTE_CAMERA_LEAD_RATIO - viewHeight / 2,
      ),
    ),
    "finished races frame the finish line like a tracked marble",
  );
});

test("camera smoothing converges monotonically, snaps when close, and never loses the tracked marble", () => {
  const target = 500;
  let top = 0;
  let previous = 0;

  for (let frame = 0; frame < 60; frame += 1) {
    top = stepRouletteCameraTop(top, target, 1 / 60);
    assert.ok(top > previous && top <= target);
    previous = top;
  }
  assert.ok(target - top < target * 0.05, "one second should close 95%+ of the gap");
  assert.equal(stepRouletteCameraTop(499.95, target, 1 / 60), target);
  assert.equal(stepRouletteCameraTop(100, 100, 1), 100);
  assert.equal(stepRouletteCameraTop(0, target, 0), 0);

  // 고배속 낙하: 목표가 한 프레임에 멀리 달아나도 추적 마블(목표 창의 위에서 0.35h 지점)이
  // 창 바닥 10% 안으로 들어오지 않도록 지연을 묶는다. 위 방향은 묶지 않는다.
  const viewHeight = 960;
  const farTarget = 3_000;
  const bounded = stepRouletteCameraTop(0, farTarget, 1 / 60, viewHeight);
  const marbleY = farTarget + viewHeight * (0.5 - ROULETTE_CAMERA_LEAD_RATIO);
  assert.ok(bounded > stepRouletteCameraTop(0, farTarget, 1 / 60));
  assert.ok(marbleY - bounded <= viewHeight * 0.9 + 1e-9);
  assert.ok(
    Math.abs(bounded - (farTarget - viewHeight * 0.55)) < 1e-9,
    "lag cap is 0.5 - bottom margin 0.1 + lead 0.15 of the view height",
  );
  assert.equal(
    stepRouletteCameraTop(3_000, 0, 1 / 60, viewHeight),
    stepRouletteCameraTop(3_000, 0, 1 / 60),
    "moving the camera back up stays smooth",
  );
});

test("classic course physics stay identical to the recorded golden run", () => {
  // 엔진 리팩터가 기존 코스의 결과를 바꾸면 여기서 잡는다. 의도한 물리 변경이면 값을 갱신한다.
  const race = runRace(makeParticipants(6), 20261018, {
    courseId: "classic",
    winnerMode: "last",
    winnerCount: 2,
  });

  assert.deepEqual(
    race.finishOrder.map((finish) => `${finish.participantId}#${finish.ballId}`),
    [
      "discord-6#4",
      "discord-4#5",
      "discord-3#1",
      "discord-5#0",
      "discord-2#3",
      "discord-1#2",
    ],
  );
  assert.deepEqual(race.winnerParticipantIds, ["discord-1", "discord-2"]);
  assert.equal(race.elapsedSeconds.toFixed(6), "14.350000");
  assert.equal(race.balls[0].x.toFixed(6), "339.286674");
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
      Math.max(60, course.expectedSeconds * 3),
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

test("marathon finishes a full last-arrival field with the maximum marble load", () => {
  const race = runRace(
    makeParticipants(32),
    8080,
    {
      courseId: "marathon",
      winnerMode: "last",
      winnerCount: 3,
      ballsPerParticipant: 3,
    },
    90,
  );

  assert.equal(race.balls.length, ROULETTE_MAX_TOTAL_BALLS);
  assert.equal(race.finishOrder.length, ROULETTE_MAX_TOTAL_BALLS);
  assert.equal(race.winnerParticipantIds.length, 3);
  assert.ok(
    race.elapsedSeconds > getRouletteCourse("marathon").expectedSeconds,
    "a full field should take longer than the headline duration",
  );
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
