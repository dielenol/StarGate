import {
  ROULETTE_BOARD_WIDTH,
  type RouletteBall,
  type RouletteCourse,
  type RouletteParticipant,
  type RouletteRace,
} from "./engine";

interface DrawRouletteSceneOptions {
  race: RouletteRace | null;
  previewParticipants: readonly RouletteParticipant[];
  course: RouletteCourse;
  avatarImages: ReadonlyMap<string, CanvasImageSource>;
}

export function drawRouletteScene(
  context: CanvasRenderingContext2D,
  {
    race,
    previewParticipants,
    course,
    avatarImages,
  }: DrawRouletteSceneOptions,
): void {
  context.clearRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);
  drawBackground(context, course);
  drawTrack(context, course);

  if (race) {
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
        race.winnerBallId === ball.ballId,
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
  gradient.addColorStop(0, "#16192c");
  gradient.addColorStop(0.52, "#101426");
  gradient.addColorStop(1, "#090c17");
  context.fillStyle = gradient;
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);

  context.fillStyle = "rgba(142, 160, 255, 0.2)";
  for (let y = 8; y < course.height; y += 13) {
    for (let x = 7; x < ROULETTE_BOARD_WIDTH; x += 17) {
      const offset = ((x * 7 + y * 11) % 9) - 4;
      context.fillRect(x + offset, y, 1, 1);
    }
  }

  context.strokeStyle = "rgba(142, 160, 255, 0.1)";
  context.lineWidth = 1;
  for (let y = 128; y < course.height; y += 32) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(ROULETTE_BOARD_WIDTH, y + 0.5);
    context.stroke();
  }

  context.fillStyle = "#1b2038";
  context.fillRect(18, 18, ROULETTE_BOARD_WIDTH - 36, 64);
  context.fillStyle = "#5865f2";
  context.fillRect(18, 76, ROULETTE_BOARD_WIDTH - 36, 6);

  context.fillStyle = "#eef1ff";
  context.font = "900 17px ui-monospace, monospace";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(
    `COURSE ${course.number} / ${course.distance}`,
    36,
    49,
  );
  context.textAlign = "right";
  context.fillText(course.name, ROULETTE_BOARD_WIDTH - 36, 49);

  context.strokeStyle = "#313852";
  context.lineWidth = 6;
  context.strokeRect(8, 8, ROULETTE_BOARD_WIDTH - 16, course.height - 16);
  context.strokeStyle = "#5865f2";
  context.lineWidth = 2;
  context.strokeRect(16, 16, ROULETTE_BOARD_WIDTH - 32, course.height - 32);

  context.fillStyle = "#c7d0ff";
  context.font = "900 13px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText("▼ DROP ZONE ▼", ROULETTE_BOARD_WIDTH / 2, 101);
}

function drawTrack(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
): void {
  context.save();
  context.lineCap = "square";
  context.lineJoin = "miter";

  for (const segment of course.segments) {
    context.strokeStyle = "#5865f2";
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(segment.ax + 3, segment.ay + 3);
    context.lineTo(segment.bx + 3, segment.by + 3);
    context.stroke();

    context.strokeStyle = "#c7d0ff";
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(segment.ax, segment.ay);
    context.lineTo(segment.bx, segment.by);
    context.stroke();
  }
  context.restore();

  for (const peg of course.pegs) {
    const size = peg.radius * 2 + 8;
    context.fillStyle = "#1b2038";
    context.fillRect(
      Math.round(peg.x - size / 2),
      Math.round(peg.y - size / 2),
      size,
      size,
    );
    context.fillStyle = "#8ea0ff";
    context.fillRect(
      Math.round(peg.x - peg.radius / 2),
      Math.round(peg.y - peg.radius / 2),
      peg.radius,
      peg.radius,
    );
  }

  const cellSize = 14;
  const startX = 232;
  const finishWidth = 256;
  for (let row = 0; row < 2; row += 1) {
    for (
      let column = 0;
      column < Math.ceil(finishWidth / cellSize);
      column += 1
    ) {
      context.fillStyle =
        (row + column) % 2 === 0 ? "#f5f6ff" : "#1b2038";
      context.fillRect(
        startX + column * cellSize,
        course.finishY - 9 + row * 9,
        cellSize,
        9,
      );
    }
  }
  context.strokeStyle = "#5865f2";
  context.lineWidth = 3;
  context.strokeRect(startX, course.finishY - 9, finishWidth, 18);
  context.fillStyle = "#c7d0ff";
  context.font = "900 13px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText("★ FINISH ★", ROULETTE_BOARD_WIDTH / 2, course.finishY + 31);
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
    context.fillStyle = "#c7d0ff";
    context.font = "900 13px ui-monospace, monospace";
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

  context.fillStyle = "rgba(5, 8, 16, 0.68)";
  context.beginPath();
  context.arc(ball.x + 4, ball.y + 5, ball.radius + 3, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.clip();

  if (avatarImage) {
    context.imageSmoothingEnabled = false;
    context.drawImage(
      avatarImage,
      ball.x - ball.radius,
      ball.y - ball.radius,
      ball.radius * 2,
      ball.radius * 2,
    );
  } else {
    context.fillStyle = ball.color;
    context.fillRect(
      ball.x - ball.radius,
      ball.y - ball.radius,
      ball.radius * 2,
      ball.radius * 2,
    );
    context.fillStyle = "#f4f6ff";
    context.font = "900 13px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(getInitial(ball.name), ball.x, ball.y + 1);
  }
  context.restore();

  context.save();
  context.strokeStyle = winner ? "#ffd35c" : "#eef1ff";
  context.lineWidth = winner ? 6 : 4;
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius + 1, 0, Math.PI * 2);
  context.stroke();
  if (winner) {
    context.strokeStyle = "#5865f2";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(ball.x, ball.y, ball.radius + 6, 0, Math.PI * 2);
    context.stroke();
  }

  const label = fitCanvasLabel(context, ball.name, 102);
  context.font = "900 11px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelWidth = Math.min(
    114,
    Math.max(34, context.measureText(label).width + 14),
  );
  const labelY = ball.y - ball.radius - 14;
  context.fillStyle = "#090c17";
  context.fillRect(
    Math.round(ball.x - labelWidth / 2),
    Math.round(labelY - 9),
    Math.round(labelWidth),
    18,
  );
  context.fillStyle = winner ? "#ffe7a3" : "#f4f6ff";
  context.fillText(label, ball.x, labelY + 0.5);
  context.restore();
}

function getInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}

function fitCanvasLabel(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  context.font = "900 11px ui-monospace, monospace";
  if (context.measureText(value).width <= maxWidth) return value;

  const characters = Array.from(value);
  while (characters.length > 1) {
    characters.pop();
    const candidate = `${characters.join("")}…`;
    if (context.measureText(candidate).width <= maxWidth) return candidate;
  }
  return "…";
}
