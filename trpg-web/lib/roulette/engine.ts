export const ROULETTE_BOARD_WIDTH = 720;
export const ROULETTE_MIN_PARTICIPANTS = 2;
export const ROULETTE_MAX_PARTICIPANTS = 32;
export const ROULETTE_FIXED_STEP_SECONDS = 1 / 120;

const BALL_RADIUS = 15;
const LEFT_WALL = 28;
const RIGHT_WALL = ROULETTE_BOARD_WIDTH - 28;

export type RouletteCourseId = "sprint" | "cascade" | "odyssey" | "classic";

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
}

export interface RouletteRace {
  seed: number;
  courseId: RouletteCourseId;
  elapsedSeconds: number;
  balls: RouletteBall[];
  finishOrder: string[];
  winnerBallId: number | null;
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
      ...createPegGrid({ top: 190, rows: 6, spacingY: 43 }),
      ...createPegGrid({ top: 530, rows: 5, spacingY: 43 }),
    ],
    segments: [
      ...createCourseWalls(CASCADE_FINISH_Y),
      { ax: 28, ay: 470, bx: 270, by: 514 },
      { ax: 692, ay: 470, bx: 450, by: 514 },
      { ax: 314, ay: 482, bx: 360, by: 520 },
      { ax: 406, ay: 482, bx: 360, by: 520 },
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
      ...createPegGrid({ top: 875, rows: 4, spacingY: 42 }),
    ],
    segments: [
      ...createCourseWalls(ODYSSEY_FINISH_Y),
      { ax: 28, ay: 306, bx: 568, by: 372 },
      { ax: 692, ay: 494, bx: 152, by: 560 },
      { ax: 28, ay: 682, bx: 568, by: 748 },
      { ax: 692, ay: 810, bx: 468, by: 848 },
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
      ...createPegRow(310, [120, 225, 495, 600], 10),
      ...createPegRow(390, [80, 180, 280, 440, 540, 640], 8),
      ...createPegGrid({
        top: 690,
        rows: 6,
        columns: 9,
        startX: 88,
        spacingX: 68,
        spacingY: 40,
      }),
    ],
    segments: [
      ...createCourseWalls(CLASSIC_FINISH_Y),
      { ax: 28, ay: 178, bx: 284, by: 244 },
      { ax: 692, ay: 178, bx: 436, by: 244 },
      { ax: 28, ay: 448, bx: 446, by: 508 },
      { ax: 692, ay: 552, bx: 274, by: 612 },
      { ax: 286, ay: 632, bx: 350, by: 674 },
      { ax: 434, ay: 632, bx: 370, by: 674 },
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
  courseId: RouletteCourseId = ROULETTE_DEFAULT_COURSE_ID,
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

  const course = getRouletteCourse(courseId);
  const random = createRouletteRandom(seed);
  const shuffled = shuffleWithRandom(participants, random);
  const columns = Math.min(10, shuffled.length);
  const spacing = Math.min(56, 610 / Math.max(columns - 1, 1));

  const balls = shuffled.map((participant, index): RouletteBall => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.ceil(shuffled.length / columns);
    const rowColumns = Math.min(columns, shuffled.length - row * columns);
    const rowStartX =
      (ROULETTE_BOARD_WIDTH - spacing * (rowColumns - 1)) / 2;
    const hue = (index * 137.508 + seed * 0.0001) % 360;

    return {
      ...participant,
      ballId: index,
      color: `hsl(${hue.toFixed(1)} 68% 43%)`,
      x: rowStartX + column * spacing + (random() - 0.5) * 7,
      y:
        course.startY -
        (rowCount - row - 1) * 34 +
        (random() - 0.5) * 3,
      vx: (random() - 0.5) * 32,
      vy: 16 + random() * 20,
      radius: BALL_RADIUS,
      finished: false,
    };
  });

  return {
    seed: seed >>> 0,
    courseId: course.id,
    elapsedSeconds: 0,
    balls,
    finishOrder: [],
    winnerBallId: null,
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
    race.finishOrder.push(ball.id);
    race.winnerBallId = ball.ballId;
    race.done = true;
    break;
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
