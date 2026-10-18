import {
  getRouletteMoverState,
  getRouletteSpinnerSegments,
  ROULETTE_BOARD_WIDTH,
  type RouletteBall,
  type RouletteCourse,
  type RouletteMover,
  type RouletteMoverState,
  type RouletteParticipant,
  type RoulettePeg,
  type RouletteRace,
  type RouletteSegment,
  type RouletteSpinner,
} from "./engine";

export interface RouletteView {
  /** 카메라 창의 위쪽 y (논리 좌표). */
  top: number;
  /** 카메라 창의 논리 높이. 코스 높이와 같으면 코스 전체를 그린다. */
  height: number;
}

interface DrawRouletteSceneOptions {
  race: RouletteRace | null;
  previewParticipants: readonly RouletteParticipant[];
  previewElapsedSeconds?: number;
  course: RouletteCourse;
  avatarImages: ReadonlyMap<string, CanvasImageSource>;
  /** 생략하면 코스 전체를 한 화면에 그린다. */
  view?: RouletteView;
}

interface SpinnerPalette {
  /** 조명을 받는 가장자리 */
  light: string;
  base: string;
  /** 그늘진 가장자리 */
  dark: string;
  /** 외곽선 */
  edge: string;
  /** 회전 잔상에 쓰는 "r, g, b" */
  rgb: string;
}

interface Vector {
  x: number;
  y: number;
}

interface StaticLayerCache {
  key: string;
  canvas: HTMLCanvasElement;
}

/*
 * 보드 외곽 형상. engine.ts 의 createCourseWalls 와 같은 치수를 쓴다:
 * 좌우 벽 x=28/692, 깔때기는 finishY-86 에서 시작해 x=232..488 출구로 모인다.
 */
const PLAYFIELD_LEFT = 28;
const PLAYFIELD_RIGHT = ROULETTE_BOARD_WIDTH - 28;
const SIDE_WALL_TOP = 70;
const FUNNEL_DEPTH = 86;
const CHUTE_LEFT = 232;
const CHUTE_RIGHT = 488;
const CHUTE_TOP_OFFSET = 8;

/*
 * engine.ts 의 충돌 치수와 같게 그린다: 회전 막대 반폭 7, 허브 반지름 11.
 * 레일은 두께 0 선분이라 시각 두께만 정한다.
 */
const SPINNER_HALF_THICKNESS = 7;
const SPINNER_HUB_RADIUS = 11;
const RAIL_WIDTH = 9;

/* 정적 레이어는 코스 전체를 담으므로 긴 코스에서 메모리가 커지지 않게 픽셀 수를 제한한다. */
const STATIC_LAYER_MAX_PIXELS = 12_000_000;
/* 카메라 창 밖 요소를 건너뛸 때 쓰는 여유. 마블은 위쪽 이름표까지 포함한다. */
const BALL_CULL_MARGIN = 40;
/* 미니맵은 오른쪽 캐비닛 여백(오른쪽 레일 바깥 ~ 보드 끝 720) 안에 둔다. 주행 영역과 레일을 가리지 않는다. */
const MINIMAP_WIDTH = 21;
const MINIMAP_LEFT = PLAYFIELD_RIGHT + RAIL_WIDTH / 2 + 1;
const MINIMAP_MARGIN = 10;

/* 조명은 왼쪽 위에서 온다. 하이라이트는 이 방향, 그림자는 반대 방향으로 통일한다. */
const LIGHT_X = -0.5;
const LIGHT_Y = -0.866;
const SHADOW_DX = 3;
const SHADOW_DY = 5;

/* 로그인 프리즘과 같은 스펙트럼 순서. 결승·당첨 강조색(금색)과 겹치는 노랑은 뺐다. */
const SPINNER_PALETTES: readonly SpinnerPalette[] = [
  {
    light: "#ffc4ba",
    base: "#ff5f57",
    dark: "#b3243a",
    edge: "#4f0c1b",
    rgb: "255, 95, 87",
  },
  {
    light: "#ffdcaa",
    base: "#ff9a2e",
    dark: "#b2560b",
    edge: "#4d2505",
    rgb: "255, 154, 46",
  },
  {
    light: "#b9f7d2",
    base: "#33cf7f",
    dark: "#12814a",
    edge: "#073722",
    rgb: "51, 207, 127",
  },
  {
    light: "#c0d7ff",
    base: "#4d8bff",
    dark: "#1f46b3",
    edge: "#0c1c57",
    rgb: "77, 139, 255",
  },
  {
    light: "#e0cbff",
    base: "#a06aff",
    dark: "#5b2cbd",
    edge: "#28125c",
    rgb: "160, 106, 255",
  },
  {
    light: "#ffc8ed",
    base: "#ff5bc4",
    dark: "#ab1d82",
    edge: "#4f0a3c",
    rgb: "255, 91, 196",
  },
];

