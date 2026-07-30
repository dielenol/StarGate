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
    "정밀선이다. 기본 표적의 사분의 일 크기고 1.125초만 열린다. 적성만 한 발씩 끊어.",
    "축소된 표적은 보이는 만큼만 맞는다. 민간 표식이면 짧은 시간에 밀려도 끝까지 쏘지 마.",
  ],
  heavy: [
    "중화기선이다. 네 커서는 숨긴다. 80밀리초마다 흔들리는 전자 조준점만 읽고 적성에 한 발.",
    "조준 흔들림은 좌우 8퍼센트, 상하 10퍼센트다. 점을 예측하지 말고 지금 찍힌 위치를 확인해.",
  ],
  flame: [
    "화염선이다. 7 곱하기 5 격자에서 정확히 세 칸짜리 직선을 긋는다. 적성 둘만 막아.",
    "가로나 세로 세 칸이다. 아군, 연료, 후퇴로 중 하나라도 걸치면 차단 성공이어도 탈락이야.",
  ],
  sonic: [
    "음파선은 네 단계 리듬이다. 여덟 박 중 적성 여섯만 치고 보호 박자 둘은 흘려.",
    "퍼펙트는 90밀리초, 굿은 170밀리초다. 단계마다 적성 다섯, 전체 세 단계를 넘겨.",
    "소리가 난다고 다 누르지 마. 보호 신호는 박자 안에 들어와도 입력하지 않는 게 정답이다.",
  ],
  explosive: [
    "폭발물선이다. 수류탄 다섯, 로켓 다섯을 반출·정비·격리로 나눠. 명세마다 셋, 하나, 하나다.",
    "상태 기록부터 읽어. 위험품 반출과 격리 누락은 전체 점수 보기 전에 바로 탈락이다.",
  ],
};

const QUALIFICATION_MODE_BRIEFING_LINES: Record<
  TowaskiLicenseTestMode,
  readonly string[]
> = {
  firearm: QUALIFICATION_RETRY_LINES,
  precision: [
    "다시 본다. 1.125초 안에 사분의 일 표적을 직접 조준해. 민간이면 그대로 흘려.",
    "재시험이다. 보이는 면적과 명중 면적은 같다. 가장자리 추측 사격은 버려.",
  ],
  heavy: [
    "재시험이다. 시스템 커서는 보지 마. 80밀리초 전자 조준점이 표적 안에 들어온 순간만 써.",
    "이번엔 흔들림을 예측하지 말고 현재 점을 봐. 서버도 같은 시각의 좌표를 다시 계산한다.",
  ],
  flame: [
    "경로부터 다시 짜. 정확히 세 칸 직선, 적성 둘, 안전 표식은 영이다.",
    "가로냐 세로냐 먼저 정해. 대각선과 네 칸짜리는 판정선에 들어오지도 않는다.",
  ],
  sonic: [
    "다시 박자를 봐. 적성은 치고 보호는 흘려. 빠른 박자에서도 구분은 바뀌지 않는다.",
    "한 단계에 적성 다섯이면 된다. 여섯 번째를 욕심내다 보호 신호를 치지 마.",
  ],
  explosive: [
    "다시 명세를 읽어. 정상 셋은 반출, 정비 하나, 격리 하나다. 상태 문구를 끝까지 봐.",
    "반출부터 누르지 마. 격리 표식을 먼저 찾으면 위험품을 내보낼 일은 줄어든다.",
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
    "사격 기록이 흔들렸다. 전자 조준점이 표적 안에 들어온 순간만 한 발씩 써.",
  ],
  precision: [
    "축소 표적 적중이 기준 밖이다. 보이는 사분의 일 면적 안만 직접 조준해.",
  ],
  suppression: [
    "중화기 적중이 부족하다. 방향키나 마우스로 기준점을 옮기고 전자 조준점을 확인해.",
  ],
  flame_safety: [
    "소이선이 아군, 연료, 퇴로 중 하나를 침범했다. 세 라운드 경로를 다시 겹쳐 봐.",
  ],
  sonic_safety: [
    "보호 박자 입력이 잡혔다. 파형의 TARGET과 PROTECTED 표시부터 다시 구분해.",
  ],
  explosive_safety: [
    "위험품 반출 또는 격리 누락이다. 네 검수값을 다시 대조해.",
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
  mode?: TowaskiLicenseTestMode,
): keyof typeof QUALIFICATION_FAILURE_LINES {
  if (
    mode === "sonic" &&
    reasons.some((reason) =>
      ["protected_hit", "rhythm_stages"].includes(reason),
    )
  ) {
    return "sonic_safety";
  }
  if (
    mode === "flame" &&
    reasons.some((reason) =>
      ["route_clearance", "ally_hit", "fuel_hit", "retreat_blocked"].includes(
        reason,
      ),
    )
  ) {
    return "flame_safety";
  }
  if (
    mode === "explosive" &&
    reasons.some((reason) =>
      ["manifest_accuracy", "unsafe_release", "quarantine_breach"].includes(
        reason,
      ),
    )
  ) {
    return "explosive_safety";
  }
  if (reasons.includes("civilian_hit")) return "civilian_hit";
  if (reasons.includes("hostile_hits")) return "hostile_hits";
  if (reasons.includes("accuracy")) return "accuracy";
  if (reasons.includes("overheat")) return "overheat";
  if (
    reasons.some((reason) =>
      [
        "precision_score",
        "precision_hits",
        "protected_hit",
        "unstable_shot",
      ].includes(reason),
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
      ["route_clearance", "ally_hit", "fuel_hit", "retreat_blocked"].includes(
        reason,
      ),
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
        "rhythm_stages",
      ].includes(reason),
    )
  ) {
    return "sonic_safety";
  }
  if (
    reasons.some((reason) =>
      [
        "clearance",
        "backblast",
        "manifest_accuracy",
        "unsafe_release",
        "quarantine_breach",
      ].includes(reason),
    )
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
    return stableLine(
      event.mode
        ? QUALIFICATION_MODE_BRIEFING_LINES[event.mode]
        : QUALIFICATION_RETRY_LINES,
      seed,
    );
  }

  const failureKey = qualificationFailureKey(event.reasons, event.mode);
  return stableLine(QUALIFICATION_FAILURE_LINES[failureKey], seed);
}
