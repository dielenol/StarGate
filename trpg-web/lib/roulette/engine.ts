export const ROULETTE_BOARD_WIDTH = 720;
export const ROULETTE_BOARD_HEIGHT = 760;
export const ROULETTE_MIN_PARTICIPANTS = 2;
export const ROULETTE_MAX_PARTICIPANTS = 32;
export const ROULETTE_FIXED_STEP_SECONDS = 1 / 120;

const BALL_RADIUS = 11;
const PEG_RADIUS = 6;
const LEFT_WALL = 28;
const RIGHT_WALL = ROULETTE_BOARD_WIDTH - 28;
const FINISH_Y = ROULETTE_BOARD_HEIGHT - 34;
const GRAVITY = 610;
const MAX_SPEED = 820;

export interface RouletteBall {
  id: number;
  name: string;
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

export interface RouletteRace {
  seed: number;
  elapsedSeconds: number;
  balls: RouletteBall[];
  finishOrder: string[];
  winnerBallId: number | null;
  done: boolean;
}

export const ROULETTE_PEGS: readonly RoulettePeg[] = createPegs();

export const ROULETTE_SEGMENTS: readonly RouletteSegment[] = [
  { ax: LEFT_WALL, ay: 78, bx: LEFT_WALL, by: 650 },
  { ax: RIGHT_WALL, ay: 78, bx: RIGHT_WALL, by: 650 },
  { ax: LEFT_WALL, ay: 650, bx: 122, by: FINISH_Y },
  { ax: RIGHT_WALL, ay: 650, bx: 598, by: FINISH_Y },
];

function createPegs(): RoulettePeg[] {
  const pegs: RoulettePeg[] = [];

  for (let row = 0; row < 13; row += 1) {
    const shifted = row % 2 === 1;
    const columns = shifted ? 9 : 10;
    const startX = shifted ? 104 : 72;

    for (let column = 0; column < columns; column += 1) {
      pegs.push({
        x: startX + column * 64,
        y: 154 + row * 39,
        radius: PEG_RADIUS,
      });
    }
  }

  return pegs;
}

/** 쉼표 또는 줄바꿈으로 구분한 참가자 이름을 정규화한다. */
export function parseRouletteParticipants(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((name) => Array.from(name).slice(0, 24).join(""));
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

export function shuffleRouletteParticipants(
  participants: readonly string[],
  seed: number,
): string[] {
  const shuffled = [...participants];
  const random = createRouletteRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}

export function createRouletteRace(
  participants: readonly string[],
  seed: number,
): RouletteRace {
  if (
    participants.length < ROULETTE_MIN_PARTICIPANTS ||
    participants.length > ROULETTE_MAX_PARTICIPANTS
  ) {
    throw new RangeError(
      `참가자는 ${ROULETTE_MIN_PARTICIPANTS}명 이상 ${ROULETTE_MAX_PARTICIPANTS}명 이하여야 합니다.`,
    );
  }

  const random = createRouletteRandom(seed);
  const shuffled = shuffleWithRandom(participants, random);
  const columns = Math.min(12, shuffled.length);
  const spacing = Math.min(48, 620 / Math.max(columns - 1, 1));
  const startX = (ROULETTE_BOARD_WIDTH - spacing * (columns - 1)) / 2;

  const balls = shuffled.map((name, index): RouletteBall => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.ceil(shuffled.length / columns);
    const rowColumns = Math.min(columns, shuffled.length - row * columns);
    const rowStartX =
      (ROULETTE_BOARD_WIDTH - spacing * (rowColumns - 1)) / 2;
    const hue = (index * 137.508 + seed * 0.0001) % 360;

    return {
      id: index,
      name,
      color: `hsl(${hue.toFixed(1)} 82% 64%)`,
      x:
        (rowColumns === columns ? startX : rowStartX) +
        column * spacing +
        (random() - 0.5) * 8,
      y: 86 - (rowCount - row - 1) * 29 + (random() - 0.5) * 4,
      vx: (random() - 0.5) * 34,
      vy: 18 + random() * 22,
      radius: BALL_RADIUS,
      finished: false,
    };
  });

  return {
    seed: seed >>> 0,
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

  const dt = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
  race.elapsedSeconds += dt;

  for (const ball of race.balls) {
    if (ball.finished) continue;

    ball.vy += GRAVITY * dt;
    const damping = Math.pow(0.998, dt * 60);
    ball.vx *= damping;
    ball.vy *= Math.pow(0.9995, dt * 60);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    keepInsideSideWalls(ball);
    for (const peg of ROULETTE_PEGS) resolvePegCollision(ball, peg);
    for (const segment of ROULETTE_SEGMENTS) {
      resolveSegmentCollision(ball, segment);
    }
    capVelocity(ball);
  }

  for (let iteration = 0; iteration < 2; iteration += 1) {
    resolveBallCollisions(race.balls);
  }

  for (const ball of race.balls) {
    if (ball.finished || ball.y - ball.radius <= FINISH_Y) continue;

    ball.finished = true;
    ball.y = FINISH_Y + ball.radius;
    ball.vx = 0;
    ball.vy = 0;
    race.finishOrder.push(ball.name);
    race.winnerBallId = ball.id;
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

function capVelocity(ball: RouletteBall): void {
  const speedSquared = ball.vx * ball.vx + ball.vy * ball.vy;
  if (speedSquared <= MAX_SPEED * MAX_SPEED) return;

  const scale = MAX_SPEED / Math.sqrt(speedSquared);
  ball.vx *= scale;
  ball.vy *= scale;
}

export function getRouletteFinishY(): number {
  return FINISH_Y;
}