/* 왕복 막대는 스펙트럼 팔레트와 겹치지 않는 청록으로 구분한다. */
const MOVER_PALETTE: SpinnerPalette = {
  light: "#c2f6ff",
  base: "#3ecfe8",
  dark: "#0f7d95",
  edge: "#063340",
  rgb: "62, 207, 232",
};

let staticLayerCache: StaticLayerCache | null = null;

export function drawRouletteScene(
  context: CanvasRenderingContext2D,
  {
    race,
    previewParticipants,
    previewElapsedSeconds = 0,
    course,
    avatarImages,
    view,
  }: DrawRouletteSceneOptions,
): void {
  const activeView: RouletteView = view ?? { top: 0, height: course.height };
  const elapsedSeconds = race?.elapsedSeconds ?? previewElapsedSeconds;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawStaticLayer(context, course, activeView);

  context.save();
  context.translate(0, -activeView.top);
  drawMovers(context, course, elapsedSeconds, activeView);
  drawSpinners(context, course, elapsedSeconds, activeView);

  if (race) {
    const winnerIds = new Set(race.winnerParticipantIds);
    const orderedBalls = race.balls
      .filter((ball) =>
        isWithinView(ball.y, ball.radius + BALL_CULL_MARGIN, activeView),
      )
      .sort((first, second) =>
        first.finished === second.finished
          ? first.y - second.y
          : Number(first.finished) - Number(second.finished),
      );
    for (const ball of orderedBalls) {
      drawBall(
        context,
        ball,
        avatarImages.get(ball.id),
        winnerIds.has(ball.id),
      );
    }
  } else {
    drawPreviewBalls(context, previewParticipants, course, avatarImages);
  }
  context.restore();

  if (activeView.height < course.height) {
    drawMinimap(context, course, race, activeView);
  }
}

function isWithinView(y: number, margin: number, view: RouletteView): boolean {
  return y + margin >= view.top && y - margin <= view.top + view.height;
}

/* ── 정적 레이어: 보드·레일·핀·결승선은 크기나 코스가 바뀔 때만 다시 그린다 ── */

/**
 * 레이어는 코스 전체를 담는다. 카메라가 움직여도 다시 그리지 않고 보이는 구간만 복사한다.
 * 긴 코스에서 픽셀 수가 상한을 넘으면 레이어를 조금 작게 만들고 복사할 때 확대한다.
 */
function drawStaticLayer(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  view: RouletteView,
): void {
  const { width, height } = context.canvas;
  if (width === 0 || height === 0) return;

  const transform = context.getTransform();
  const fullWidth = ROULETTE_BOARD_WIDTH * transform.a;
  const fullHeight = course.height * transform.d;
  const shrink = Math.min(
    1,
    Math.sqrt(STATIC_LAYER_MAX_PIXELS / Math.max(1, fullWidth * fullHeight)),
  );
  const layerWidth = Math.max(1, Math.round(fullWidth * shrink));
  const layerHeight = Math.max(1, Math.round(fullHeight * shrink));
  // 반올림된 레이어 크기에서 배율을 역산해야 복사 소스 사각형이 레이어 밖으로 나가지 않는다.
  const scaleX = layerWidth / ROULETTE_BOARD_WIDTH;
  const scaleY = layerHeight / course.height;
  const key = [course.id, layerWidth, layerHeight].join(":");
  let layer = staticLayerCache?.key === key ? staticLayerCache.canvas : null;

  if (!layer) {
    layer = document.createElement("canvas");
    layer.width = layerWidth;
    layer.height = layerHeight;
    const layerContext = layer.getContext("2d");
    if (!layerContext) {
      context.save();
      context.translate(0, -view.top);
      drawStaticBoard(context, course, transform.a);
      context.restore();
      return;
    }
    layerContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    drawStaticBoard(layerContext, course, scaleX);
    // Safari 는 캔버스 백킹 메모리 회수가 느리므로 이전 레이어를 바로 비운다.
    if (staticLayerCache) {
      staticLayerCache.canvas.width = 0;
      staticLayerCache.canvas.height = 0;
    }
    staticLayerCache = { key, canvas: layer };
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(
    layer,
    0,
    view.top * scaleY,
    layerWidth,
    view.height * scaleY,
    0,
    0,
    width,
    height,
  );
  context.restore();
}

function drawStaticBoard(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  pixelScale: number,
): void {
  drawCabinet(context, course);
  drawPlayfield(context, course);

  const rails = getRailSegments(course);
  // 그림자를 먼저 모두 깔아야 다른 장애물 위로 그림자가 겹쳐 지지 않는다.
  drawRailBases(context, rails, pixelScale);
  drawPegBases(context, course.pegs, pixelScale);
  for (const rail of rails) drawRailBody(context, rail);
  for (const peg of course.pegs) drawPegCap(context, peg);

  drawFinishLine(context, course);
}

function drawCabinet(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  const cabinet = context.createLinearGradient(0, 0, 0, course.height);
  cabinet.addColorStop(0, "#0d1126");
  cabinet.addColorStop(1, "#070914");
  context.fillStyle = cabinet;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.028)";
  context.lineWidth = 1;
  context.beginPath();
  for (
    let offset = -course.height;
    offset < ROULETTE_BOARD_WIDTH;
    offset += 9
  ) {
    context.moveTo(offset, 0);
    context.lineTo(offset + course.height, course.height);
  }
  context.stroke();
  context.restore();
}

