export const ROULETTE_BOARD_WIDTH = 720;
export const ROULETTE_MIN_PARTICIPANTS = 2;
export const ROULETTE_MAX_PARTICIPANTS = 32;
export const ROULETTE_FIXED_STEP_SECONDS = 1 / 120;
export const ROULETTE_MAX_WINNERS = 10;
export const ROULETTE_MIN_BALLS_PER_PARTICIPANT = 1;
export const ROULETTE_MAX_BALLS_PER_PARTICIPANT = 5;
export const ROULETTE_MAX_TOTAL_BALLS = 96;

const BALL_RADIUS = 15;
const LEFT_WALL = 28;
const RIGHT_WALL = ROULETTE_BOARD_WIDTH - 28;

export type RouletteCourseId = "sprint" | "cascade" | "odyssey" | "classic";
export type RouletteWinnerMode = "first" | "last";

export interface RouletteParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface RouletteBall extends RouletteParticipant {
  ballId: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  finished: boolean;
}

export interface RoulettePeg {
  x: number;
  y: number;
  radius: number;
}

export interface RouletteSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface RouletteSpinner {
  x: number;
  y: number;
  halfLength: number;
  angularVelocity: number;
  initialAngle: number;
  arms: 1 | 2;
}

export interface RouletteCourse {
  id: RouletteCourseId;
  number: string;
  name: string;
  distance: string;
  duration: string;
  description: string;
  height: number;
  finishY: number;
  startY: number;
  gravity: number;
  maxSpeed: number;
  pegs: readonly RoulettePeg[];
  segments: readonly RouletteSegment[];
  spinners: readonly RouletteSpinner[];
}

export interface RouletteRaceOptions {
  courseId?: RouletteCourseId;
  winnerMode?: RouletteWinnerMode;
  winnerCount?: number;
  ballsPerParticipant?: number;
}

export interface RouletteFinish {
  participantId: string;
  ballId: number;
}

export interface RouletteRace {
  seed: number;
  courseId: RouletteCourseId;
  elapsedSeconds: number;
  balls: RouletteBall[];
  winnerMode: RouletteWinnerMode;
  winnerCount: number;
  ballsPerParticipant: number;
  finishOrder: RouletteFinish[];
  winnerParticipantIds: string[];
  winnerBallIds: number[];
  done: boolean;
}

interface PegGridOptions {
  top: number;
  rows: number;
  columns?: number;
  startX?: number;
  spacingX?: number;
  spacingY?: number;
  radius?: number;
}

function createPegGrid({
  top,
  rows,
  columns = 10,
  startX = 72,
  spacingX = 64,
  spacingY = 42,
  radius = 7,
}: PegGridOptions): RoulettePeg[] {
  const pegs: RoulettePeg[] = [];

  for (let row = 0; row < rows; row += 1) {
    const shifted = row % 2 === 1;
    const rowColumns = shifted ? columns - 1 : columns;
    const rowStartX = startX + (shifted ? spacingX / 2 : 0);

    for (let column = 0; column < rowColumns; column += 1) {
      pegs.push({
        x: rowStartX + column * spacingX,
        y: top + row * spacingY,
        radius,
      });
    }
  }

  return pegs;
}

function createPegRow(
  y: number,
  xs: readonly number[],
  radius = 10,
): RoulettePeg[] {
  return xs.map((x) => ({ x, y, radius }));
}

function createCourseWalls(finishY: number): RouletteSegment[] {
  const funnelTop = finishY - 86;

  return [
    { ax: LEFT_WALL, ay: 70, bx: LEFT_WALL, by: funnelTop },
    { ax: RIGHT_WALL, ay: 70, bx: RIGHT_WALL, by: funnelTop },
    { ax: LEFT_WALL, ay: funnelTop, bx: 232, by: finishY - 8 },
    { ax: RIGHT_WALL, ay: funnelTop, bx: 488, by: finishY - 8 },
  ];
}

