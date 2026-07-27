import type { TowaskiLicenseTestDifficulty } from "./license-test";
import type { TowaskiLicenseTestMode } from "./license-test-v2";

export type TowaskiDialogueContext = "shop" | "qualification";

export type TowaskiQualificationDialogueEvent =
  | {
      type: "start";
      difficulty: TowaskiLicenseTestDifficulty;
      mode?: TowaskiLicenseTestMode;
      attempt: number;
    }
  | {
      type: "failed";
      difficulty: TowaskiLicenseTestDifficulty;
      mode?: TowaskiLicenseTestMode;
      attempt: number;
      reasons: readonly string[];
    }
  | {
      type: "briefing";
      difficulty: TowaskiLicenseTestDifficulty;
      mode?: TowaskiLicenseTestMode;
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

const QUALIFICATION_MODE_START_LINES: Record<
  TowaskiLicenseTestMode,
  readonly string[]
> = {
  firearm: QUALIFICATION_START_LINES.basic,
  precision: [
    "정밀선이다. 풍향 반대로 조준점을 옮기고 호흡을 고정한 뒤 한 발만 써.",
  ],
  heavy: [
    "중화기선이다. 반동을 눌러 짧게 끊고, 횡단 인원이 보이면 바로 손을 떼.",
  ],
  flame: [
    "화염선이다. 적성 구역만 이어 태우고 민간 구역과 연료통에서는 분사선을 끊어.",
  ],
  sonic: [
    "음파선이다. 공진부터 맞추고 출력과 폭을 봉인한 뒤 펄스를 내보내.",
  ],
  explosive: [
    "폭발물선이다. 탄종, 신관, 폭발 반경, 후폭풍 발사선을 순서대로 확인해.",
  ],
};

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
  overheat: [
    "과열 기록이다. 반동을 누르면서 점사를 더 짧게 끊어.",
  ],
  precision: [
    "탄착점과 호흡 안정 기록이 기준 밖이다. 풍향 보정부터 다시.",
  ],
  suppression: [
    "제압 시간이 부족하다. 반동을 누른 상태로 짧은 점사를 더 정확히 이어.",
  ],
  flame_safety: [
    "확산선이 보호 구역에 닿았다. 연료보다 분사 경계를 먼저 봐.",
  ],
  sonic_safety: [
    "공진 또는 출력 봉인이 기준 밖이다. 파형을 안정시킨 뒤 다시.",
  ],
  explosive_safety: [
    "폭발 반경이나 후폭풍 안전선이 틀렸다. 기폭 전에 다시 계산해.",
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

function qualificationFailureKey(
  reasons: readonly string[],
): keyof typeof QUALIFICATION_FAILURE_LINES {
  if (reasons.includes("civilian_hit")) return "civilian_hit";
  if (reasons.includes("hostile_hits")) return "hostile_hits";
  if (reasons.includes("accuracy")) return "accuracy";
  if (reasons.includes("overheat")) return "overheat";
  if (
    reasons.some((reason) =>
      ["precision_score", "protected_hit", "unstable_shot"].includes(reason),
    )
  ) {
    return "precision";
  }
  if (reasons.includes("suppression")) return "suppression";
  if (
    reasons.some((reason) =>
      ["civilian_exposure", "fuel_tank", "fuel", "coverage"].includes(reason),
    )
  ) {
    return "flame_safety";
  }
  if (
    reasons.some((reason) =>
      [
        "resonance",
        "frequency_deviation",
        "protected_exposure",
        "overload",
      ].includes(reason),
    )
  ) {
    return "sonic_safety";
  }
  if (
    reasons.some((reason) => ["clearance", "backblast"].includes(reason))
  ) {
    return "explosive_safety";
  }
  return "invalid";
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
  const seed = event.mode
    ? `${event.type}:${event.difficulty}:${event.mode}:${event.attempt}`
    : `${event.type}:${event.difficulty}:${event.attempt}`;
  if (event.type === "start") {
    return stableLine(
      event.mode && event.mode !== "firearm"
        ? QUALIFICATION_MODE_START_LINES[event.mode]
        : QUALIFICATION_START_LINES[event.difficulty],
      seed,
    );
  }
  if (event.type === "briefing") {
    return stableLine(QUALIFICATION_RETRY_LINES, seed);
  }

  const failureKey = qualificationFailureKey(event.reasons);
  return stableLine(QUALIFICATION_FAILURE_LINES[failureKey], seed);
}