function tracePlayfield(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  const funnelTop = course.finishY - FUNNEL_DEPTH;
  const chuteTop = course.finishY - CHUTE_TOP_OFFSET;

  context.beginPath();
  context.moveTo(PLAYFIELD_LEFT, 0);
  context.lineTo(PLAYFIELD_LEFT, funnelTop);
  context.lineTo(CHUTE_LEFT, chuteTop);
  context.lineTo(CHUTE_LEFT, course.height);
  context.lineTo(CHUTE_RIGHT, course.height);
  context.lineTo(CHUTE_RIGHT, chuteTop);
  context.lineTo(PLAYFIELD_RIGHT, funnelTop);
  context.lineTo(PLAYFIELD_RIGHT, 0);
  context.closePath();
}

function drawPlayfield(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  context.save();
  tracePlayfield(context, course);
  const surface = context.createLinearGradient(0, 0, 0, course.height);
  surface.addColorStop(0, "#1e2652");
  surface.addColorStop(0.55, "#161c40");
  surface.addColorStop(1, "#101531");
  context.fillStyle = surface;
  context.fill();
  context.clip();

  const topLight = context.createRadialGradient(
    ROULETTE_BOARD_WIDTH / 2,
    20,
    10,
    ROULETTE_BOARD_WIDTH / 2,
    20,
    470,
  );
  topLight.addColorStop(0, "rgba(140, 155, 255, 0.2)");
  topLight.addColorStop(1, "rgba(140, 155, 255, 0)");
  context.fillStyle = topLight;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);

  // 결승 쪽 조명. 남색 위에 따뜻한 색을 얹으면 탁한 갈색이 되므로 차가운 빛으로 둔다.
  const goalLight = context.createRadialGradient(
    ROULETTE_BOARD_WIDTH / 2,
    course.finishY,
    8,
    ROULETTE_BOARD_WIDTH / 2,
    course.finishY,
    170,
  );
  goalLight.addColorStop(0, "rgba(175, 190, 255, 0.14)");
  goalLight.addColorStop(1, "rgba(175, 190, 255, 0)");
  context.fillStyle = goalLight;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);

  context.fillStyle = "rgba(190, 200, 255, 0.075)";
  context.beginPath();
  for (let y = 18; y < course.height; y += 24) {
    for (let x = PLAYFIELD_LEFT + 14; x < PLAYFIELD_RIGHT; x += 24) {
      context.moveTo(x + 1.1, y);
      context.arc(x, y, 1.1, 0, Math.PI * 2);
    }
  }
  context.fill();

  // 테두리를 따라 안쪽으로 어둡게 눌러 판이 벽보다 한 단 낮아 보이게 한다.
  context.strokeStyle = "rgba(3, 5, 14, 0.38)";
  context.lineWidth = 24;
  context.lineJoin = "round";
  tracePlayfield(context, course);
  context.stroke();
  context.restore();
}

function getRailSegments(course: RouletteCourse): RouletteSegment[] {
  // 엔진은 높이와 무관하게 좌우 벽에서 x 를 막으므로(keepInsideSideWalls) 그림에서도 꼭대기까지 잇는다.
  return [
    {
      ax: PLAYFIELD_LEFT,
      ay: -RAIL_WIDTH,
      bx: PLAYFIELD_LEFT,
      by: SIDE_WALL_TOP,
    },
    {
      ax: PLAYFIELD_RIGHT,
      ay: -RAIL_WIDTH,
      bx: PLAYFIELD_RIGHT,
      by: SIDE_WALL_TOP,
    },
    ...course.segments,
  ];
}