const SPRINT_FINISH_Y = 592;
const CASCADE_FINISH_Y = 822;
const ODYSSEY_FINISH_Y = 1_092;
const CLASSIC_FINISH_Y = 992;

export const ROULETTE_COURSES: readonly RouletteCourse[] = [
  {
    id: "sprint",
    number: "01",
    name: "퀵 드롭",
    distance: "단거리",
    duration: "약 4초",
    description: "큰 범퍼 사이를 빠르게 꺾어 내려오는 짧고 경쾌한 코스",
    height: 630,
    finishY: SPRINT_FINISH_Y,
    startY: 112,
    gravity: 720,
    maxSpeed: 860,
    pegs: [
      ...createPegRow(205, [150, 290, 430, 570], 12),
      ...createPegRow(285, [90, 220, 360, 500, 630], 11),
      ...createPegRow(365, [160, 300, 440, 580], 12),
      ...createPegRow(445, [105, 235, 365, 495, 625], 10),
    ],
    segments: [
      ...createCourseWalls(SPRINT_FINISH_Y),
      { ax: 28, ay: 488, bx: 196, by: 526 },
      { ax: 692, ay: 488, bx: 524, by: 526 },
    ],
    spinners: [
      {
        x: 230,
        y: 327,
        halfLength: 48,
        angularVelocity: 3.2,
        initialAngle: 0.25,
        arms: 1,
      },
      {
        x: 495,
        y: 405,
        halfLength: 52,
        angularVelocity: -3.6,
        initialAngle: 1.1,
        arms: 1,
      },
    ],
  },
  {
    id: "cascade",
    number: "02",
    name: "핀볼 캐스케이드",
    distance: "중거리",
    duration: "약 7초",
    description: "촘촘한 핀과 두 갈래 게이트를 연속으로 통과하는 표준 코스",
    height: 860,
    finishY: CASCADE_FINISH_Y,
    startY: 112,
    gravity: 665,
    maxSpeed: 840,
    pegs: [
      ...createPegGrid({ top: 190, rows: 5, spacingY: 43 }),
    ],
    segments: [
      ...createCourseWalls(CASCADE_FINISH_Y),
      { ax: 28, ay: 510, bx: 270, by: 550 },
      { ax: 692, ay: 510, bx: 450, by: 550 },
      { ax: 278, ay: 594, bx: 360, by: 536 },
      { ax: 442, ay: 594, bx: 360, by: 536 },
    ],
    spinners: [
      {
        x: 210,
        y: 438,
        halfLength: 46,
        angularVelocity: 3.1,
        initialAngle: 0,
        arms: 1,
      },
      {
        x: 510,
        y: 438,
        halfLength: 46,
        angularVelocity: -3.1,
        initialAngle: Math.PI / 2,
        arms: 1,
      },
      {
        x: 360,
        y: 610,
        halfLength: 54,
        angularVelocity: 2.4,
        initialAngle: 0.7,
        arms: 2,
      },
    ],
  },
  {
    id: "odyssey",
    number: "03",
    name: "노부스 오디세이",
    distance: "장거리",
    duration: "약 11초",
    description: "네 번의 스위치백과 최종 핀 구간을 버텨야 하는 장거리 코스",
    height: 1_130,
    finishY: ODYSSEY_FINISH_Y,
    startY: 112,
    gravity: 630,
    maxSpeed: 820,
    pegs: [
      ...createPegGrid({ top: 178, rows: 3, spacingY: 42 }),
      ...createPegGrid({ top: 875, rows: 3, spacingY: 42 }),
    ],
    segments: [
      ...createCourseWalls(ODYSSEY_FINISH_Y),
      { ax: 28, ay: 306, bx: 568, by: 372 },
      { ax: 692, ay: 494, bx: 152, by: 560 },
      { ax: 28, ay: 682, bx: 568, by: 748 },
      { ax: 692, ay: 810, bx: 468, by: 848 },
    ],
    spinners: [
      {
        x: 212,
        y: 435,
        halfLength: 58,
        angularVelocity: 2.7,
        initialAngle: 0.3,
        arms: 1,
      },
      {
        x: 508,
        y: 625,
        halfLength: 58,
        angularVelocity: -2.9,
        initialAngle: 1.2,
        arms: 1,
      },
      {
        x: 230,
        y: 798,
        halfLength: 48,
        angularVelocity: -3.5,
        initialAngle: 0.8,
        arms: 2,
      },
      {
        x: 500,
        y: 954,
        halfLength: 46,
        angularVelocity: 3.6,
        initialAngle: 0,
        arms: 1,
      },
    ],
  },
  {
    id: "classic",
    number: "04",
    name: "포춘 클래식",
    distance: "원본풍",
    duration: "약 9초",
    description: "분기·지그재그·핀 숲을 잇는 Marble Roulette 감성의 대표 코스",
    height: 1_030,
    finishY: CLASSIC_FINISH_Y,
    startY: 112,
    gravity: 645,
    maxSpeed: 830,
    pegs: [
      ...createPegGrid({
        top: 270,
        rows: 2,
        columns: 9,
        startX: 88,
        spacingX: 68,
        spacingY: 50,
      }),
    ],
    segments: [
      ...createCourseWalls(CLASSIC_FINISH_Y),
      { ax: 28, ay: 178, bx: 284, by: 244 },
      { ax: 692, ay: 178, bx: 436, by: 244 },
      { ax: 28, ay: 470, bx: 450, by: 530 },
      { ax: 692, ay: 610, bx: 270, by: 670 },
    ],
    spinners: [
      {
        x: 205,
        y: 385,
        halfLength: 48,
        angularVelocity: 3.4,
        initialAngle: 0.4,
        arms: 1,
      },
      {
        x: 520,
        y: 410,
        halfLength: 48,
        angularVelocity: -3.2,
        initialAngle: 1.1,
        arms: 1,
      },
      {
        x: 555,
        y: 535,
        halfLength: 46,
        angularVelocity: 3.8,
        initialAngle: 0.2,
        arms: 1,
      },
      {
        x: 165,
        y: 690,
        halfLength: 46,
        angularVelocity: -4.1,
        initialAngle: 0.6,
        arms: 1,
      },
      {
        x: 440,
        y: 805,
        halfLength: 58,
        angularVelocity: 2.7,
        initialAngle: 1.2,
        arms: 2,
      },
    ],
  },
];

