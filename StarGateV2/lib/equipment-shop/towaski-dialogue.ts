import type { TowaskiLicenseTestDifficulty } from "./license-test";

export type TowaskiDialogueContext = "shop" | "qualification";

export type TowaskiQualificationDialogueEvent =
  | {
      type: "start";
      difficulty: TowaskiLicenseTestDifficulty;
      attempt: number;
    }
  | {
      type: "failed";
      difficulty: TowaskiLicenseTestDifficulty;
      attempt: number;
      reasons: readonly string[];
    }
  | {
      type: "briefing";
      difficulty: TowaskiLicenseTestDifficulty;
      attempt: number;
    };

const QUALIFICATION_START_LINES: Record<
  TowaskiLicenseTestDifficulty,
  readonly string[]
> = {
  basic: [
    "기초선이다. 표적은 오래 열어준다. 먼저 보고, 확인하고, 그다음 쏴.",
    "기초부터 간다. 속도보다 식별이다. 민간 표적이면 손가락부터 떼.",
    "표적 크기도 시간도 넉넉하다. 서두르지 말고 적성 표적만 끊어.",
  ],
  standard: [
    "표준선이다. 표적이 닫히기 전에 식별하고 한 발씩 끝내.",
    "표준 절차로 간다. 조준보다 먼저 적성과 민간을 구분해.",
    "실전 반출 기준이다. 탄을 아끼고, 확인한 표적에만 쏴.",
  ],
  expert: [
    "숙련선이다. 망설일 시간은 짧다. 그래도 민간 오사는 변명이 안 돼.",
    "숙련 기준으로 간다. 빠르게 보고 정확하게 끊어. 둘 다 해.",
    "표적이 금방 닫힌다. 속도에 밀려 식별을 버리면 바로 탈락이다.",
  ],
};

const QUALIFICATION_RETRY_LINES = [
  "다시 선다. 방금 놓친 건 점수가 아니라 절차다. 식별부터 고쳐.",
  "재시험 준비해. 손이 먼저 나갔다면 이번엔 눈으로 한 번 더 확인해.",
  "한 번 더 기회 준다. 적성 표적만 끊고 민간 표적은 끝까지 건드리지 마.",
] as const;

const QUALIFICATION_FAILURE_LINES = {
  civilian_hit: [
    "민간 표적을 맞혔다. 점수 문제가 아니야. 식별부터 다시 배워.",
    "손가락이 눈보다 빨랐군. 민간 오사는 한 발이어도 탈락이다.",
    "민간 표적을 구분 못 하면 총은 못 내준다. 다시 처음부터.",
  ],
  hostile_hits: [
    "적성 표적을 너무 많이 흘렸다. 조준점을 쫓지 말고 움직임을 먼저 읽어.",
    "유효 적중이 모자란다. 탄을 뿌리지 말고 확인한 표적을 끝내.",
    "적성 표적을 놓쳤다. 다음엔 중앙을 쫓지 말고 나타날 자리를 봐.",
  ],
  accuracy: [
    "명중률이 기준 아래다. 급하게 여러 발 쏘는 버릇부터 버려.",
    "탄은 나갔는데 기록에 남을 명중이 부족하다. 한 발씩 확실히.",
    "방아쇠를 많이 당긴다고 사격이 되는 건 아니야. 조준부터 다시.",
  ],
  invalid: [
    "시험 기록이 끊겼다. 사격선 초기화한다. 준비되면 다시 들어와.",
    "판정 기록이 맞지 않는다. 이 상태로는 합격 처리 못 해. 다시 시작해.",
  ],
} as const;

function stableLine(lines: readonly string[], seed: string): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  return lines[index % lines.length] ?? lines[0] ?? "";
}

export function getTowaskiDialogueContext(
  requiresLicenseTest: boolean,
): TowaskiDialogueContext {
  return requiresLicenseTest ? "qualification" : "shop";
}

export function shouldScheduleTowaskiShopIdle(
  context: TowaskiDialogueContext,
): boolean {
  return context === "shop";
}

export function getTowaskiQualificationDialogueLine(
  event: TowaskiQualificationDialogueEvent,
): string {
  const seed = `${event.type}:${event.difficulty}:${event.attempt}`;
  if (event.type === "start") {
    return stableLine(QUALIFICATION_START_LINES[event.difficulty], seed);
  }
  if (event.type === "briefing") {
    return stableLine(QUALIFICATION_RETRY_LINES, seed);
  }

  const failureKey = event.reasons.includes("civilian_hit")
    ? "civilian_hit"
    : event.reasons.includes("hostile_hits")
      ? "hostile_hits"
      : event.reasons.includes("accuracy")
        ? "accuracy"
        : "invalid";
  return stableLine(QUALIFICATION_FAILURE_LINES[failureKey], seed);
}