function drawRailBases(
  context: CanvasRenderingContext2D,
  rails: readonly RouletteSegment[],
  pixelScale: number,
): void {
  context.save();
  applyDropShadow(context, pixelScale, 0.55, 6);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#151a3a";
  context.lineWidth = RAIL_WIDTH;
  context.beginPath();
  for (const rail of rails) {
    context.moveTo(rail.ax, rail.ay);
    context.lineTo(rail.bx, rail.by);
  }
  context.stroke();
  context.restore();
}

function drawRailBody(
  context: CanvasRenderingContext2D,
  rail: RouletteSegment,
): void {
  const normal = getLitNormal(rail);
  if (!normal) return;

  const half = RAIL_WIDTH / 2 - 1;
  const midX = (rail.ax + rail.bx) / 2;
  const midY = (rail.ay + rail.by) / 2;
  const body = context.createLinearGradient(
    midX + normal.x * half,
    midY + normal.y * half,
    midX - normal.x * half,
    midY - normal.y * half,
  );
  body.addColorStop(0, "#f4f6ff");
  body.addColorStop(0.28, "#bec6ee");
  body.addColorStop(0.7, "#6b76ac");
  body.addColorStop(1, "#38416f");

  context.save();
  context.lineCap = "round";
  context.strokeStyle = body;
  context.lineWidth = half * 2;
  strokeLine(context, rail.ax, rail.ay, rail.bx, rail.by);

  const offset = half * 0.45;
  context.strokeStyle = "rgba(255, 255, 255, 0.85)";
  context.lineWidth = 1.1;
  strokeLine(
    context,
    rail.ax + normal.x * offset,
    rail.ay + normal.y * offset,
    rail.bx + normal.x * offset,
    rail.by + normal.y * offset,
  );
  context.restore();
}

function drawPegBases(
  context: CanvasRenderingContext2D,
  pegs: readonly RoulettePeg[],
  pixelScale: number,
): void {
  if (pegs.length === 0) return;

  context.save();
  applyDropShadow(context, pixelScale, 0.6, 5);
  context.fillStyle = "#151a3a";
  context.beginPath();
  for (const peg of pegs) {
    context.moveTo(peg.x + peg.radius, peg.y);
    context.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
  }
  context.fill();
  context.restore();
}

function drawPegCap(context: CanvasRenderingContext2D, peg: RoulettePeg): void {
  const { x, y, radius } = peg;
  const bumper = radius >= 10;

  if (bumper) {
    const ring = context.createLinearGradient(x, y - radius, x, y + radius);
    if (peg.kick) {
      // 팝 범퍼는 튕겨 내는 장애물임이 읽히도록 코럴 고무 링과 옅은 테두리 빛을 두른다.
      context.strokeStyle = "rgba(255, 106, 92, 0.32)";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y, radius + 3, 0, Math.PI * 2);
      context.stroke();
      ring.addColorStop(0, "#ffb3a8");
      ring.addColorStop(0.5, "#ff6a5c");
      ring.addColorStop(1, "#a8232f");
    } else {
      // 큰 핀은 범퍼로 보이도록 브랜드 블러플 고무 링을 두른다.
      ring.addColorStop(0, "#a3acff");
      ring.addColorStop(0.5, "#5f6cf0");
      ring.addColorStop(1, "#2c369e");
    }
    context.fillStyle = ring;
    fillCircle(context, x, y, radius - 0.8);
  }

  const capRadius = bumper ? radius - 3.6 : radius - 1;
  const cap = context.createRadialGradient(
    x - capRadius * 0.38,
    y - capRadius * 0.42,
    capRadius * 0.08,
    x,
    y,
    capRadius,
  );
  cap.addColorStop(0, "#ffffff");
  cap.addColorStop(0.32, "#dde2fb");
  cap.addColorStop(0.78, "#8590c4");
  cap.addColorStop(1, "#465080");
  context.fillStyle = cap;
  fillCircle(context, x, y, capRadius);
}

