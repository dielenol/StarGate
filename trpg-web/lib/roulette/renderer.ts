import {
  getRouletteSpinnerSegments,
  ROULETTE_BOARD_WIDTH,
  type RouletteBall,
  type RouletteCourse,
  type RouletteParticipant,
  type RouletteRace,
  type RouletteSegment,
  type RouletteSpinner,
} from "./engine";

interface DrawRouletteSceneOptions {
  race: RouletteRace | null;
  previewParticipants: readonly RouletteParticipant[];
  previewElapsedSeconds?: number;
  course: RouletteCourse;
  avatarImages: ReadonlyMap<string, CanvasImageSource>;
}

export function drawRouletteScene(
  context: CanvasRenderingContext2D,
  {
    race,
    previewParticipants,
    previewElapsedSeconds = 0,
    course,
    avatarImages,
  }: DrawRouletteSceneOptions,
): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);
  drawBackground(context, course);
  drawTrack(context, course, race?.elapsedSeconds ?? previewElapsedSeconds);

  if (race) {
    const winnerIds = new Set(race.winnerParticipantIds);
    const orderedBalls = [...race.balls].sort((first, second) =>
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
}

function drawBackground(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  const gradient = context.createLinearGradient(0, 0, 0, course.height);
  gradient.addColorStop(0, "#171b31");
  gradient.addColorStop(0.52, "#101426");
  gradient.addColorStop(1, "#090c17");
  context.fillStyle = gradient;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);

  const glow = context.createRadialGradient(
    ROULETTE_BOARD_WIDTH / 2,
    180,
    20,
    ROULETTE_BOARD_WIDTH / 2,
    180,
    500,
  );
  glow.addColorStop(0, "rgba(88, 101, 242, 0.2)");
  glow.addColorStop(0.48, "rgba(88, 101, 242, 0.06)");
  glow.addColorStop(1, "rgba(88, 101, 242, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, Math.min(course.height, 760));

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.34)";
  context.shadowBlur = 18;
  context.fillStyle = "rgba(25, 30, 54, 0.92)";
  roundedRect(context, 22, 20, ROULETTE_BOARD_WIDTH - 44, 62, 16);
  context.fill();
  context.restore();

  context.fillStyle = "#aeb9ff";
  context.font = "700 13px system-ui, -apple-system, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(`COURSE ${course.number} · ${course.distance}`, 42, 51);
  context.fillStyle = "#f4f6ff";
  context.font = "800 15px system-ui, -apple-system, sans-serif";
  context.textAlign = "right";
  context.fillText(course.name, ROULETTE_BOARD_WIDTH - 42, 51);

  context.strokeStyle = "rgba(150, 163, 255, 0.28)";
  context.lineWidth = 1.5;
  roundedRect(context, 12, 12, ROULETTE_BOARD_WIDTH - 24, course.height - 24, 20);
  context.stroke();

  context.fillStyle = "rgba(216, 222, 255, 0.76)";
  context.font = "700 11px system-ui, -apple-system, sans-serif";
  context.textAlign = "center";
  context.fillText("DROP ZONE", ROULETTE_BOARD_WIDTH / 2, 102);
}

