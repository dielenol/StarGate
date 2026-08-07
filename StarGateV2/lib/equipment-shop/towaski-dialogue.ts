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
    "기초부터 보자. 표적은 오래 열어둘 테니 먼저 식별해. 확인됐을 때만 쏴.",
    "속도는 됐고, 적성인지 민간인지부터 봐. 민간이면 손가락 떼.",
    "시간은 넉넉해. 급하게 뿌리지 말고 적성만 한 발씩.",
  ],
  standard: [
    "표준선 간다. 닫히기 전에 식별해서 한 발, 그걸로 끝내.",
    "조준부터 하지 마. 적성과 민간을 가른 다음 방아쇠야.",
    "이게 실전 반출 기준이야. 확인한 표적에만 쏴.",
  ],
  expert: [
    "숙련선이야. 시간은 짧아도 민간 오사는 핑계가 안 돼.",
    "빠르게 보고 한 발로 끝내. 둘 중 하나만 하면 탈락이야.",
    "곧 닫힌다. 속도에 쫓겨 식별 버리면 바로 끝이야.",
  ],
};

const QUALIFICATION_RETRY_LINES = [
  "다시 서. 방금 놓친 건 점수가 아니라 절차야. 식별부터 고쳐.",
  "재시험 준비해. 아까 손이 먼저 나갔지? 이번엔 눈으로 한 번 더 확인해.",
  "한 번 더 간다. 적성만 끊고, 민간 표적에는 끝까지 손대지 마.",
] as const;

const QUALIFICATION_MODE_START_LINES: Record<
  TowaskiLicenseTestMode,
  readonly string[]
> = {
  firearm: QUALIFICATION_START_LINES.basic,
  precision: [
    "정밀선이야. 표적이 작고 빨리 닫혀. 적성 확인하면 한 발로 끝내.",
    "축소 표적은 보이는 면적만 맞아. 민간 표식이면 시간이 없어도 그냥 흘려.",
  ],
  heavy: [
    "중화기선에선 네 조준점이 숨는다. 흔들리는 전자 조준점이 표적 안에 든 순간만 쏴.",
    "점을 미리 읽으려 하지 마. 지금 보이는 위치만 믿어.",
  ],
  flame: [
    "화염선은 직선으로만 긋는다. 적성 경로는 막고 안전 구역은 남겨.",
    "가로든 세로든 먼저 정해. 아군, 연료, 후퇴로를 건드리면 차단했어도 탈락이야.",
  ],
  sonic: [
    "음파선은 적성 박자만 치고 보호 신호는 흘려. 빠른 단계에서도 구분은 같아.",
    "판정선에 닿는 순간만 쳐. 단계마다 필요한 적중을 채우면 돼.",
    "소리 난다고 다 누르면 안 돼. 보호 신호는 박자 안에 들어와도 흘리는 게 정답이야.",
  ],
  explosive: [
    "폭발물선이야. 수류탄과 로켓 상태 기록을 읽고 반출·정비·격리로 나눠.",
    "상태 기록부터 읽어. 위험품을 반출하거나 격리를 놓치면 점수 볼 것도 없이 탈락이야.",
  ],
};

const QUALIFICATION_MODE_BRIEFING_LINES: Record<
  TowaskiLicenseTestMode,
  readonly string[]
> = {
  firearm: QUALIFICATION_RETRY_LINES,
  precision: [
    "다시 보자. 축소 표적 안을 직접 조준해. 민간이면 그대로 흘려.",
    "재시험이야. 보이는 면적이 곧 명중 면적이니 가장자리는 찍지 마.",
  ],
  heavy: [
    "재시험 간다. 숨겨진 커서 말고 전자 조준점이 표적 안에 든 순간만 봐.",
    "이번엔 흔들림을 미리 읽으려 하지 마. 지금 보이는 점만 믿어.",
  ],
  flame: [
    "경로부터 다시 짜. 직선으로 적성만 막고 안전 표식은 비워.",
    "가로인지 세로인지 먼저 정해. 대각선은 판정도 안 받아.",
  ],
  sonic: [
    "박자부터 다시 봐. 적성은 치고 보호는 흘려. 빨라져도 구분은 같아.",
    "필요한 적중만 채우면 돼. 욕심내다가 보호 신호까지 치지 마.",
  ],
  explosive: [
    "명세 다시 읽어. 반출, 정비, 격리 표식부터 나누고 상태 문구를 끝까지 봐.",
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
    "시험 기록이 끊겼어. 사격선 초기화할 테니 준비되면 다시 들어와.",
    "판정 기록이 안 맞아. 이걸로는 합격 처리 못 해. 다시 시작하자.",
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
    "보호 박자 입력이 잡혔다. 파형의 적성 신호와 보호 신호부터 다시 구분해.",
  ],
  sonic_rhythm: [
    "보호 박자는 잘 넘겼는데 적성 적중이 부족해. 판정선 안에서 필요한 박자를 채워.",
    "리듬 단계 통과 수가 모자라. 적성 신호가 코어에 닿는 순간만 입력해.",
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
  if (mode === "sonic" && reasons.includes("protected_hit")) {
    return "sonic_safety";
  }
  if (mode === "sonic" && reasons.includes("rhythm_stages")) {
    return "sonic_rhythm";
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
      ].includes(reason),
    )
  ) {
    return "sonic_safety";
  }
  if (reasons.includes("rhythm_stages")) return "sonic_rhythm";
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