function drawFinishLine(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  const width = CHUTE_RIGHT - CHUTE_LEFT;
  const columns = 40;
  const rows = 2;
  const cell = width / columns;
  const height = cell * rows;
  const top = course.finishY - height / 2;

  context.save();
  roundedRect(context, CHUTE_LEFT, top, width, height, 3);
  context.clip();
  context.fillStyle = "#eef1ff";
  context.fillRect(CHUTE_LEFT, top, width, height);
  context.fillStyle = "#161a35";
  context.beginPath();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row + column) % 2 !== 0) continue;
      context.rect(CHUTE_LEFT + column * cell, top + row * cell, cell, cell);
    }
  }
  context.fill();
  context.restore();

  context.save();
  context.strokeStyle = "rgba(255, 211, 92, 0.9)";
  context.lineWidth = 1.5;
  roundedRect(context, CHUTE_LEFT, top, width, height, 3);
  context.stroke();
  context.restore();
}

/* ── 회전 장애물: 매 프레임 그린다 ─────────────────────────────── */

function drawSpinners(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  elapsedSeconds: number,
  view: RouletteView,
): void {
  course.spinners.forEach((spinner, index) => {
    // drawSpinner 의 그림자 헤일로(반폭 +3)와 오프셋까지 포함한 범위.
    const reach = spinner.halfLength + SPINNER_HALF_THICKNESS + 3 + SHADOW_DY;
    if (!isWithinView(spinner.y, reach, view)) return;

    drawSpinner(
      context,
      spinner,
      SPINNER_PALETTES[index % SPINNER_PALETTES.length],
      elapsedSeconds,
    );
  });
}

/* ── 왕복 막대: 매 프레임 그린다 ─────────────────────────────── */

function drawMovers(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  elapsedSeconds: number,
  view: RouletteView,
): void {
  for (const mover of course.movers) {
    const centerY = (mover.ay + mover.by) / 2;
    const reach =
      Math.abs(mover.dy) +
      Math.abs(mover.ay - mover.by) / 2 +
      SPINNER_HALF_THICKNESS +
      SHADOW_DY;
    if (!isWithinView(centerY, reach, view)) continue;

    drawMover(context, mover, getRouletteMoverState(mover, elapsedSeconds));
  }
}

function drawMover(
  context: CanvasRenderingContext2D,
  mover: RouletteMover,
  state: RouletteMoverState,
): void {
  const { segment } = state;
  const midX = (mover.ax + mover.bx) / 2;
  const midY = (mover.ay + mover.by) / 2;

  context.save();
  context.lineCap = "round";

  // 이동 궤적을 점선으로 깔아 어디까지 오가는지 미리 보여 준다.
  context.setLineDash([3, 7]);
  context.strokeStyle = "rgba(194, 246, 255, 0.28)";
  context.lineWidth = 2;
  strokeLine(
    context,
    midX - mover.dx,
    midY - mover.dy,
    midX + mover.dx,
    midY + mover.dy,
  );
  context.setLineDash([]);
  context.fillStyle = "rgba(194, 246, 255, 0.35)";
  fillCircle(context, midX - mover.dx, midY - mover.dy, 3);
  fillCircle(context, midX + mover.dx, midY + mover.dy, 3);

  context.save();
  context.translate(SHADOW_DX, SHADOW_DY);
  context.strokeStyle = "rgba(2, 4, 12, 0.3)";
  context.lineWidth = SPINNER_HALF_THICKNESS * 2;
  strokeLine(context, segment.ax, segment.ay, segment.bx, segment.by);
  context.restore();

  drawSpinnerArm(context, segment, MOVER_PALETTE);

  // 양 끝 캡으로 회전 막대와 구분한다.
  for (const point of [
    { x: segment.ax, y: segment.ay },
    { x: segment.bx, y: segment.by },
  ]) {
    context.fillStyle = MOVER_PALETTE.edge;
    fillCircle(context, point.x, point.y, SPINNER_HALF_THICKNESS + 1);
    context.fillStyle = MOVER_PALETTE.light;
    fillCircle(context, point.x, point.y, SPINNER_HALF_THICKNESS - 2.5);
  }
  context.restore();
}

/* ── 미니맵: 카메라 코스에서 전체 코스와 현재 창을 보여 준다 ───── */