export const ROULETTE_DEFAULT_COURSE_ID: RouletteCourseId = "classic";

const COURSE_BY_ID = new Map(
  ROULETTE_COURSES.map((course) => [course.id, course]),
);

export function getRouletteCourse(courseId: RouletteCourseId): RouletteCourse {
  return COURSE_BY_ID.get(courseId) ?? ROULETTE_COURSES[0];
}

/** 동일 seed에 동일 순서를 돌려주는 작은 결정적 PRNG. */
export function createRouletteRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function shuffleRouletteParticipants<T>(
  participants: readonly T[],
  seed: number,
): T[] {
  return shuffleWithRandom(participants, createRouletteRandom(seed));
}

export function createRouletteRace(
  participants: readonly RouletteParticipant[],
  seed: number,
  options: RouletteCourseId | RouletteRaceOptions = {},
): RouletteRace {
  if (
    participants.length < ROULETTE_MIN_PARTICIPANTS ||
    participants.length > ROULETTE_MAX_PARTICIPANTS
  ) {
    throw new RangeError(
      `참가자는 ${ROULETTE_MIN_PARTICIPANTS}명 이상 ${ROULETTE_MAX_PARTICIPANTS}명 이하여야 합니다.`,
    );
  }

  if (new Set(participants.map((participant) => participant.id)).size !== participants.length) {
    throw new RangeError("참가자 ID는 중복될 수 없습니다.");
  }

  const resolvedOptions =
    typeof options === "string" ? { courseId: options } : options;
  const course = getRouletteCourse(
    resolvedOptions.courseId ?? ROULETTE_DEFAULT_COURSE_ID,
  );
  const winnerMode = resolvedOptions.winnerMode ?? "first";
  const winnerCount = resolvedOptions.winnerCount ?? 1;
  const ballsPerParticipant = resolvedOptions.ballsPerParticipant ?? 1;

  if (winnerMode !== "first" && winnerMode !== "last") {
    throw new RangeError("당첨 방식은 선착 또는 후착만 사용할 수 있습니다.");
  }

  if (
    !Number.isInteger(winnerCount) ||
    winnerCount < 1 ||
    winnerCount > Math.min(ROULETTE_MAX_WINNERS, participants.length)
  ) {
    throw new RangeError(
      `당첨 인원은 1명 이상 ${Math.min(ROULETTE_MAX_WINNERS, participants.length)}명 이하여야 합니다.`,
    );
  }

  if (
    !Number.isInteger(ballsPerParticipant) ||
    ballsPerParticipant < ROULETTE_MIN_BALLS_PER_PARTICIPANT ||
    ballsPerParticipant > ROULETTE_MAX_BALLS_PER_PARTICIPANT
  ) {
    throw new RangeError(
      `1인당 마블 수는 ${ROULETTE_MIN_BALLS_PER_PARTICIPANT}개 이상 ${ROULETTE_MAX_BALLS_PER_PARTICIPANT}개 이하여야 합니다.`,
    );
  }

  const totalBalls = participants.length * ballsPerParticipant;
  if (totalBalls > ROULETTE_MAX_TOTAL_BALLS) {
    throw new RangeError(
      `전체 마블은 최대 ${ROULETTE_MAX_TOTAL_BALLS}개까지 사용할 수 있습니다.`,
    );
  }

  const random = createRouletteRandom(seed);
  const entries = participants.flatMap((participant, participantIndex) =>
    Array.from({ length: ballsPerParticipant }, () => ({
      participant,
      participantIndex,
    })),
  );
  const shuffled = shuffleWithRandom(entries, random);
  const ballRadius = totalBalls > 64 ? 10 : totalBalls > 32 ? 12 : BALL_RADIUS;
  const columns = Math.min(
    totalBalls > 64 ? 20 : totalBalls > 32 ? 16 : 10,
    totalBalls,
  );
  const spacing = Math.min(
    ballRadius * 2 + 12,
    620 / Math.max(columns - 1, 1),
  );
  const rowSpacing = ballRadius * 2 + 4;

  const balls = shuffled.map((entry, index): RouletteBall => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.ceil(shuffled.length / columns);
    const rowColumns = Math.min(columns, shuffled.length - row * columns);
    const rowStartX =
      (ROULETTE_BOARD_WIDTH - spacing * (rowColumns - 1)) / 2;
    const hue =
      (entry.participantIndex * 137.508 + seed * 0.0001) % 360;

    return {
      ...entry.participant,
      ballId: index,
      color: `hsl(${hue.toFixed(1)} 68% 43%)`,
      x: rowStartX + column * spacing + (random() - 0.5) * 7,
      y:
        course.startY -
        (rowCount - row - 1) * rowSpacing +
        (random() - 0.5) * 3,
      vx: (random() - 0.5) * 32,
      vy: 16 + random() * 20,
      radius: ballRadius,
      finished: false,
    };
  });

  return {
    seed: seed >>> 0,
    courseId: course.id,
    elapsedSeconds: 0,
    balls,
    winnerMode,
    winnerCount,
    ballsPerParticipant,
    finishOrder: [],
    winnerParticipantIds: [],
    winnerBallIds: [],
    done: false,
  };
}

