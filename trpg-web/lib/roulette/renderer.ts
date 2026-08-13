import {
  getRouletteFinishY,
  ROULETTE_BOARD_HEIGHT,
  ROULETTE_BOARD_WIDTH,
  ROULETTE_PEGS,
  ROULETTE_SEGMENTS,
  type RouletteBall,
  type RouletteRace,
} from "./engine";

interface DrawRouletteSceneOptions {
  race: RouletteRace | null;
  previewParticipants: readonly string[];
}

export function drawRouletteScene(
  context: CanvasRenderingContext2D,
  { race, previewParticipants }: DrawRouletteSceneOptions,
): void {
  context.clearRect(0, 0, ROULETTE_BOARD_WIDTH, ROULETTE_BOARD_HEIGHT);
  drawBackground(context);
  drawTrack(context);

  if (race) {
    const orderedBalls = [...race.balls].sort((first, second) =>
      first.finished === second.finished
        ? first.y - second.y
        : Number(first.finished) - Number(second.finished),
    );
    for (const ball of orderedBalls) {
      drawBall(context, ball, race.winnerBallId === ball.id);
    }
  } else {
    drawPreviewBalls(context, previewParticipants);
  }
}

function drawBackground(context: CanvasRenderingContext2D): void {
  const gradient = context.createLinearGradient(
    0,
    0,
    0,
    ROULETTE_BOARD_HEIGHT,
  );
  gradient.addColorStop(0, "#16192c");
  gradient.addColorStop(0.52, "#101426");
  gradient.addColorStop(1, "#090c17");
  context.fillStyle = gradient;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, ROULETTE_BOARD_HEIGHT);

  const glow = context.createRadialGradient(360, 90, 20, 360, 90, 430);
  glow.addColorStop(0, "rgba(113, 129, 255, 0.22)");
  glow.addColorStop(0.55, "rgba(88, 101, 242, 0.07)");
  glow.addColorStop(1, "rgba(88, 101, 242, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, 520);

  context.save();
  context.globalAlpha = 0.16;
  context.strokeStyle = "#8ea0ff";
  context.lineWidth = 1;
  for (let x = 40; x < ROULETTE_BOARD_WIDTH; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, ROULETTE_BOARD_HEIGHT);
    context.stroke();
  }
  for (let y = 40; y < ROULETTE_BOARD_HEIGHT; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(ROULETTE_BOARD_WIDTH, y);
    context.stroke();
  }
  context.restore();

  context.fillStyle = "rgba(231, 235, 255, 0.72)";
  context.font = "700 13px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("START", ROULETTE_BOARD_WIDTH / 2, 27);

  context.fillStyle = "rgba(142, 160, 255, 0.12)";
  context.fillRect(54, 39, ROULETTE_BOARD_WIDTH - 108, 67);
  context.strokeStyle = "rgba(142, 160, 255, 0.34)";
  context.strokeRect(54.5, 39.5, ROULETTE_BOARD_WIDTH - 109, 66);
}

function drawTrack(context: CanvasRenderingContext2D): void {
  context.save();
  context.strokeStyle = "rgba(167, 177, 255, 0.75)";
  context.lineWidth = 5;
  context.lineCap = "round";
  context.shadowColor = "rgba(88, 101, 242, 0.75)";
  context.shadowBlur = 12;

  for (const segment of ROULETTE_SEGMENTS) {
    context.beginPath();
    context.moveTo(segment.ax, segment.ay);
    context.lineTo(segment.bx, segment.by);
    context.stroke();
  }
  context.restore();

  for (const peg of ROULETTE_PEGS) {
    const pegGradient = context.createRadialGradient(
      peg.x - 2,
      peg.y - 2,
      1,
      peg.x,
      peg.y,
      peg.radius + 2,
    );
    pegGradient.addColorStop(0, "#ffffff");
    pegGradient.addColorStop(0.25, "#c7d0ff");
    pegGradient.addColorStop(1, "#5865f2");
    context.fillStyle = pegGradient;
    context.beginPath();
    context.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
    context.fill();
  }

  const finishY = getRouletteFinishY();
  const cellSize = 12;
  const startX = 122;
  const finishWidth = 476;
  for (let column = 0; column < Math.ceil(finishWidth / cellSize); column += 1) {
    context.fillStyle = column % 2 === 0 ? "#f5f6ff" : "#1b2038";
    context.fillRect(startX + column * cellSize, finishY - 4, cellSize, 8);
  }
  context.fillStyle = "rgba(231, 235, 255, 0.74)";
  context.font = "800 12px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("FINISH", ROULETTE_BOARD_WIDTH / 2, finishY + 23);
}

function drawPreviewBalls(
  context: CanvasRenderingContext2D,
  participants: readonly string[],
): void {
  const visible = participants.slice(0, 12);
  const spacing = Math.min(46, 560 / Math.max(visible.length - 1, 1));
  const startX = (ROULETTE_BOARD_WIDTH - spacing * (visible.length - 1)) / 2;

  visible.forEach((name, index) => {
    drawBall(
      context,
      {
        id: index,
        name,
        color: `hsl(${(index * 137.508) % 360} 82% 64%)`,
        x: startX + index * spacing,
        y: 73,
        vx: 0,
        vy: 0,
        radius: 11,
        finished: false,
      },
      false,
    );
  });

  if (participants.length > visible.length) {
    context.fillStyle = "rgba(231, 235, 255, 0.72)";
    context.font = "700 12px system-ui, sans-serif";
    context.textAlign = "right";
    context.fillText(
      `+${participants.length - visible.length}`,
      ROULETTE_BOARD_WIDTH - 64,
      99,
    );
  }
}

function drawBall(
  context: CanvasRenderingContext2D,
  ball: RouletteBall,
  winner: boolean,
): void {
  context.save();
  context.shadowColor = winner ? "rgba(255, 211, 92, 0.95)" : ball.color;
  context.shadowBlur = winner ? 24 : 9;

  const gradient = context.createRadialGradient(
    ball.x - ball.radius * 0.38,
    ball.y - ball.radius * 0.4,
    1,
    ball.x,
    ball.y,
    ball.radius * 1.15,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.18, ball.color);
  gradient.addColorStop(1, "#171a2d");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.fill();

  context.shadowBlur = 0;
  context.strokeStyle = winner ? "#ffd35c" : "rgba(255, 255, 255, 0.68)";
  context.lineWidth = winner ? 3 : 1.5;
  context.stroke();

  const label = fitCanvasLabel(context, ball.name, 92);
  context.font = "800 11px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelWidth = Math.min(104, Math.max(32, context.measureText(label).width + 13));
  const labelY = ball.y - ball.radius - 13;
  context.fillStyle = "rgba(5, 8, 16, 0.78)";
  roundedRect(
    context,
    ball.x - labelWidth / 2,
    labelY - 9,
    labelWidth,
    18,
    5,
  );
  context.fill();
  context.fillStyle = winner ? "#ffe7a3" : "#f4f6ff";
  context.fillText(label, ball.x, labelY + 0.5);
  context.restore();
}

function fitCanvasLabel(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  context.font = "800 11px system-ui, sans-serif";
  if (context.measureText(value).width <= maxWidth) return value;

  const characters = Array.from(value);
  while (characters.length > 1) {
    characters.pop();
    const candidate = `${characters.join("")}…`;
    if (context.measureText(candidate).width <= maxWidth) return candidate;
  }
  return "…";
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    safeRadius,
  );
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}
