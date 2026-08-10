import type { ResearchLabViewData } from "./ResearchLabView";
import type {
  ResearchConsoleJob,
  ResearchConsoleLine,
} from "./ResearchConsole";
import type {
  XenoDialogueChoice,
  XenoDialogueMessage,
  XenoRelationshipPresentation,
  XenoRelationshipState,
} from "./XenoStage";

export type GmSimulationScenario =
  | "LOCKED"
  | "INITIAL"
  | "OPEN"
  | "QUEUED"
  | "CLAIMABLE";

export const GM_SIMULATION_SCENARIOS: ReadonlyArray<{
  value: GmSimulationScenario;
  label: string;
}> = [
  { value: "LOCKED", label: "최초 제출 전" },
  { value: "INITIAL", label: "24시간 연구 중" },
  { value: "OPEN", label: "생산 가능" },
  { value: "QUEUED", label: "생산·대기열" },
  { value: "CLAIMABLE", label: "개인 수령 대기" },
];

export const GM_SIMULATION_RELATIONSHIPS: ReadonlyArray<{
  value: XenoRelationshipState;
  label: string;
}> = [
  { value: "CONTEMPT", label: "경멸" },
  { value: "HOSTILE", label: "적대" },
  { value: "DISPLEASED", label: "불쾌" },
  { value: "COLD", label: "냉담" },
  { value: "NEUTRAL", label: "무관심" },
  { value: "OBSERVING", label: "관찰" },
  { value: "ACKNOWLEDGED", label: "인정" },
  { value: "FAVORABLE", label: "호의" },
  { value: "DELIGHTED", label: "만족" },
];

const RELATIONSHIP_PRESENTATION: Record<
  XenoRelationshipState,
  XenoRelationshipPresentation
> = {
  CONTEMPT: {
    state: "CONTEMPT",
    label: "경멸",
    description: "노골적인 경멸을 숨기지 않는다",
    icon: "/assets/npcs/xeno/relationship/contempt.webp",
  },
  HOSTILE: {
    state: "HOSTILE",
    label: "적대",
    description: "적의를 품고 있는 듯하다",
    icon: "/assets/npcs/xeno/relationship/hostile.webp",
  },
  DISPLEASED: {
    state: "DISPLEASED",
    label: "불쾌",
    description: "심하게 못마땅해한다",
    icon: "/assets/npcs/xeno/relationship/displeased.webp",
  },
  COLD: {
    state: "COLD",
    label: "냉담",
    description: "차갑게 선을 긋는다",
    icon: "/assets/npcs/xeno/relationship/cold.webp",
  },
  NEUTRAL: {
    state: "NEUTRAL",
    label: "무관심",
    description: "별다른 관심이 없어 보인다",
    icon: "/assets/npcs/xeno/relationship/neutral.webp",
  },
  OBSERVING: {
    state: "OBSERVING",
    label: "관찰",
    description: "관찰할 가치는 있다고 보는 듯하다",
    icon: "/assets/npcs/xeno/relationship/observing.webp",
  },
  ACKNOWLEDGED: {
    state: "ACKNOWLEDGED",
    label: "인정",
    description: "능력을 조금은 인정한다",
    icon: "/assets/npcs/xeno/relationship/acknowledged.webp",
  },
  FAVORABLE: {
    state: "FAVORABLE",
    label: "호의",
    description: "드물게 호의를 보인다",
    icon: "/assets/npcs/xeno/relationship/favorable.webp",
  },
  DELIGHTED: {
    state: "DELIGHTED",
    label: "만족",
    description: "꽤 만족한 듯 웃고 있다",
    icon: "/assets/npcs/xeno/relationship/delighted.webp",
  },
};

const SIMULATION_CHOICES: readonly XenoDialogueChoice[] = [
  { id: "gm-professional", label: "연구 결과로 증명하겠습니다." },
  { id: "gm-question", label: "그렇게까지 실험체를 깎아내려야 합니까?" },
  { id: "gm-provoke", label: "말만 번지르르한 건 당신도 마찬가지군요." },
];

function addHours(timestamp: number, hours: number): string {
  return new Date(timestamp + hours * 60 * 60 * 1_000).toISOString();
}

function makeJob(
  line: ResearchConsoleLine,
  scenario: GmSimulationScenario,
  now: number,
): ResearchConsoleJob | null {
  if (scenario === "QUEUED") {
    return {
      id: `gm-running-${line.id}`,
      kind: "REPEAT",
      status: "RUNNING",
      codename: "INDEXER",
      destination: "SHARED",
      completesAt: addHours(now, 2),
      isViewerJob: false,
    };
  }
  if (scenario === "CLAIMABLE") {
    return {
      id: `gm-claimable-${line.id}`,
      kind: "REPEAT",
      status: "CLAIMABLE",
      codename: "GM TEST SUBJECT",
      destination: "CHARACTER",
      claimDeadline: addHours(now, 1),
      isViewerJob: true,
      claimable: true,
    };
  }
  return null;
}

