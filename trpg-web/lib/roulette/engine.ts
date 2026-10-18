export const ROULETTE_BOARD_WIDTH = 720;
export const ROULETTE_MIN_PARTICIPANTS = 2;
export const ROULETTE_MAX_PARTICIPANTS = 32;
export const ROULETTE_FIXED_STEP_SECONDS = 1 / 120;
export const ROULETTE_MAX_WINNERS = 10;
export const ROULETTE_MIN_BALLS_PER_PARTICIPANT = 1;
export const ROULETTE_MAX_BALLS_PER_PARTICIPANT = 10;
export const ROULETTE_MAX_TOTAL_BALLS = 96;
/** 카메라가 목표 위치로 수렴하는 속도(초당 지수 감쇠 비율). */
export const ROULETTE_CAMERA_SMOOTHING_PER_SECOND = 5;
/** 카메라 창에서 추적 마블을 중앙보다 이만큼 위에 두어 진행 방향(아래)을 먼저 보여 준다. */
export const ROULETTE_CAMERA_LEAD_RATIO = 0.15;

const BALL_RADIUS = 15;
const LEFT_WALL = 28;
const RIGHT_WALL = ROULETTE_BOARD_WIDTH - 28;
/** 왕복 막대의 충돌 반폭. 회전 막대와 같은 두께로 그린다. */
const MOVER_HALF_THICKNESS = 7;
const MOVER_RESTITUTION = 0.7;
/** 추적 마블이 창 아래쪽 이 비율 안으로는 내려가지 않게 카메라 지연을 묶는다. */
const CAMERA_BOTTOM_MARGIN_RATIO = 0.1;
/**
 * 목표 대비 허용 최대 지연(창 높이 배수). 추적 마블은 목표 창의 위에서 (0.5 − lead) 지점에
 * 있으므로, 창 바닥 여유를 빼면 목표보다 이만큼 위까지만 뒤처질 수 있다.
 */
const CAMERA_MAX_LAG_RATIO =
  0.5 - CAMERA_BOTTOM_MARGIN_RATIO + ROULETTE_CAMERA_LEAD_RATIO;

export type RouletteCourseId =
  | "sprint"
  | "cascade"
  | "odyssey"
  | "classic"
  | "marathon";
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
  /** 접촉 시 법선 방향으로 더해 주는 속도(px/s). 핀볼의 팝 범퍼. */
  kick?: number;
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
  /** 지름 전체를 가로지르는 막대 수. 2 이상이면 π/arms 간격으로 고르게 배치된다. */
  arms: 1 | 2 | 3 | 4;
}

/** 휴지 위치(ax,ay)-(bx,by)를 중심으로 (dx, dy)만큼 사인 왕복하는 막대. */
export interface RouletteMover {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dx: number;
  dy: number;
  /** 왕복 한 번에 걸리는 시간(초). */
  period: number;
  /** 위상(라디안). 같은 주기의 막대를 엇갈리게 움직일 때 쓴다. */
  phase: number;
}

export interface RouletteMoverState {
  segment: RouletteSegment;
  vx: number;
  vy: number;
}

