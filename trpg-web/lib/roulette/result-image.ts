import {
  ROULETTE_BOARD_WIDTH,
  type RouletteCourse,
  type RouletteParticipant,
  type RouletteRace,
} from "./engine";

interface CreateRouletteResultCanvasOptions {
  sourceCanvas: HTMLCanvasElement;
  course: RouletteCourse;
  race: RouletteRace;
  winners: readonly RouletteParticipant[];
  avatarImages: ReadonlyMap<string, CanvasImageSource>;
}

export function createRouletteResultCanvas({
  sourceCanvas,
  course,
  race,
  winners,
  avatarImages,
}: CreateRouletteResultCanvasOptions): HTMLCanvasElement {
  const resultCanvas = document.createElement("canvas");
  resultCanvas.width = ROULETTE_BOARD_WIDTH;
  resultCanvas.height = course.height;

  const context = resultCanvas.getContext("2d");
  if (!context) throw new Error("결과 이미지 캔버스를 만들 수 없습니다.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    0,
    0,
    resultCanvas.width,
    resultCanvas.height,
  );

  drawResultOverlay(context, course, race, winners, avatarImages);
  return resultCanvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("결과 PNG 생성에 실패했습니다."));
    }, "image/png");
  });
}

function drawResultOverlay(
  context: CanvasRenderingContext2D,
  course: RouletteCourse,
  race: RouletteRace,
  winners: readonly RouletteParticipant[],
  avatarImages: ReadonlyMap<string, CanvasImageSource>,
): void {
  const columnCount = winners.length > 5 ? 2 : 1;
  const rowCount = Math.ceil(winners.length / columnCount);
  const panelX = 60;
  const panelWidth = ROULETTE_BOARD_WIDTH - panelX * 2;
  const panelHeight = 172 + rowCount * 58;
  const panelY = Math.max(106, (course.height - panelHeight) / 2);

  context.fillStyle = "rgba(4, 7, 16, 0.46)";
  context.fillRect(0, 0, ROULETTE_BOARD_WIDTH, course.height);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.58)";
  context.shadowBlur = 38;
  const panelGradient = context.createLinearGradient(
    panelX,
    panelY,
    panelX + panelWidth,
    panelY + panelHeight,
  );
  panelGradient.addColorStop(0, "rgba(28, 33, 59, 0.98)");
  panelGradient.addColorStop(1, "rgba(10, 13, 27, 0.98)");
  context.fillStyle = panelGradient;
  roundedRect(context, panelX, panelY, panelWidth, panelHeight, 24);
  context.fill();
  context.restore();

  context.strokeStyle = "rgba(142, 160, 255, 0.9)";
  context.lineWidth = 2;
  roundedRect(context, panelX, panelY, panelWidth, panelHeight, 24);
  context.stroke();

  context.fillStyle = "#aeb9ff";
  context.font = "800 13px system-ui, -apple-system, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("DACHE ROULETTE", panelX + 28, panelY + 34);

  context.fillStyle = "#ffffff";
  context.font = "850 28px system-ui, -apple-system, sans-serif";
  context.fillText("다채 룰렛 결과", panelX + 28, panelY + 72);

  context.fillStyle = "#cbd3ff";
  context.font = "700 13px system-ui, -apple-system, sans-serif";
  context.textAlign = "right";
  context.fillText(
    `${course.name} · ${race.winnerMode === "first" ? "선착" : "후착"} ${winners.length}명`,
    panelX + panelWidth - 28,
    panelY + 70,
  );

  context.strokeStyle = "rgba(142, 160, 255, 0.24)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panelX + 28, panelY + 98);
  context.lineTo(panelX + panelWidth - 28, panelY + 98);
  context.stroke();

  const contentX = panelX + 24;
  const contentWidth = panelWidth - 48;
  const columnGap = 10;
  const rowWidth =
    (contentWidth - columnGap * (columnCount - 1)) / columnCount;

  winners.forEach((winner, index) => {
    const column = Math.floor(index / rowCount);
    const row = index % rowCount;
    const rowX = contentX + column * (rowWidth + columnGap);
    const rowY = panelY + 112 + row * 58;

    context.fillStyle = "rgba(38, 44, 73, 0.86)";
    roundedRect(context, rowX, rowY, rowWidth, 48, 13);
    context.fill();
    context.strokeStyle = "rgba(142, 160, 255, 0.2)";
    context.stroke();

    context.fillStyle = "#5865f2";
    context.beginPath();
    context.arc(rowX + 22, rowY + 24, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = "800 11px system-ui, -apple-system, sans-serif";
    context.textAlign = "center";
    context.fillText(String(index + 1), rowX + 22, rowY + 24.5);

    drawWinnerAvatar(
      context,
      winner,
      avatarImages.get(winner.id),
      rowX + 58,
      rowY + 24,
    );

    context.fillStyle = "#f5f6ff";
    context.font = "800 14px system-ui, -apple-system, sans-serif";
    context.textAlign = "left";
    context.fillText(
      fitText(context, winner.name, rowWidth - 96),
      rowX + 83,
      rowY + 24.5,
    );
  });

  context.fillStyle = "rgba(203, 211, 255, 0.72)";
  context.font = "650 11px system-ui, -apple-system, sans-serif";
  context.textAlign = "left";
  context.fillText(
    `${race.balls.length / race.ballsPerParticipant}명 × ${race.ballsPerParticipant}개 · 총 ${race.balls.length}개 마블`,
    panelX + 28,
    panelY + panelHeight - 27,
  );
  context.textAlign = "right";
  context.fillText(
    `추첨 ID ${race.seed.toString(16).padStart(8, "0").toUpperCase()}`,
    panelX + panelWidth - 28,
    panelY + panelHeight - 27,
  );
}

function drawWinnerAvatar(
  context: CanvasRenderingContext2D,
  winner: RouletteParticipant,
  avatarImage: CanvasImageSource | undefined,
  x: number,
  y: number,
): void {
  context.save();
  context.beginPath();
  context.arc(x, y, 18, 0, Math.PI * 2);
  context.clip();

  if (avatarImage) {
    context.drawImage(avatarImage, x - 18, y - 18, 36, 36);
  } else {
    context.fillStyle = "#5865f2";
    context.fillRect(x - 18, y - 18, 36, 36);
    context.fillStyle = "#ffffff";
    context.font = "800 15px system-ui, -apple-system, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(Array.from(winner.name)[0] ?? "?", x, y + 1);
  }
  context.restore();

  context.strokeStyle = "rgba(255, 255, 255, 0.84)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 19, 0, Math.PI * 2);
  context.stroke();
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
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
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}