function makeQueue(
  line: ResearchConsoleLine,
  scenario: GmSimulationScenario,
): ResearchConsoleJob[] {
  if (scenario === "QUEUED") {
    return [
      {
        id: `gm-queued-viewer-${line.id}`,
        kind: "REPEAT",
        status: "QUEUED",
        codename: "GM TEST SUBJECT",
        position: 1,
        destination: "CHARACTER",
        isViewerJob: true,
        cancellable: true,
      },
      {
        id: `gm-queued-pipette-${line.id}`,
        kind: "REPEAT",
        status: "QUEUED",
        codename: "PIPETTE",
        position: 2,
        destination: "SHARED",
      },
    ];
  }
  if (scenario === "CLAIMABLE") {
    return [
      {
        id: `gm-queued-indexer-${line.id}`,
        kind: "REPEAT",
        status: "QUEUED",
        codename: "INDEXER",
        position: 1,
        destination: "SHARED",
      },
    ];
  }
  return [];
}

function simulateLine(
  line: ResearchConsoleLine,
  scenario: GmSimulationScenario,
  now: number,
): ResearchConsoleLine {
  const status =
    scenario === "LOCKED"
      ? "LOCKED"
      : scenario === "INITIAL"
        ? "INITIAL_RESEARCH"
        : "OPEN";
  return {
    ...line,
    status,
    isHalted: false,
    source: {
      ...line.source,
      registered: true,
      sharedQuantity: Math.max(line.source.quantity + 2, 3),
    },
    output: {
      ...line.output,
      registered: true,
      sharedQuantity: Math.max(line.output.sharedQuantity, 1),
    },
    initialCompletesAt:
      scenario === "INITIAL" ? addHours(now, 8) : undefined,
    currentJob: makeJob(line, scenario, now),
    queue: makeQueue(line, scenario),
    viewerBalance: 9_999,
    canStartInitial: scenario === "LOCKED",
    initialEligibilityMessage:
      "GM 시뮬레이션: 제출하면 24시간 최초 연구 상태로 전환됩니다.",
    canCreateJob: scenario === "OPEN",
    productionEligibilityMessage:
      scenario === "OPEN"
        ? "GM 시뮬레이션: 500 CR 차감 없이 반복생산 흐름을 확인합니다."
        : "GM 시뮬레이션의 대표 상태입니다. 라이브 데이터는 변하지 않습니다.",
  };
}

export function createGmSimulationData(input: {
  base: ResearchLabViewData;
  scenario: GmSimulationScenario;
  relationshipState: XenoRelationshipState;
  messages: readonly XenoDialogueMessage[];
  startedAt: number;
}): ResearchLabViewData {
  return {
    ...input.base,
    serverNow: new Date(input.startedAt).toISOString(),
    relationship: RELATIONSHIP_PRESENTATION[input.relationshipState],
    messages: input.messages,
    choices: SIMULATION_CHOICES,
    chatRemaining: 30,
    chatRetryAt: null,
    lines: input.base.lines.map((line) =>
      simulateLine(line, input.scenario, input.startedAt),
    ),
  };
}

export function simulateGmChoice(choiceId: string): {
  relationshipState: XenoRelationshipState;
  playerLine: string;
  xenoLine: string;
  expression: "interested" | "displeased" | "angry";
} {
  if (choiceId === "gm-professional") {
    return {
      relationshipState: "ACKNOWLEDGED",
      playerLine: "연구 결과로 증명하겠습니다.",
      xenoLine:
        "그나마 과학자 흉내는 낼 줄 아는군. 결과가 네 자존심만큼 거창한지는 두고 보지.",
      expression: "interested",
    };
  }
  if (choiceId === "gm-question") {
    return {
      relationshipState: "DISPLEASED",
      playerLine: "그렇게까지 실험체를 깎아내려야 합니까?",
      xenoLine:
        "깎아내린다고? 분류를 정확히 하는 거야. 네 감상은 연구 기록에 아무 쓸모도 없어.",
      expression: "displeased",
    };
  }
  return {
    relationshipState: "HOSTILE",
    playerLine: "말만 번지르르한 건 당신도 마찬가지군요.",
    xenoLine:
      "용기와 무지는 종이 한 장 차이지. 네가 어느 쪽인지 직접 절개해서 확인해 줄까?",
    expression: "angry",
  };
}

export function makeGmSimulationOpening(): XenoDialogueMessage[] {
  return [
    {
      id: "gm-simulation-opening",
      speaker: "XENO",
      text: "또 화면 검수인가. 좋아, 이번에는 적어도 연구소처럼 보이게 만들어 놨겠지?",
      expression: "smirk",
    },
  ];
}