function shuffleWithRandom<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}

export function getRouletteSpinnerSegments(
  spinner: RouletteSpinner,
  elapsedSeconds: number,
): RouletteSegment[] {
  const angle =
    spinner.initialAngle + spinner.angularVelocity * elapsedSeconds;
  const angles = spinner.arms === 2 ? [angle, angle + Math.PI / 2] : [angle];

  return angles.map((armAngle) => {
    const dx = Math.cos(armAngle) * spinner.halfLength;
    const dy = Math.sin(armAngle) * spinner.halfLength;
    return {
      ax: spinner.x - dx,
      ay: spinner.y - dy,
      bx: spinner.x + dx,
      by: spinner.y + dy,
    };
  });
}

export function stepRouletteRace(
  race: RouletteRace,
  deltaSeconds = ROULETTE_FIXED_STEP_SECONDS,
): void {
  if (race.done) return;

  const course = getRouletteCourse(race.courseId);
  const dt = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
  race.elapsedSeconds += dt;

  for (const ball of race.balls) {
    if (ball.finished) continue;

    ball.vy += course.gravity * dt;
    const damping = Math.pow(0.998, dt * 60);
    ball.vx *= damping;
    ball.vy *= Math.pow(0.9995, dt * 60);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    keepInsideSideWalls(ball);
    for (const peg of course.pegs) resolvePegCollision(ball, peg);
    for (const segment of course.segments) {
      resolveSegmentCollision(ball, segment);
    }
    for (const spinner of course.spinners) {
      for (const segment of getRouletteSpinnerSegments(
        spinner,
        race.elapsedSeconds,
      )) {
        resolveSpinnerCollision(ball, spinner, segment);
      }
      resolvePegCollision(ball, { x: spinner.x, y: spinner.y, radius: 11 });
    }
    capVelocity(ball, course.maxSpeed);
  }

  for (let iteration = 0; iteration < 2; iteration += 1) {
    resolveBallCollisions(race.balls);
  }

  for (const ball of race.balls) {
    if (ball.finished || ball.y - ball.radius <= course.finishY) continue;

    ball.finished = true;
    ball.y = course.finishY + ball.radius;
    ball.vx = 0;
    ball.vy = 0;
    race.finishOrder.push({ participantId: ball.id, ballId: ball.ballId });

    if (
      race.winnerMode === "first" &&
      !race.winnerParticipantIds.includes(ball.id)
    ) {
      race.winnerParticipantIds.push(ball.id);
      race.winnerBallIds.push(ball.ballId);
      if (race.winnerParticipantIds.length === race.winnerCount) {
        race.done = true;
        break;
      }
    }
  }

  if (
    race.winnerMode === "last" &&
    race.balls.every((ball) => ball.finished)
  ) {
    for (
      let index = race.finishOrder.length - 1;
      index >= 0 && race.winnerParticipantIds.length < race.winnerCount;
      index -= 1
    ) {
      const finish = race.finishOrder[index];
      if (race.winnerParticipantIds.includes(finish.participantId)) continue;
      race.winnerParticipantIds.push(finish.participantId);
      race.winnerBallIds.push(finish.ballId);
    }
    race.done = true;
  }
}