function drawMinimap(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  race: RouletteRace | null,
  view: RouletteView,
): void {
  const width = MINIMAP_WIDTH;
  const height = view.height - MINIMAP_MARGIN * 2;
  const x0 = MINIMAP_LEFT;
  const y0 = MINIMAP_MARGIN;
  const scaleX = width / ROULETTE_BOARD_WIDTH;
  const scaleY = height / course.height;
  const toX = (x: number) => x0 + x * scaleX;
  const toY = (y: number) => y0 + y * scaleY;

  context.save();
  context.fillStyle = "rgba(4, 6, 16, 0.74)";
  roundedRect(context, x0, y0, width, height, 4);
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.lineWidth = 1;
  roundedRect(context, x0, y0, width, height, 4);
  context.stroke();

  context.strokeStyle = "rgba(190, 200, 255, 0.55)";
  context.lineWidth = 1;
  context.lineCap = "round";
  context.beginPath();
  for (const segment of course.segments) {
    context.moveTo(toX(segment.ax), toY(segment.ay));
    context.lineTo(toX(segment.bx), toY(segment.by));
  }
  context.stroke();

  context.fillStyle = "rgba(190, 200, 255, 0.55)";
  for (const spinner of course.spinners) {
    fillCircle(context, toX(spinner.x), toY(spinner.y), 1.6);
  }
  context.fillStyle = `rgba(${MOVER_PALETTE.rgb}, 0.8)`;
  for (const mover of course.movers) {
    fillCircle(
      context,
      toX((mover.ax + mover.bx) / 2),
      toY((mover.ay + mover.by) / 2),
      1.6,
    );
  }

  context.strokeStyle = "rgba(255, 211, 92, 0.9)";
  context.lineWidth = 1.5;
  strokeLine(
    context,
    toX(CHUTE_LEFT),
    toY(course.finishY),
    toX(CHUTE_RIGHT),
    toY(course.finishY),
  );

  if (race) {
    const winnerIds = new Set(race.winnerParticipantIds);
    for (const ball of race.balls) {
      const winner = winnerIds.has(ball.id);
      // 완주한 마블은 결승선에 겹쳐 쌓이므로 당첨 마블만 남긴다.
      if (ball.finished && !winner) continue;
      context.fillStyle = winner ? "#ffd35c" : "#f4f6ff";
      fillCircle(context, toX(ball.x), toY(ball.y), winner ? 2.2 : 1.6);
    }
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.8)";
  context.lineWidth = 1.2;
  roundedRect(
    context,
    x0 + 1,
    toY(view.top),
    width - 2,
    view.height * scaleY,
    2,
  );
  context.stroke();
  context.restore();
}

function drawSpinner(
  context: CanvasRenderingContext2D,
  spinner: RouletteSpinner,
  palette: SpinnerPalette,
  elapsedSeconds: number,
): void {
  const angle =
    spinner.initialAngle + spinner.angularVelocity * elapsedSeconds;
  const arms = getRouletteSpinnerSegments(spinner, elapsedSeconds);

  context.save();
  context.lineCap = "round";

  // 그림자: blur 대신 두 겹 오프셋으로 부드럽게 해서 프레임 비용을 아낀다.
  context.save();
  context.translate(SHADOW_DX, SHADOW_DY);
  context.beginPath();
  for (const arm of arms) {
    context.moveTo(arm.ax, arm.ay);
    context.lineTo(arm.bx, arm.by);
  }
  context.strokeStyle = "rgba(2, 4, 12, 0.18)";
  context.lineWidth = SPINNER_HALF_THICKNESS * 2 + 6;
  context.stroke();
  context.strokeStyle = "rgba(2, 4, 12, 0.3)";
  context.lineWidth = SPINNER_HALF_THICKNESS * 2;
  context.stroke();
  context.fillStyle = "rgba(2, 4, 12, 0.3)";
  fillCircle(context, spinner.x, spinner.y, SPINNER_HUB_RADIUS);
  context.restore();

  drawSpinnerSweep(context, spinner, palette, angle);
  for (const arm of arms) drawSpinnerArm(context, arm, palette);
  drawSpinnerHub(context, spinner, palette, angle);
  context.restore();
}

/** 지나온 각도를 부채꼴로 옅게 칠해 회전 방향과 속도를 보여 준다. */
function drawSpinnerSweep(
  context: CanvasRenderingContext2D,
  spinner: RouletteSpinner,
  palette: SpinnerPalette,
  angle: number,
): void {
  const speed = Math.abs(spinner.angularVelocity);
  if (speed < 0.01 || typeof context.createConicGradient !== "function") {
    return;
  }

  const sweep = Math.min(0.6, speed * 0.2);
  const span = sweep / (Math.PI * 2);
  const clockwise = spinner.angularVelocity > 0;
  const endCount = spinner.arms * 2;
  const outerRadius = spinner.halfLength + SPINNER_HALF_THICKNESS;
  const innerRadius = SPINNER_HUB_RADIUS + 4;

  for (let end = 0; end < endCount; end += 1) {
    const endAngle = angle + (end * Math.PI * 2) / endCount;
    const from = clockwise ? endAngle - sweep : endAngle;
    const to = clockwise ? endAngle : endAngle + sweep;

    const trail = context.createConicGradient(from, spinner.x, spinner.y);
    trail.addColorStop(0, `rgba(${palette.rgb}, ${clockwise ? 0 : 0.32})`);
    trail.addColorStop(span, `rgba(${palette.rgb}, ${clockwise ? 0.32 : 0})`);
    trail.addColorStop(1, `rgba(${palette.rgb}, 0)`);

    context.fillStyle = trail;
    context.beginPath();
    context.arc(spinner.x, spinner.y, outerRadius, from, to);
    context.arc(spinner.x, spinner.y, innerRadius, to, from, true);
    context.closePath();
    context.fill();
  }
}

