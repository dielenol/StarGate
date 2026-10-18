/**
 * 로그인 배경의 전경 레이어: 천천히 구르는 와이어프레임 삼각 프리즘과 빛을 받아 반짝이는 먼지.
 * 상태를 누적하지 않고 시간의 함수로만 그려서 일시정지·재개·리사이즈 뒤에도 끊김이 없다.
 */

const DUST_SEED = 0x5a7c1e;
const DUST_AREA_PER_MOTE = 12000;
const DUST_MIN_COUNT = 40;
const DUST_MAX_COUNT = 140;
const BOKEH_RATIO = 0.12;

const PRISM_HALF_DEPTH = 0.62;
const CAMERA_DISTANCE = 3.6;
const PRISM_MAX_RADIUS = Math.hypot(1, PRISM_HALF_DEPTH);
const LIGHT_DIRECTION = normalize({ x: -0.55, y: 0.7, z: 0.45 });

const SPECTRUM: readonly Rgb[] = [
  [232, 3, 3],
  [243, 144, 14],
  [226, 248, 68],
  [102, 255, 46],
  [21, 28, 233],
  [134, 15, 240],
  [235, 0, 246],
];

const TRIANGLE = [0, 1, 2].map((index) => {
  const angle = Math.PI / 2 + (index * 2 * Math.PI) / 3;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

const PRISM_VERTICES: readonly Vec3[] = [
  ...TRIANGLE.map((vertex) => ({ ...vertex, z: PRISM_HALF_DEPTH })),
  ...TRIANGLE.map((vertex) => ({ ...vertex, z: -PRISM_HALF_DEPTH })),
];

export const PRISM_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [3, 4],
  [4, 5],
  [5, 3],
  [0, 3],
  [1, 4],
  [2, 5],
];

/** 바깥쪽을 향하는 반시계 방향으로 정의된 면. 앞의 두 개가 삼각형 밑면이다. */
export const PRISM_FACES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 5, 4],
  [0, 3, 4, 1],
  [1, 4, 5, 2],
  [2, 5, 3, 0],
];

const FACE_SPECTRUM_POSITION = [0.68, 0.82, 0.04, 0.36, 0.5];

const PRISM_LAYOUT: readonly PrismSpec[] = [
  {
    anchorX: 0.18,
    anchorY: 0.84,
    scale: 0.06,
    opacity: 0.55,
    tiltX: 0.5,
    tiltZ: -0.3,
    spinY: 0.21,
    driftX: 9,
    driftY: 7,
    driftPeriod: 19,
    phase: 4.1,
  },
  {
    anchorX: 0.8,
    anchorY: 0.16,
    scale: 0.07,
    opacity: 0.6,
    tiltX: -0.35,
    tiltZ: 0.4,
    spinY: -0.17,
    driftX: 11,
    driftY: 8,
    driftPeriod: 23,
    phase: 1.7,
  },
  {
    anchorX: 0.86,
    anchorY: 0.76,
    scale: 0.16,
    opacity: 0.85,
    tiltX: 0.42,
    tiltZ: 0.35,
    spinY: 0.12,
    driftX: 16,
    driftY: 12,
    driftPeriod: 21,
    phase: 2.6,
  },
  {
    anchorX: 0.13,
    anchorY: 0.24,
    scale: 0.19,
    opacity: 0.9,
    tiltX: -0.3,
    tiltZ: -0.42,
    spinY: -0.14,
    driftX: 18,
    driftY: 13,
    driftPeriod: 17,
    phase: 0,
  },
];

type Rgb = readonly [number, number, number];

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PrismSpec {
  /** 뷰포트 너비·높이 대비 기준 위치 (0~1) */
  anchorX: number;
  anchorY: number;
  /** min(width, height * 1.25) 대비 외접원 반지름 비율 */
  scale: number;
  opacity: number;
  tiltX: number;
  tiltZ: number;
  /** 세로축 회전 속도 (rad/s) */
  spinY: number;
  /** 부유 진폭(px)과 주기(s) */
  driftX: number;
  driftY: number;
  driftPeriod: number;
  phase: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  /** 0 이 카메라에 가장 가깝고 1 이 가장 멀다 */
  depth: number;
}

export interface ProjectedFace {
  vertices: readonly number[];
  /** 카메라를 향한 정도 (0 이면 뒷면·모서리 방향) */
  facing: number;
  /** 좌상단 광원을 향한 정도 */
  lit: number;
  color: Rgb;
}