function keepInsideSideWalls(ball: RouletteBall): void {
  const left = LEFT_WALL + ball.radius;
  const right = RIGHT_WALL - ball.radius;

  if (ball.x < left) {
    ball.x = left;
    ball.vx = Math.abs(ball.vx) * 0.68;
  } else if (ball.x > right) {
    ball.x = right;
    ball.vx = -Math.abs(ball.vx) * 0.68;
  }
}

function resolvePegCollision(ball: RouletteBall, peg: RoulettePeg): void {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const minimumDistance = ball.radius + peg.radius;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= minimumDistance * minimumDistance) return;

  const distance = Math.sqrt(distanceSquared) || minimumDistance;
  const nx = distanceSquared === 0 ? 0 : dx / distance;
  const ny = distanceSquared === 0 ? -1 : dy / distance;
  const overlap = minimumDistance - distance;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  const normalVelocity = ball.vx * nx + ball.vy * ny;
  if (normalVelocity < 0) {
    const impulse = -(1 + 0.72) * normalVelocity;
    ball.vx += nx * impulse;
    ball.vy += ny * impulse;
  }
}

function resolveSegmentCollision(
  ball: RouletteBall,
  segment: RouletteSegment,
): void {
  const abx = segment.bx - segment.ax;
  const aby = segment.by - segment.ay;
  const lengthSquared = abx * abx + aby * aby;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((ball.x - segment.ax) * abx +
              (ball.y - segment.ay) * aby) /
              lengthSquared,
          ),
        );
  const closestX = segment.ax + abx * projection;
  const closestY = segment.ay + aby * projection;
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= ball.radius * ball.radius) return;

  const distance = Math.sqrt(distanceSquared);
  const fallbackLength = Math.sqrt(lengthSquared) || 1;
  const nx = distance === 0 ? -aby / fallbackLength : dx / distance;
  const ny = distance === 0 ? abx / fallbackLength : dy / distance;
  const overlap = ball.radius - distance;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  const normalVelocity = ball.vx * nx + ball.vy * ny;
  if (normalVelocity < 0) {
    const impulse = -(1 + 0.62) * normalVelocity;
    ball.vx += nx * impulse;
    ball.vy += ny * impulse;
  }
}

