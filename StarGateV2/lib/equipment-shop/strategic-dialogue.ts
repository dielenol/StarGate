export type StrategicMood =
  | "welcome"
  | "inspect"
  | "systems"
  | "dispatch"
  | "checkout"
  | "blocked"
  | "idle";

export type StrategicCharacterProfile =
  | "assault"
  | "guard"
  | "endurance"
  | "focus"
  | "balanced";

type StrategicCatalogItem = {
  key: string;
  name: string;
  available: boolean;
};

export const STRATEGIC_DIALOGUE_LINES = {
  welcome:
    "왔네. 출고 도장은 서류에 찍지만, 승인 여부는 시동 소리로 정해. 먼저 운용 인원부터 맞춰 보자.",
  noAgent:
    "보급 대상이 지정되지 않았어. 운용자 없는 자산은 출고장 밖으로 못 나가.",
  closed:
    "오늘 반출대는 닫았어. 정비 이력과 승인선이 다시 열리면 그때 시동 걸자.",
  gmOnly:
    "기술 검수는 가능하지만 최종 반출은 승인 담당관 서명이 필요해. 자산은 열쇠보다 책임이 먼저야.",
  unavailable:
    "그건 지금 정비 슬롯에 묶여 있어. 멀쩡하다는 기록만으로는 출고 못 해. 직접 시동 확인이 먼저야.",
  insufficient:
    "예산이 자산보다 가볍네. 연료와 회수 비용까지 계산한 뒤 다시 요청서 올려.",
  checkout:
    "출고 승인 확인. 승무원, 연료, 회수 계획까지 한 묶음이야. 하나라도 빠지면 현장에서 멈춰.",
  checkoutError:
    "반출 절차가 멈췄어. 승인선, 잔액, 자산 상태 중 하나가 장부와 안 맞아. 억지로 시동 걸진 마.",
} as const;

export const STRATEGIC_MOOD_LABELS: Record<StrategicMood, string> = {
  welcome: "요청서 확인",
  inspect: "자산 점검",
  systems: "계통 진단",
  dispatch: "출고 준비",
  checkout: "반출 승인",
  blocked: "반출 보류",
  idle: "시운전 대기",
};

export const STRATEGIC_IDLE_LINES: readonly {
  mood: StrategicMood;
  text: string;
}[] = [
  {
    mood: "idle",
    text: "차량은 세워 둬도 늙어. 연료보다 먼저 배터리와 실링이 죽지.",
  },
  {
    mood: "systems",
    text: "정상 표시등은 출발 허가가 아니야. 비상 정지부터 직접 눌러 봐야 끝나.",
  },
  {
    mood: "inspect",
    text: "카탈로그 제원은 공장에서 나온 숫자고, 정비 이력은 현장에서 살아남은 숫자야.",
  },
  {
    mood: "idle",
    text: "귀환 계획 없는 전략 자산은 보급품이 아니라 다음 작전의 구조 요청이야.",
  },
  {
    mood: "systems",
    text: "승무원 한 명이 빠지면 장비 하나가 아니라 절차 세 개가 같이 비어.",
  },
  {
    mood: "inspect",
    text: "새 흠집은 괜찮아. 어디서 생겼는지 아무도 모르는 흠집이 문제지.",
  },
] as const;

const STRATEGIC_PROFILE_LINES: Record<
  StrategicCharacterProfile,
  readonly string[]
> = {
  assault: [
    "화력부터 고르기 전에 승무원과 회수 수단을 확인해. 멈춘 전차는 가장 비싼 엄폐물이니까.",
    "빠르게 밀어붙이는 팀이네. 탄약보다 먼저 퇴로와 재급유 지점을 잡자.",
  ],
  guard: [
    "방호를 중시하는 팀이군. 장갑 수치만 보지 말고 탈출구와 견인 지점부터 확인하자.",
    "버티는 건 장갑이 해도 돌아오는 건 승무원이 해야 해. 비상 해치부터 맞춰 보자.",
  ],
  endurance: [
    "장기 임무에 익숙하네. 최고 속도보다 연료, 냉각, 현장 수리 주기를 먼저 계산하자.",
    "오래 버티는 팀이면 보급 주기가 성능이야. 부품 상자까지 자산 목록에 넣어.",
  ],
  focus: [
    "정밀 운용 쪽이군. 센서, 통신, 전자전 계통을 임무 채널에 맞춰 보자.",
    "눈이 빠른 팀이네. 드론과 표적 장비는 탐지 범위보다 데이터 지연부터 확인해.",
  ],
  balanced: [
    "운용 편성이 고르게 잡혔네. 임무 환경과 귀환 계획에 맞는 자산부터 좁혀 보자.",
    "특정 계통에 치우치진 않았어. 필요한 화력보다 감당할 수 있는 유지비부터 보자.",
  ],
};

const AIRCRAFT_KEYS = new Set([
  "ch-47-chinook",
  "uh-60-black-hawk",
]);
const VEHICLE_KEYS = new Set([
  "hmmwv-humvee",
  "m1-abrams",
  "m977-hemtt-military-truck",
  "medical-ambulance",
]);
const ELECTRONIC_KEYS = new Set([
  "drone-self-destruct-mod",
  "missile-guidance-laser",
  "portable-emp-launcher",
]);

function stableLine(lines: readonly string[], seed: string): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  return lines[index % lines.length] ?? lines[0] ?? "";
}

export function buildStrategicWelcomeLine(args: {
  codename: string | null;
  profile: StrategicCharacterProfile;
}): string {
  if (!args.codename) return STRATEGIC_DIALOGUE_LINES.welcome;
  const profileLine = stableLine(
    STRATEGIC_PROFILE_LINES[args.profile],
    `${args.codename}:${args.profile}:RATCHET`,
  );
  return `${args.codename}, 자산 요청서 확인했어. ${profileLine}`;
}

export function buildStrategicItemLine(
  item: StrategicCatalogItem,
): { mood: StrategicMood; text: string } {
  if (!item.available) {
    return { mood: "blocked", text: STRATEGIC_DIALOGUE_LINES.unavailable };
  }

  if (AIRCRAFT_KEYS.has(item.key)) {
    return {
      mood: "systems",
      text: `${item.name}. 조종 인원, 비행 시간, 급유 지점부터 확인해. 뜨는 것보다 돌아오는 게 더 어려워.`,
    };
  }
  if (VEHICLE_KEYS.has(item.key)) {
    return {
      mood: "inspect",
      text: `${item.name}. 승무원 편성과 노면, 견인 수단을 먼저 맞춰 보자. 멈추면 화력도 수송도 끝이야.`,
    };
  }
  if (ELECTRONIC_KEYS.has(item.key)) {
    return {
      mood: "systems",
      text: `${item.name}. 전력과 통신 계통부터 본다. 신호가 끊긴 장비는 현장에서 제일 무거운 짐이야.`,
    };
  }
  return {
    mood: "inspect",
    text: `${item.name}. 장착 위치, 작동 시간, 회수 절차를 임무 동선에 맞춰 보자.`,
  };
}

export function buildStrategicDispatchLine(
  item: StrategicCatalogItem,
): string {
  if (!item.available) return STRATEGIC_DIALOGUE_LINES.unavailable;
  return `${item.name} 출고 절차로 넘긴다. 운용 인원과 회수 계획은 장비와 한 묶음으로 기록해.`;
}