export interface RouletteCourse {
  id: RouletteCourseId;
  number: string;
  name: string;
  distance: string;
  duration: string;
  /** 보통 인원에서 기대하는 완주 시간(초). 재생 속도 보정과 테스트 시간 제한의 기준. */
  expectedSeconds: number;
  description: string;
  height: number;
  /**
   * 카메라 창의 논리 높이. 코스 높이보다 작으면 선두(선착) 또는 후미(후착) 마블을
   * 따라가는 카메라로 그린다. 생략하면 코스 전체를 한 화면에 그린다.
   */
  viewHeight?: number;
  finishY: number;
  startY: number;
  gravity: number;
  maxSpeed: number;
  pegs: readonly RoulettePeg[];
  segments: readonly RouletteSegment[];
  spinners: readonly RouletteSpinner[];
  movers: readonly RouletteMover[];
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

function createBumperRow(
  y: number,
  xs: readonly number[],
  kick = 240,
  radius = 13,
): RoulettePeg[] {
  return xs.map((x) => ({ x, y, radius, kick }));
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
const MARATHON_FINISH_Y = 2_700;

export const ROULETTE_COURSES: readonly RouletteCourse[] = [
  {
    id: "sprint",
    number: "01",
    name: "퀵 드롭",
    distance: "단거리",
    duration: "약 4초",
    expectedSeconds: 4,
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
        halfLength: 92,
        angularVelocity: 1.8,
        initialAngle: 0.25,
        arms: 1,
      },
      {
        x: 495,
        y: 405,
        halfLength: 98,
        angularVelocity: -2,
        initialAngle: 1.1,
        arms: 1,
      },
    ],
    movers: [],
  },
  {
    id: "cascade",
    number: "02",
    name: "핀볼 캐스케이드",
    distance: "중거리",
    duration: "약 7초",
    expectedSeconds: 7,
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
        y: 400,
        halfLength: 84,
        angularVelocity: 1.55,
        initialAngle: 0,
        arms: 1,
      },
      {
        x: 510,
        y: 400,
        halfLength: 84,
        angularVelocity: -1.55,
        initialAngle: Math.PI / 2,
        arms: 1,
      },
      {
        x: 360,
        y: 675,
        halfLength: 96,
        angularVelocity: 1.25,
        initialAngle: 0.7,
        arms: 2,
      },
    ],
    movers: [],
  },
  {
    id: "odyssey",
    number: "03",
    name: "노부스 오디세이",
    distance: "장거리",
    duration: "약 11초",
    expectedSeconds: 11,
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
        halfLength: 104,
        angularVelocity: 1.4,
        initialAngle: 0.3,
        arms: 1,
      },
      {
        x: 508,
        y: 625,
        halfLength: 108,
        angularVelocity: -1.55,
        initialAngle: 1.2,
        arms: 1,
      },
      {
        x: 230,
        y: 798,
        halfLength: 92,
        angularVelocity: -1.8,
        initialAngle: 0.8,
        arms: 2,
      },
      {
        x: 500,
        y: 954,
        halfLength: 96,
        angularVelocity: 1.9,
        initialAngle: 0,
        arms: 1,
      },
    ],
    movers: [],
  },
  {
    id: "classic",
    number: "04",
    name: "포춘 클래식",
    distance: "원본풍",
    duration: "약 9초",
    expectedSeconds: 9,
    description: "분기·지그재그·핀 숲을 잇는 다채 룰렛의 대표 코스",
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
        y: 360,
        halfLength: 82,
        angularVelocity: 1.7,
        initialAngle: 0.4,
        arms: 1,
      },
      {
        x: 520,
        y: 410,
        halfLength: 98,
        angularVelocity: -1.6,
        initialAngle: 1.1,
        arms: 1,
      },
      {
        x: 555,
        y: 535,
        halfLength: 88,
        angularVelocity: 1.9,
        initialAngle: 0.2,
        arms: 1,
      },
      {
        x: 165,
        y: 690,
        halfLength: 82,
        angularVelocity: -2.05,
        initialAngle: 0.6,
        arms: 1,
      },
      {
        x: 440,
        y: 805,
        halfLength: 106,
        angularVelocity: 1.35,
        initialAngle: 1.2,
        arms: 2,
      },
    ],
    movers: [],
  },
  {
    id: "marathon",
    number: "05",
    name: "그랜드 마라톤",
    distance: "초장거리",
    duration: "약 20초",
    expectedSeconds: 20,
    description:
      "핀 숲·삼중 휠·범퍼 필드·터빈·왕복 패들·피스톤을 차례로 지나는 카메라 추적 장거리 코스",
    height: 2_740,
    viewHeight: 960,
    finishY: MARATHON_FINISH_Y,
    startY: 112,
    gravity: 640,
    maxSpeed: 840,
    pegs: [
      // 1구간 핀 숲
      ...createPegGrid({ top: 180, rows: 4, spacingY: 44 }),
      // 2구간 삼중 휠 사이 중앙 범퍼
      ...createBumperRow(470, [360]),
      // 4구간 범퍼 필드
      ...createBumperRow(930, [150, 360, 570]),
      ...createBumperRow(1_010, [255, 465]),
      // 9구간 마지막 핀 숲
      ...createPegGrid({ top: 2_470, rows: 3, spacingY: 44 }),
    ],
    segments: [
      ...createCourseWalls(MARATHON_FINISH_Y),
      // 3구간 스위치백
      { ax: 28, ay: 600, bx: 540, by: 690 },
      { ax: 692, ay: 740, bx: 180, by: 830 },
      // 5구간 터빈 진입 가이드
      { ax: 28, ay: 1_090, bx: 230, by: 1_150 },
      { ax: 692, ay: 1_090, bx: 490, by: 1_150 },
      // 5구간 터빈 아래 분배기
      { ax: 360, ay: 1_420, bx: 150, by: 1_490 },
      { ax: 360, ay: 1_420, bx: 570, by: 1_490 },
      // 6구간 패들 존 진입 깔때기
      { ax: 28, ay: 1_560, bx: 250, by: 1_630 },
      { ax: 692, ay: 1_560, bx: 470, by: 1_630 },
    ],
    spinners: [
      // 2구간 삼중 휠
      {
        x: 190,
        y: 460,
        halfLength: 92,
        angularVelocity: 1.5,
        initialAngle: 0.2,
        arms: 3,
      },
      {
        x: 530,
        y: 480,
        halfLength: 92,
        angularVelocity: -1.7,
        initialAngle: 1,
        arms: 3,
      },
      // 5구간 터빈
      {
        x: 360,
        y: 1_250,
        halfLength: 118,
        angularVelocity: 1.1,
        initialAngle: 0.3,
        arms: 4,
      },
      // 7구간 스핀 코리더
      {
        x: 180,
        y: 2_010,
        halfLength: 84,
        angularVelocity: 1.6,
        initialAngle: 0.5,
        arms: 2,
      },
      {
        x: 540,
        y: 2_010,
        halfLength: 84,
        angularVelocity: -1.6,
        initialAngle: 1.3,
        arms: 2,
      },
      // 위 두 휠과의 팁 간격이 마블 통과 폭(2 × (15 + 7))을 넘도록 y 를 둔다.
      {
        x: 360,
        y: 2_150,
        halfLength: 96,
        angularVelocity: 1.3,
        initialAngle: 0,
        arms: 3,
      },
    ],
    movers: [
      // 6구간 좌우 왕복 패들 (기울여서 마블이 올라타도 굴러 떨어진다)
      {
        ax: 260,
        ay: 1_700,
        bx: 360,
        by: 1_740,
        dx: 110,
        dy: 0,
        period: 2.2,
        phase: 0,
      },
      {
        ax: 380,
        ay: 1_850,
        bx: 480,
        by: 1_810,
        dx: 110,
        dy: 0,
        period: 2.6,
        phase: Math.PI / 2,
      },
      // 8구간 상하 피스톤 (올라올 때 마블을 띄운다)
      {
        ax: 120,
        ay: 2_340,
        bx: 260,
        by: 2_380,
        dx: 0,
        dy: 36,
        period: 1.3,
        phase: 0,
      },
      {
        ax: 460,
        ay: 2_380,
        bx: 600,
        by: 2_340,
        dx: 0,
        dy: 36,
        period: 1.3,
        phase: Math.PI,
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
  const segments: RouletteSegment[] = [];

  for (let arm = 0; arm < spinner.arms; arm += 1) {
    const armAngle = angle + (Math.PI * arm) / spinner.arms;
    const dx = Math.cos(armAngle) * spinner.halfLength;
    const dy = Math.sin(armAngle) * spinner.halfLength;
    segments.push({
      ax: spinner.x - dx,
      ay: spinner.y - dy,
      bx: spinner.x + dx,
      by: spinner.y + dy,
    });
  }

  return segments;
}

export function getRouletteMoverState(
  mover: RouletteMover,
  elapsedSeconds: number,
): RouletteMoverState {
  const angularFrequency = (Math.PI * 2) / mover.period;
  const angle = angularFrequency * elapsedSeconds + mover.phase;
  const offset = Math.sin(angle);
  const rate = Math.cos(angle) * angularFrequency;

  return {
    segment: {
      ax: mover.ax + mover.dx * offset,
      ay: mover.ay + mover.dy * offset,
      bx: mover.bx + mover.dx * offset,
      by: mover.by + mover.dy * offset,
    },
    vx: mover.dx * rate,
    vy: mover.dy * rate,
  };
}

export function getRouletteViewHeight(course: RouletteCourse): number {
  return Math.min(course.viewHeight ?? course.height, course.height);
}

export function hasRouletteCamera(course: RouletteCourse): boolean {
  return getRouletteViewHeight(course) < course.height;
}

/**
 * 카메라 창의 위쪽 y. 선착은 선두, 후착은 후미 마블(승부가 갈리는 쪽)을 따라가고,
 * 경주가 끝나면 결승선을 비춘다. 코스 전체가 한 화면에 들어오면 항상 0.
 */
export function getRouletteCameraTop(
  race: RouletteRace | null,
  course: RouletteCourse,
): number {
  const viewHeight = getRouletteViewHeight(course);
  const maxTop = Math.max(0, course.height - viewHeight);
  if (maxTop === 0 || !race) return 0;

  let focusY = course.finishY;
  if (!race.done) {
    const trackTrailer = race.winnerMode === "last";
    let found = false;
    for (const ball of race.balls) {
      if (ball.finished) continue;
      if (!found) {
        focusY = ball.y;
        found = true;
        continue;
      }
      focusY = trackTrailer
        ? Math.min(focusY, ball.y)
        : Math.max(focusY, ball.y);
    }
  }

  const top =
    focusY + viewHeight * ROULETTE_CAMERA_LEAD_RATIO - viewHeight / 2;
  return Math.min(maxTop, Math.max(0, top));
}

/**
 * 카메라를 목표 쪽으로 지수 감쇠로 당긴다. 거의 닿으면 목표값으로 스냅한다.
 * `viewHeight`를 주면 추적 마블이 창 바닥 밖으로 밀려나지 않도록 아래 방향 지연에 상한을 둔다
 * (고배속 낙하 대비). 위 방향(선두 교체)은 그대로 부드럽게 따라간다.
 */
export function stepRouletteCameraTop(
  current: number,
  target: number,
  deltaSeconds: number,
  viewHeight = Number.POSITIVE_INFINITY,
): number {
  const delta = target - current;
  if (Math.abs(delta) < 0.1) return target;

  const blend =
    1 -
    Math.exp(
      -Math.max(deltaSeconds, 0) * ROULETTE_CAMERA_SMOOTHING_PER_SECOND,
    );
  const next = current + delta * blend;
  return Math.max(next, target - viewHeight * CAMERA_MAX_LAG_RATIO);
}

export function stepRouletteRace(
  race: RouletteRace,
  deltaSeconds = ROULETTE_FIXED_STEP_SECONDS,
): void {
  if (race.done) return;

  const course = getRouletteCourse(race.courseId);
  const dt = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
  race.elapsedSeconds += dt;

  // 움직이는 장애물의 자세는 스텝마다 한 번만 계산한다 (모든 마블에 같은 시각을 적용).
  const spinnerSegments = course.spinners.map((spinner) =>
    getRouletteSpinnerSegments(spinner, race.elapsedSeconds),
  );
  const moverStates = course.movers.map((mover) =>
    getRouletteMoverState(mover, race.elapsedSeconds),
  );

  for (const ball of race.balls) {
    if (ball.finished) continue;

    ball.vy += course.gravity * dt;
    const damping = Math.pow(0.998, dt * 60);
    ball.vx *= damping;
    ball.vy *= Math.pow(0.9995, dt * 60);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    keepInsideSideWalls(ball);
    for (const peg of course.pegs) resolveRoulettePegCollision(ball, peg);
    for (const segment of course.segments) {
      resolveSegmentCollision(ball, segment);
    }
    course.spinners.forEach((spinner, index) => {
      for (const segment of spinnerSegments[index]) {
        resolveSpinnerCollision(ball, spinner, segment);
      }
      resolveRoulettePegCollision(ball, {
        x: spinner.x,
        y: spinner.y,
        radius: 11,
      });
    });
    for (const state of moverStates) {
      resolveRouletteMoverCollision(ball, state);
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

/**
 * 마블과 핀의 충돌을 풀고 반발 임펄스를 준다. `kick`이 있는 범퍼는 접근 속도와 무관하게
 * 법선 방향 속도를 더 얹어 튕겨 낸다 (팝 범퍼). 테스트를 위해 공개한다.
 */
export function resolveRoulettePegCollision(
  ball: RouletteBall,
  peg: RoulettePeg,
): void {
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
    const impulse = -(1 + 0.72) * normalVelocity + (peg.kick ?? 0);
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

/**
 * 왕복 막대와의 충돌을 막대의 표면 속도 기준으로 푼다 (올라오는 피스톤은 마블을 띄우고,
 * 멀어지는 막대는 마블을 건드리지 않는다). 테스트를 위해 공개한다.
 */
export function resolveRouletteMoverCollision(
  ball: RouletteBall,
  state: RouletteMoverState,
): void {
  const { segment } = state;
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
  const collisionDistance = ball.radius + MOVER_HALF_THICKNESS;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= collisionDistance * collisionDistance) return;

  const distance = Math.sqrt(distanceSquared);
  const fallbackLength = Math.sqrt(lengthSquared) || 1;
  const nx = distance === 0 ? -aby / fallbackLength : dx / distance;
  const ny = distance === 0 ? abx / fallbackLength : dy / distance;
  const overlap = collisionDistance - distance;
  ball.x += nx * overlap;
  ball.y += ny * overlap;

  // 막대는 평행 이동만 하므로 표면 속도가 접점과 무관하게 일정하다.
  const relativeNormalVelocity =
    (ball.vx - state.vx) * nx + (ball.vy - state.vy) * ny;
  if (relativeNormalVelocity < 0) {
    const impulse = -(1 + MOVER_RESTITUTION) * relativeNormalVelocity;
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