export interface ProjectedPrism {
  points: readonly ProjectedPoint[];
  faces: readonly ProjectedFace[];
  opacity: number;
}

export interface DustMote {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  sway: number;
  twinkle: number;
  phase: number;
  alpha: number;
  bokeh: boolean;
}

export interface BackdropScene {
  width: number;
  height: number;
  prisms: readonly PrismSpec[];
  dust: readonly DustMote[];
}

export interface BackdropPalette {
  ink: Rgb;
  dust: Rgb;
  edgeAlpha: number;
  faceAlpha: number;
  dustAlpha: number;
}

export const DARK_PALETTE: BackdropPalette = {
  ink: [179, 201, 250],
  dust: [214, 228, 255],
  edgeAlpha: 0.58,
  faceAlpha: 0.05,
  dustAlpha: 1,
};

export const LIGHT_PALETTE: BackdropPalette = {
  ink: [83, 111, 168],
  dust: [64, 89, 137],
  edgeAlpha: 0.42,
  faceAlpha: 0.055,
  dustAlpha: 0.75,
};

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function toCss([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

/** 로고의 7색 스펙트럼을 0~1 구간에서 보간한다. */
export function spectrumColor(position: number): Rgb {
  const scaled = Math.min(Math.max(position, 0), 1) * (SPECTRUM.length - 1);
  const index = Math.min(Math.floor(scaled), SPECTRUM.length - 2);
  const mix = scaled - index;
  const from = SPECTRUM[index];
  const to = SPECTRUM[index + 1];
  return [
    Math.round(from[0] + (to[0] - from[0]) * mix),
    Math.round(from[1] + (to[1] - from[1]) * mix),
    Math.round(from[2] + (to[2] - from[2]) * mix),
  ];
}

function rotate(vertex: Vec3, angleX: number, angleY: number, angleZ: number): Vec3 {
  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const x1 = vertex.x * cosY + vertex.z * sinY;
  const z1 = -vertex.x * sinY + vertex.z * cosY;

  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const y2 = vertex.y * cosX - z1 * sinX;
  const z2 = vertex.y * sinX + z1 * cosX;

  const cosZ = Math.cos(angleZ);
  const sinZ = Math.sin(angleZ);
  return {
    x: x1 * cosZ - y2 * sinZ,
    y: x1 * sinZ + y2 * cosZ,
    z: z2,
  };
}

function createDust(width: number, height: number): DustMote[] {
  const random = createRandom(DUST_SEED);
  const count = Math.min(
    DUST_MAX_COUNT,
    Math.max(DUST_MIN_COUNT, Math.round((width * height) / DUST_AREA_PER_MOTE)),
  );

  return Array.from({ length: count }, () => {
    const bokeh = random() < BOKEH_RATIO;
    return {
      x: random() * width,
      y: random() * height,
      radius: bokeh ? 2.5 + random() * 3 : 0.6 + random() * 1,
      vx: 5 + random() * 9,
      vy: 1.5 + random() * 4.5,
      sway: 2 + random() * 4,
      twinkle: 0.6 + random() * 1.4,
      phase: random() * Math.PI * 2,
      alpha: bokeh ? 0.08 + random() * 0.08 : 0.18 + random() * 0.4,
      bokeh,
    };
  });
}

export function createBackdropScene(width: number, height: number): BackdropScene {
  return {
    width,
    height,
    prisms: PRISM_LAYOUT,
    dust: createDust(width, height),
  };
}

/** 프리즘 하나를 시각 `time` 의 자세로 화면 좌표에 투영한다. */
export function projectPrism(
  spec: PrismSpec,
  time: number,
  width: number,
  height: number,
): ProjectedPrism {
  const radius = Math.min(width, height * 1.25) * spec.scale;
  const driftAngle = (time / spec.driftPeriod) * Math.PI * 2 + spec.phase;
  const centerX = spec.anchorX * width + Math.sin(driftAngle) * spec.driftX;
  const centerY = spec.anchorY * height + Math.cos(driftAngle * 0.8) * spec.driftY;
  const angleX = spec.tiltX + 0.18 * Math.sin(time * 0.21 + spec.phase);
  const angleY = spec.spinY * time + spec.phase;

  const rotated = PRISM_VERTICES.map((vertex) =>
    rotate(vertex, angleX, angleY, spec.tiltZ),
  );

  const points = rotated.map((vertex) => {
    const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - vertex.z);
    return {
      x: centerX + vertex.x * perspective * radius,
      y: centerY - vertex.y * perspective * radius,
      depth: Math.min(Math.max((1 - vertex.z / PRISM_MAX_RADIUS) / 2, 0), 1),
    };
  });

  const faces = PRISM_FACES.map((vertices, faceIndex) => {
    const a = rotated[vertices[0]];
    const b = rotated[vertices[1]];
    const c = rotated[vertices[2]];
    const normal = normalize({
      x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
      y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
      z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    });
    const lit =
      normal.x * LIGHT_DIRECTION.x +
      normal.y * LIGHT_DIRECTION.y +
      normal.z * LIGHT_DIRECTION.z;
    return {
      vertices,
      facing: Math.max(normal.z, 0),
      lit: Math.max(lit, 0),
      color: spectrumColor(FACE_SPECTRUM_POSITION[faceIndex]),
    };
  });

  return { points, faces, opacity: spec.opacity };
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  points: readonly ProjectedPoint[],
  vertices: readonly number[],
): void {
  context.beginPath();
  vertices.forEach((vertexIndex, order) => {
    const point = points[vertexIndex];
    if (order === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
}

function drawPrism(
  context: CanvasRenderingContext2D,
  prism: ProjectedPrism,
  palette: BackdropPalette,
): void {
  const { points, faces, opacity } = prism;

  for (const face of faces) {
    if (face.facing <= 0.02) continue;
    tracePolygon(context, points, face.vertices);
    context.fillStyle = toCss(face.color, palette.faceAlpha * face.facing * opacity);
    context.fill();
    if (face.lit > 0) {
      context.fillStyle = toCss(palette.ink, 0.05 * face.lit * face.facing * opacity);
      context.fill();
    }
  }

  const edges = PRISM_EDGES.map(([from, to]) => ({
    from: points[from],
    to: points[to],
    depth: (points[from].depth + points[to].depth) / 2,
  })).sort((first, second) => second.depth - first.depth);

  context.lineWidth = 1;
  context.lineJoin = "round";
  for (const edge of edges) {
    context.strokeStyle = toCss(
      palette.ink,
      palette.edgeAlpha * (1 - edge.depth * 0.65) * opacity,
    );
    context.beginPath();
    context.moveTo(edge.from.x, edge.from.y);
    context.lineTo(edge.to.x, edge.to.y);
    context.stroke();
  }

  for (const point of points) {
    context.fillStyle = toCss(
      palette.ink,
      Math.min(palette.edgeAlpha + 0.25, 1) * (1 - point.depth * 0.7) * opacity,
    );
    context.beginPath();
    context.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
    context.fill();
  }
}

function drawDust(
  context: CanvasRenderingContext2D,
  scene: BackdropScene,
  time: number,
  palette: BackdropPalette,
): void {
  const { width, height } = scene;
  const margin = 12;

  for (const mote of scene.dust) {
    const spanX = width + margin * 2;
    const spanY = height + margin * 2;
    const x = ((((mote.x + mote.vx * time) % spanX) + spanX) % spanX) - margin;
    const y =
      ((((mote.y + mote.vy * time + Math.sin(time * 0.5 + mote.phase) * mote.sway) %
        spanY) +
        spanY) %
        spanY) -
      margin;
    const twinkle = 0.55 + 0.45 * Math.sin(time * mote.twinkle + mote.phase);
    const alpha = mote.alpha * twinkle * palette.dustAlpha;

    if (mote.bokeh) {
      const gradient = context.createRadialGradient(x, y, 0, x, y, mote.radius);
      gradient.addColorStop(0, toCss(palette.dust, alpha));
      gradient.addColorStop(1, toCss(palette.dust, 0));
      context.fillStyle = gradient;
    } else {
      context.fillStyle = toCss(palette.dust, alpha);
    }
    context.beginPath();
    context.arc(x, y, mote.radius, 0, Math.PI * 2);
    context.fill();
  }
}

/** 캔버스는 CSS 픽셀 기준으로 변환이 설정돼 있어야 한다. */
export function drawBackdropScene(
  context: CanvasRenderingContext2D,
  scene: BackdropScene,
  time: number,
  palette: BackdropPalette,
): void {
  context.clearRect(0, 0, scene.width, scene.height);
  drawDust(context, scene, time, palette);
  for (const spec of scene.prisms) {
    drawPrism(context, projectPrism(spec, time, scene.width, scene.height), palette);
  }
}