function resolveSpinnerCollision(
  ball: RouletteBall,
  spinner: RouletteSpinner,
  segment: RouletteSegment,
): void {
  const abx = segment.bx - segment.ax;
  const aby = segment.by - segment.ay;
  const lengthSquared = abx * abx + aby * aby;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((ball.x - segment.ax) * abx +
              (ball.y - segment.ay) * aby) /
              lengthSquared,
          ),
        );
  const closestX = segment.ax + abx * projection;
  const closestY = segment.ay + aby * projection;
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const collisionDistance = ball.radius + 7;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= collisionDistance * collisionDistance) return;

  const distance = Math.sqrt(distanceSquared);
  const fallbackLength = Math.sqrt(lengthSquared) || 1;
  const nx = distance === 0 ? -aby / fallbackLength : dx / distance;
  const ny = distance === 0 ? abx / fallbackLength : dy / distance;
  const overlap = collisionDistance - distance;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  const radiusX = closestX - spinner.x;
  const radiusY = closestY - spinner.y;
  const surfaceVx = -spinner.angularVelocity * radiusY;
  const surfaceVy = spinner.angularVelocity * radiusX;
  const relativeNormalVelocity =
    (ball.vx - surfaceVx) * nx + (ball.vy - surfaceVy) * ny;

  if (relativeNormalVelocity < 0) {
    const impulse = -(1 + 0.76) * relativeNormalVelocity;
    ball.vx += nx * impulse;
    ball.vy += ny * impulse;
  }
}

function resolveBallCollisions(balls: RouletteBall[]): void {
  for (let firstIndex = 0; firstIndex < balls.length; firstIndex += 1) {
    const first = balls[firstIndex];
    if (first.finished) continue;

    for (
      let secondIndex = firstIndex + 1;
      secondIndex < balls.length;
      secondIndex += 1
    ) {
      const second = balls[secondIndex];
      if (second.finished) continue;

      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const minimumDistance = first.radius + second.radius;
      const distanceSquared = dx * dx + dy * dy;
      if (
        distanceSquared === 0 ||
        distanceSquared >= minimumDistance * minimumDistance
      ) {
        continue;
      }

      const distance = Math.sqrt(distanceSquared);
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = (minimumDistance - distance) / 2;
      first.x -= nx * overlap;
      first.y -= ny * overlap;
      second.x += nx * overlap;
      second.y += ny * overlap;

      const relativeVx = second.vx - first.vx;
      const relativeVy = second.vy - first.vy;
      const normalVelocity = relativeVx * nx + relativeVy * ny;
      if (normalVelocity >= 0) continue;

      const impulse = (-(1 + 0.64) * normalVelocity) / 2;
      first.vx -= impulse * nx;
      first.vy -= impulse * ny;
      second.vx += impulse * nx;
      second.vy += impulse * ny;
    }
  }
}

function capVelocity(ball: RouletteBall, maxSpeed: number): void {
  const speedSquared = ball.vx * ball.vx + ball.vy * ball.vy;
  if (speedSquared <= maxSpeed * maxSpeed) return;

  const scale = maxSpeed / Math.sqrt(speedSquared);
  ball.vx *= scale;
  ball.vy *= scale;
}