function drawSpinnerArm(
  context: CanvasRenderingContext2D,
  arm: RouletteSegment,
  palette: SpinnerPalette,
): void {
  const normal = getLitNormal(arm);
  if (!normal) return;

  context.strokeStyle = palette.edge;
  context.lineWidth = SPINNER_HALF_THICKNESS * 2;
  strokeLine(context, arm.ax, arm.ay, arm.bx, arm.by);

  const inner = SPINNER_HALF_THICKNESS - 1.4;
  const midX = (arm.ax + arm.bx) / 2;
  const midY = (arm.ay + arm.by) / 2;
  const body = context.createLinearGradient(
    midX + normal.x * inner,
    midY + normal.y * inner,
    midX - normal.x * inner,
    midY - normal.y * inner,
  );
  body.addColorStop(0, palette.light);
  body.addColorStop(0.42, palette.base);
  body.addColorStop(1, palette.dark);
  context.strokeStyle = body;
  context.lineWidth = inner * 2;
  strokeLine(context, arm.ax, arm.ay, arm.bx, arm.by);

  const offset = inner * 0.5;
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.lineWidth = 1.6;
  strokeLine(
    context,
    arm.ax + normal.x * offset,
    arm.ay + normal.y * offset,
    arm.bx + normal.x * offset,
    arm.by + normal.y * offset,
  );
}

function drawSpinnerHub(
  context: CanvasRenderingContext2D,
  spinner: RouletteSpinner,
  palette: SpinnerPalette,
  angle: number,
): void {
  const { x, y } = spinner;

  context.fillStyle = palette.edge;
  fillCircle(context, x, y, SPINNER_HUB_RADIUS);

  const ring = context.createLinearGradient(
    x,
    y - SPINNER_HUB_RADIUS,
    x,
    y + SPINNER_HUB_RADIUS,
  );
  ring.addColorStop(0, palette.light);
  ring.addColorStop(1, palette.dark);
  context.fillStyle = ring;
  fillCircle(context, x, y, SPINNER_HUB_RADIUS - 1.4);

  const capRadius = SPINNER_HUB_RADIUS - 4.2;
  const cap = context.createRadialGradient(
    x - capRadius * 0.35,
    y - capRadius * 0.4,
    0.5,
    x,
    y,
    capRadius,
  );
  cap.addColorStop(0, "#ffffff");
  cap.addColorStop(0.45, "#d3d8f4");
  cap.addColorStop(1, "#6a73a3");
  context.fillStyle = cap;
  fillCircle(context, x, y, capRadius);

  // 일자 볼트 홈이 막대와 함께 돌아 회전이 허브에서도 읽힌다.
  const slotX = Math.cos(angle) * (capRadius - 1.6);
  const slotY = Math.sin(angle) * (capRadius - 1.6);
  context.strokeStyle = "rgba(18, 22, 44, 0.78)";
  context.lineWidth = 1.6;
  strokeLine(context, x - slotX, y - slotY, x + slotX, y + slotY);
}

/* ── 마블 ─────────────────────────────────────────────────────── */

function drawPreviewBalls(
  context: CanvasRenderingContext2D,
  participants: readonly RouletteParticipant[],
  course: RouletteCourse,
  avatarImages: ReadonlyMap<string, CanvasImageSource>,
): void {
  const visible = participants.slice(0, 10);
  const spacing = Math.min(58, 570 / Math.max(visible.length - 1, 1));
  const startX = (ROULETTE_BOARD_WIDTH - spacing * (visible.length - 1)) / 2;

  visible.forEach((participant, index) => {
    drawBall(
      context,
      {
        ...participant,
        ballId: index,
        color: `hsl(${(index * 137.508) % 360} 68% 43%)`,
        x: startX + index * spacing,
        y: course.startY + 22,
        vx: 0,
        vy: 0,
        radius: 15,
        finished: false,
      },
      avatarImages.get(participant.id),
      false,
    );
  });

  if (participants.length > visible.length) {
    context.fillStyle = "#cbd3ff";
    context.font = "700 12px system-ui, -apple-system, sans-serif";
    context.textAlign = "right";
    context.fillText(
      `+${participants.length - visible.length}`,
      ROULETTE_BOARD_WIDTH - 42,
      course.startY + 30,
    );
  }
}