function drawTrack(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  elapsedSeconds: number,
): void {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const segment of course.segments) {
    drawRail(context, segment);
  }
  context.restore();

  for (const peg of course.pegs) {
    context.save();
    context.shadowColor = "rgba(88, 101, 242, 0.55)";
    context.shadowBlur = 12;
    context.fillStyle = "#7080f5";
    context.beginPath();
    context.arc(peg.x, peg.y, peg.radius + 3, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    const pegGradient = context.createRadialGradient(
      peg.x - peg.radius * 0.35,
      peg.y - peg.radius * 0.35,
      1,
      peg.x,
      peg.y,
      peg.radius,
    );
    pegGradient.addColorStop(0, "#ffffff");
    pegGradient.addColorStop(0.4, "#dce1ff");
    pegGradient.addColorStop(1, "#8ea0ff");
    context.fillStyle = pegGradient;
    context.beginPath();
    context.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  for (const spinner of course.spinners) {
    drawSpinner(context, spinner, elapsedSeconds);
  }

  drawFinishLine(context, course);
}

function drawRail(
  context: CanvasRenderingContext2D,
  segment: RouletteSegment,
): void {
  context.save();
  context.shadowColor = "rgba(88, 101, 242, 0.4)";
  context.shadowBlur = 14;
  context.strokeStyle = "#5968dc";
  context.lineWidth = 13;
  context.beginPath();
  context.moveTo(segment.ax, segment.ay);
  context.lineTo(segment.bx, segment.by);
  context.stroke();
  context.shadowBlur = 0;
  context.strokeStyle = "#d9deff";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(segment.ax, segment.ay);
  context.lineTo(segment.bx, segment.by);
  context.stroke();
  context.restore();
}

function drawSpinner(
  context: CanvasRenderingContext2D,
  spinner: RouletteSpinner,
  elapsedSeconds: number,
): void {
  const segments = getRouletteSpinnerSegments(spinner, elapsedSeconds);

  context.save();
  context.lineCap = "round";
  context.shadowColor = "rgba(104, 118, 255, 0.72)";
  context.shadowBlur = 18;
  for (const segment of segments) {
    context.strokeStyle = "#5261d6";
    context.lineWidth = 18;
    context.beginPath();
    context.moveTo(segment.ax, segment.ay);
    context.lineTo(segment.bx, segment.by);
    context.stroke();

    context.shadowBlur = 0;
    const armGradient = context.createLinearGradient(
      segment.ax,
      segment.ay,
      segment.bx,
      segment.by,
    );
    armGradient.addColorStop(0, "#8fa0ff");
    armGradient.addColorStop(0.5, "#f2f4ff");
    armGradient.addColorStop(1, "#8fa0ff");
    context.strokeStyle = armGradient;
    context.lineWidth = 9;
    context.beginPath();
    context.moveTo(segment.ax, segment.ay);
    context.lineTo(segment.bx, segment.by);
    context.stroke();

    for (const point of [
      { x: segment.ax, y: segment.ay },
      { x: segment.bx, y: segment.by },
    ]) {
      context.fillStyle = "#dfe4ff";
      context.beginPath();
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
      context.fill();
    }
  }

  const hubGradient = context.createRadialGradient(
    spinner.x - 4,
    spinner.y - 4,
    2,
    spinner.x,
    spinner.y,
    15,
  );
  hubGradient.addColorStop(0, "#ffffff");
  hubGradient.addColorStop(0.42, "#b8c2ff");
  hubGradient.addColorStop(1, "#5865f2");
  context.fillStyle = hubGradient;
  context.beginPath();
  context.arc(spinner.x, spinner.y, 15, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(14, 18, 35, 0.72)";
  context.lineWidth = 3;
  context.stroke();
  context.restore();
}

function drawFinishLine(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  const startX = 232;
  const finishWidth = 256;
  const stripe = context.createLinearGradient(startX, 0, startX + finishWidth, 0);
  stripe.addColorStop(0, "#ffffff");
  stripe.addColorStop(0.48, "#cbd3ff");
  stripe.addColorStop(0.52, "#5865f2");
  stripe.addColorStop(1, "#8796ff");
  context.fillStyle = stripe;
  roundedRect(context, startX, course.finishY - 8, finishWidth, 16, 8);
  context.fill();
  context.fillStyle = "#dce1ff";
  context.font = "800 12px system-ui, -apple-system, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText("FINISH", ROULETTE_BOARD_WIDTH / 2, course.finishY + 34);
}

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
  context.shadowColor = winner
    ? "rgba(255, 210, 86, 0.9)"
    : "rgba(0, 0, 0, 0.52)";
  context.shadowBlur = winner ? 22 : 8;
  context.shadowOffsetY = winner ? 0 : 4;
  context.fillStyle = winner ? "#ffd35c" : "#f1f3ff";
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius + (winner ? 4 : 3), 0, Math.PI * 2);
  context.fill();
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
