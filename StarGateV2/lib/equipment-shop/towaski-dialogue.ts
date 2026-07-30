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
    "정밀선이다. 적색 소형 원이 목표다. 풍향 반대로 조준점을 옮기고 호흡을 고정한 뒤 한 발만 써.",
    "탄착점은 조준점과 같지 않아. 바람 수치를 먼저 빼고, 작은 표적 안에 들어온 걸 확인한 다음 호흡을 잠가.",
  ],
  heavy: [
    "중화기선이다. 조준점을 장갑 표적에 붙들고 짧게 끊어. 청색 횡단 인원이 켜지면 바로 손을 떼고 냉각해.",
    "제압은 탄을 붓는 게 아니다. 반동을 누른 짧은 점사를 쌓고, 횡단 경보가 뜨면 냉각 구간으로 써.",
  ],
  flame: [
    "화염선이다. 누르고 끌어 적색 지점을 경로로 이어. 청색 구역과 연료통 앞에서는 손을 떼서 분사선을 끊어.",
    "불은 방아쇠를 놓은 뒤에도 길을 기억한다. 소각 경로를 먼저 보고 보호 구역 앞에서 확실히 끊어.",
  ],
  sonic: [
    "음파선은 표적 사격이 아니다. 표시된 Hz, 출력, 폭 세 계기를 허용 구간에 맞추고 안전 부하를 확인한 뒤 펄스를 내보내.",
    "뭘 맞히냐고? 목표 Hz와 두 허용 대역이다. 세 계기가 초록이어도 출력과 폭의 곱이 임계값을 넘으면 방출하지 마.",
    "공진값부터 맞춰. 출력과 파동 폭은 각각 범위 안, 안전 부하는 임계값 아래, 충전은 0.6초에서 1.5초 사이다.",
  ],
  explosive: [
    "폭발물선이다. 정보 카드대로 탄종과 신관을 고르고, 지도에 반경을 놓고, 마지막에 후폭풍 없는 발사선을 확인해.",
    "기폭 버튼부터 찾지 마. 탄종과 신관을 판독하고, 적성만 반경에 넣고, 후방이 CLEAR인지 확인한 뒤 눌러.",
  ],
};

const QUALIFICATION_MODE_BRIEFING_LINES: Record<
  TowaskiLicenseTestMode,
  readonly string[]
> = {
  firearm: QUALIFICATION_RETRY_LINES,
  precision: [
    "다시 본다. 작은 적색 표적이 목표고 청색 원은 보호 구역이다. 바람 반대쪽에서 호흡을 고정해.",
    "재시험이다. 표시된 바람을 탄착점에 더한다고 생각해. 그러니 조준은 그 반대만큼 빼고 들어가.",
  ],
  heavy: [
    "재시험이다. 계속 누르지 마. 반동을 보정한 짧은 점사, 냉각, 횡단 인원 사격 중지 순서다.",
    "이번엔 손을 떼는 시점부터 봐. 1.8초 전에 끊고 CROSSING 동안 총열을 식혀.",
  ],
  flame: [
    "경로부터 다시 짜. 적색 소각 지점은 이어도 되지만 청색 구역과 연료통 앞에서는 반드시 손을 떼.",
    "분사선을 한 번에 잇지 마. 안전 구역 앞에서 끊고 건너편에서 다시 시작하면 된다.",
  ],
  sonic: [
    "다시 계기를 봐. 목표 Hz를 맞추고 출력과 폭을 각각 허용 구간에 넣어. 곱한 안전 부하까지 초록이어야 방출이다.",
    "음파선은 네 조건이다. 주파수, 출력, 폭, 안전 부하. 그다음 충전 시간을 맞춰 펄스를 내보내.",
  ],
  explosive: [
    "다시 순서대로 간다. 탄종·신관, 폭발 반경, 안전 발사선. 세 단계가 모두 맞아야 기폭한다.",
    "정보 카드부터 읽어. 지도 클릭은 두 번째고 CLEAR 발사선 확인은 마지막이다. 순서를 건너뛰지 마.",
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
    return stableLine(
      event.mode
        ? QUALIFICATION_MODE_BRIEFING_LINES[event.mode]
        : QUALIFICATION_RETRY_LINES,
      seed,
    );
  }

  const failureKey = qualificationFailureKey(event.reasons);
  return stableLine(QUALIFICATION_FAILURE_LINES[failureKey], seed);
}