function drawBall(
  context: CanvasRenderingContext2D,
  ball: RouletteBall,
  avatarImage: CanvasImageSource | undefined,
  winner: boolean,
): void {
  context.save();
  if (winner) {
    context.shadowColor = "rgba(255, 210, 86, 0.9)";
    context.shadowBlur = 22;
  } else {
    // 장애물과 같은 방향의 그림자. 마블이 많아도 프레임이 버티도록 blur 를 쓰지 않는다.
    context.fillStyle = "rgba(2, 4, 12, 0.34)";
    fillCircle(
      context,
      ball.x + SHADOW_DX * 0.6,
      ball.y + SHADOW_DY * 0.6,
      ball.radius + 3,
    );
  }
  context.fillStyle = winner ? "#ffd35c" : "#f1f3ff";
  fillCircle(context, ball.x, ball.y, ball.radius + (winner ? 4 : 3));
  context.restore();

  context.save();
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.clip();

  if (avatarImage) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      avatarImage,
      ball.x - ball.radius,
      ball.y - ball.radius,
      ball.radius * 2,
      ball.radius * 2,
    );
  } else {
    const fallback = context.createLinearGradient(
      ball.x - ball.radius,
      ball.y - ball.radius,
      ball.x + ball.radius,
      ball.y + ball.radius,
    );
    fallback.addColorStop(0, "#8ea0ff");
    fallback.addColorStop(1, ball.color);
    context.fillStyle = fallback;
    context.fillRect(
      ball.x - ball.radius,
      ball.y - ball.radius,
      ball.radius * 2,
      ball.radius * 2,
    );
    context.fillStyle = "#ffffff";
    context.font = `800 ${Math.max(9, ball.radius - 2)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(getInitial(ball.name), ball.x, ball.y + 1);
  }
  context.restore();

  context.save();
  context.strokeStyle = winner ? "#fff1b8" : "rgba(255, 255, 255, 0.82)";
  context.lineWidth = winner ? 3 : 2;
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius + 1, 0, Math.PI * 2);
  context.stroke();

  const label = fitCanvasLabel(context, ball.name, 102);
  context.font = "700 10px system-ui, -apple-system, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelWidth = Math.min(
    114,
    Math.max(34, context.measureText(label).width + 16),
  );
  const labelY = ball.y - ball.radius - 15;
  context.fillStyle = winner ? "rgba(104, 78, 0, 0.92)" : "rgba(7, 10, 20, 0.86)";
  roundedRect(context, ball.x - labelWidth / 2, labelY - 9, labelWidth, 18, 9);
  context.fill();
  context.fillStyle = winner ? "#fff4c8" : "#f4f6ff";
  context.fillText(label, ball.x, labelY + 0.5);
  context.restore();
}

/* ── 공용 도우미 ─────────────────────────────────────────────── */

/** 선분의 법선 중 조명 쪽을 향하는 단위 벡터. 길이가 0 이면 null. */
function getLitNormal(segment: RouletteSegment): Vector | null {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  const x = -dy / length;
  const y = dx / length;
  return x * LIGHT_X + y * LIGHT_Y >= 0 ? { x, y } : { x: -x, y: -y };
}

/** canvas 그림자 값은 변환 행렬의 영향을 받지 않으므로 픽셀 배율을 곱해 크기와 무관하게 맞춘다. */
function applyDropShadow(
  context: CanvasRenderingContext2D,
  pixelScale: number,
  alpha: number,
  blur: number,
): void {
  context.shadowColor = `rgba(2, 4, 12, ${alpha})`;
  context.shadowBlur = blur * pixelScale;
  context.shadowOffsetX = SHADOW_DX * pixelScale;
  context.shadowOffsetY = SHADOW_DY * pixelScale;
}

function strokeLine(
  context: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  context.beginPath();
  context.moveTo(ax, ay);
  context.lineTo(bx, by);
  context.stroke();
}

function fillCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function getInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function fitCanvasLabel(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  context.font = "700 10px system-ui, -apple-system, sans-serif";
  if (context.measureText(value).width <= maxWidth) return value;

  const characters = Array.from(value);
  while (characters.length > 1) {
    characters.pop();
    const candidate = `${characters.join("")}…`;
    if (context.measureText(candidate).width <= maxWidth) return candidate;
  }
  return "…";
}
