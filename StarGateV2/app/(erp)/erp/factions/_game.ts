import type { FactionBoardNode, FactionBoardNodeKind } from "./FactionsClient";

export interface RelationTier {
  min: number;
  max: number;
  label: string;
  hostileLabel: string;
  summary: string;
}

export interface FactionActionPreview {
  id: string;
  channel: string;
  label: string;
  detail: string;
  effectLabel: string;
}

export interface FactionQuestPreview {
  id: string;
  title: string;
  summary: string;
  minimumFavorability: number;
  reward: string;
}

export interface FactionBenefitRule {
  min: number;
  label: string;
  description: string;
}

export interface FactionContactScene {
  operatorName: string;
  operatorRole: string;
  operatorCodename: string;
  openingLine: string;
  idleLine: string;
  successLine: string;
  lockedLine: string;
  sceneTone: "council" | "military" | "civil" | "tech" | "hostile" | "novus";
  operatorPortraitUrl?: string;
  sceneBackgroundUrl?: string;
}

export interface FactionGameProfile {
  operatorLabel: string;
  contactLine: string;
  scene: FactionContactScene;
  actions: FactionActionPreview[];
  quests: FactionQuestPreview[];
  benefits: readonly FactionBenefitRule[];
}

export const RELATION_TIERS: readonly RelationTier[] = [
  {
    min: -10,
    max: -7,
    label: "적대",
    hostileLabel: "통제 실패",
    summary: "접촉 위험이 매우 높고, 개입 시 역추적 가능성이 큽니다.",
  },
  {
    min: -6,
    max: -3,
    label: "불신",
    hostileLabel: "위협 고조",
    summary: "제한적인 정보만 확보되며, 모든 행동 비용이 증가합니다.",
  },
  {
    min: -2,
    max: 2,
    label: "중립",
    hostileLabel: "추적 중",
    summary: "기본 브리핑과 저위험 접촉만 열려 있습니다.",
  },
  {
    min: 3,
    max: 5,
    label: "협조",
    hostileLabel: "단서 확보",
    summary: "기본 접선과 제한 보너스가 활성화됩니다.",
  },
  {
    min: 6,
    max: 8,
    label: "우호",
    hostileLabel: "침투 성공",
    summary: "고급 정보와 특수 선택지를 안정적으로 확보할 수 있습니다.",
  },
  {
    min: 9,
    max: 10,
    label: "핵심 후원",
    hostileLabel: "핵심 약점 확보",
    summary: "작전 카드급 혜택과 결정적 정보 접근이 가능합니다.",
  },
] as const;

const DEFAULT_BENEFITS: readonly FactionBenefitRule[] = [
  {
    min: 3,
    label: "기본 접선",
    description: "세력 담당자와 공식 채널을 열고 저위험 브리핑을 받을 수 있습니다.",
  },
  {
    min: 6,
    label: "우선 협조",
    description: "작전 준비 단계에서 추가 정보나 보급 후보를 먼저 확인합니다.",
  },
  {
    min: 9,
    label: "전략 후원",
    description: "GM 승인하에 장기 혜택이나 전용 임무 보상을 제안받습니다.",
  },
] as const;

const HOSTILE_BENEFITS: readonly FactionBenefitRule[] = [
  {
    min: 3,
    label: "단서 확보",
    description: "적대세력의 활동 패턴과 접촉 흔적을 브리핑으로 확보합니다.",
  },
  {
    min: 6,
    label: "침투 경로",
    description: "작전 전 탐문, 역추적, 차단 선택지 후보가 열립니다.",
  },
  {
    min: 9,
    label: "약점 파일",
    description: "핵심 인물, 시설, 의식 루트에 대한 결정적 단서를 제안받습니다.",
  },
] as const;

const DEFAULT_SCENE: FactionContactScene = {
  operatorName: "사무국 조율자",
  operatorRole: "NOVUS ORDO RELAY",
  operatorCodename: "LOCAL",
  openingLine: "현재 세력 정보와 접선 후보를 정리합니다.",
  idleLine: "선택지를 고르면 실행 전 브리핑을 갱신합니다.",
  successLine: "기록이 갱신되었습니다. 다음 신호를 대기합니다.",
  lockedLine: "관계 단계가 부족합니다. 다른 접선부터 진행하십시오.",
  sceneTone: "novus",
};

function scene(input: Partial<FactionContactScene>): FactionContactScene {
  return {
    ...DEFAULT_SCENE,
    ...input,
  };
}

const PROFILE_BY_CODE: Record<string, FactionGameProfile> = {
  COUNCIL: {
    operatorLabel: "고위 의결 라인",
    contactLine: "예산 승인, 정치적 보호, 고위 정보 접근을 협의합니다.",
    scene: scene({
      operatorName: "이사회 연락관",
      operatorRole: "COUNCIL LIAISON",
      operatorCodename: "COUNCIL",
      openingLine: "의결 라인이 열렸습니다. 제출할 안건을 선택하십시오.",
      successLine: "의결 라인에 반영되었습니다. 후속 검토를 기다립니다.",
      sceneTone: "council",
    }),
    actions: [
      {
        id: "petition",
        channel: "FORMAL",
        label: "예산 청원",
        detail: "사무국 보고서를 제출해 후원 후보를 엽니다.",
        effectLabel: "우호도 +1 후보",
      },
      {
        id: "clearance",
        channel: "CLEARANCE",
        label: "의결 보호 요청",
        detail: "고위 작전의 정치적 차폐를 요청합니다.",
        effectLabel: "위험도 감소 후보",
      },
    ],
    quests: [
      {
        id: "civil-report",
        title: "민간 보고서 제출",
        summary: "외부 피해 규모와 작전 명분을 정리해 이사회 검토 라인에 올립니다.",
        minimumFavorability: 3,
        reward: "예산/허가 계열 혜택 후보",
      },
    ],
    benefits: DEFAULT_BENEFITS,
  },
  MILITARY: {
    operatorLabel: "합동 작전 라인",
    contactLine: "무장 지원, 격리 작전, 군사 정보 교환을 조율합니다.",
    scene: scene({
      operatorName: "군부 연락장교",
      operatorRole: "MILITARY DESK",
      operatorCodename: "MIL",
      openingLine: "작전 채널이 연결되었습니다. 요청할 지원 유형을 지정하십시오.",
      successLine: "작전 라인에 전송되었습니다. 승인 여부를 대기합니다.",
      sceneTone: "military",
    }),
    actions: [
      {
        id: "joint-op",
        channel: "FIELD",
        label: "합동 작전 요청",
        detail: "현장 교전이나 봉쇄 작전에 군부 협력을 붙입니다.",
        effectLabel: "전술 보너스 후보",
      },
      {
        id: "supply",
        channel: "SUPPLY",
        label: "보급 우선권",
        detail: "위험 지역 투입 전 장비 접근권을 협의합니다.",
        effectLabel: "장비 후보 개방",
      },
    ],
    quests: [
      {
        id: "containment-line",
        title: "위협 개체 격리선",
        summary: "군부와 공동으로 격리선을 유지하고 민간 확산을 막습니다.",
        minimumFavorability: 4,
        reward: "봉쇄/엄호 계열 혜택 후보",
      },
    ],
    benefits: DEFAULT_BENEFITS,
  },
  CIVIL: {
    operatorLabel: "민간 조율 라인",
    contactLine: "여론, 민간 제보, 피해자 보호, 시장 루트를 조율합니다.",
    scene: scene({
      operatorName: "민간 조율자",
      operatorRole: "CIVIL CONTACT",
      operatorCodename: "CIV",
      openingLine: "민간 네트워크가 응답했습니다. 조율할 접점을 고르십시오.",
      successLine: "민간 접점 기록이 갱신되었습니다.",
      sceneTone: "civil",
    }),
    actions: [
      {
        id: "witness",
        channel: "CIVIL",
        label: "증언 보호",
        detail: "민간 증언을 보호하고 작전 후폭풍을 낮춥니다.",
        effectLabel: "문서/제보 후보",
      },
      {
        id: "market",
        channel: "LOCAL",
        label: "지역 루트 개방",
        detail: "민간 네트워크를 통해 현장 접근로를 확보합니다.",
        effectLabel: "접촉망 증가 후보",
      },
    ],
    quests: [
      {
        id: "victim-care",
        title: "피해자 보호 조치",
        summary: "백장미단과 스페이스 제로 사이의 민간 보호 루트를 조율합니다.",
        minimumFavorability: 5,
        reward: "민간 제보/보호 혜택 후보",
      },
    ],
    benefits: DEFAULT_BENEFITS,
  },
  WHITE_ROSE: {
    operatorLabel: "급진 시민 접촉",
    contactLine: "민간 인권, 정보 공개, 피해자 증언을 중심으로 접촉합니다.",
    scene: scene({
      operatorName: "백장미단 연락책",
      operatorRole: "WHITE ROSE CELL",
      operatorCodename: "ROSE",
      openingLine: "익명 회선이 연결되었습니다. 보호할 증언을 지정하십시오.",
      successLine: "민간 기록망에 반영되었습니다. 공개 시점을 검토합니다.",
      sceneTone: "civil",
    }),
    actions: [
      {
        id: "testimony",
        channel: "PUBLIC",
        label: "증언 검증",
        detail: "민간 증언을 교차 확인해 작전 명분을 확보합니다.",
        effectLabel: "신뢰도 상승 후보",
      },
      {
        id: "protection",
        channel: "SAFEHOUSE",
        label: "보호 요청",
        detail: "위험한 민간 접촉자를 임시 보호망에 넣습니다.",
        effectLabel: "인물 보호 후보",
      },
    ],
    quests: [
      {
        id: "archive-truth",
        title: "은폐 기록 검증",
        summary: "민간 측이 확보한 기록을 사무국 자료와 대조합니다.",
        minimumFavorability: 6,
        reward: "증언/문서 계열 혜택 후보",
      },
    ],
    benefits: DEFAULT_BENEFITS,
  },
  SPACE_ZERO: {
    operatorLabel: "기술 계약 라인",
    contactLine: "기술 자본, 특수 장비, 글로벌 시장 루트를 거래합니다.",
    scene: scene({
      operatorName: "스페이스 제로 중개자",
      operatorRole: "SPACE ZERO BROKER",
      operatorCodename: "SPZ",
      openingLine: "계약 채널이 활성화되었습니다. 거래 조건을 선택하십시오.",
      successLine: "계약 후보가 갱신되었습니다. 장비 검토 라인을 확인하십시오.",
      sceneTone: "tech",
    }),
    actions: [
      {
        id: "prototype",
        channel: "TECH",
        label: "실험 장비 테스트",
        detail: "현장 검증 조건으로 장비 후보를 제안받습니다.",
        effectLabel: "장비 할인 후보",
      },
      {
        id: "logistics",
        channel: "MARKET",
        label: "물류 루트 협의",
        detail: "민간 시장을 통한 우회 보급선을 검토합니다.",
        effectLabel: "보급 후보 개방",
      },
    ],
    quests: [
      {
        id: "prototype-field-test",
        title: "격리 장비 프로토콜",
        summary: "스페이스 제로 장비의 현장 테스트 조건과 회수 절차를 정합니다.",
        minimumFavorability: 3,
        reward: "기술/장비 계열 혜택 후보",
      },
    ],
    benefits: DEFAULT_BENEFITS,
  },
  GOLDEN_DAWN: {
    operatorLabel: "차단/추적 라인",
    contactLine: "커트 의식, 은닉 루트, 침투 흔적을 추적합니다.",
    scene: scene({
      operatorName: "의식 추적 분석관",
      operatorRole: "COUNTER-RITUAL DESK",
      operatorCodename: "DAWN",
      openingLine: "직접 접촉이 아닙니다. 추적할 흔적을 선택하십시오.",
      successLine: "차단 기록이 갱신되었습니다. 다음 의식 신호를 감시합니다.",
      lockedLine: "단서가 부족합니다. 기본 추적부터 진행하십시오.",
      sceneTone: "hostile",
    }),
    actions: [
      {
        id: "ritual-trace",
        channel: "TRACE",
        label: "의식 흔적 추적",
        detail: "최근 보고서와 위키 기록에서 반복되는 상징을 대조합니다.",
        effectLabel: "단서 +1 후보",
      },
      {
        id: "intercept",
        channel: "COUNTER",
        label: "은닉 루트 차단",
        detail: "적대 접촉망을 역추적해 다음 행동을 예측합니다.",
        effectLabel: "위협도 감소 후보",
      },
    ],
    quests: [
      {
        id: "cult-disruption",
        title: "커트 의식 방해",
        summary: "황금여명회가 남긴 상징과 접선 루트를 추적해 의식을 차단합니다.",
        minimumFavorability: 3,
        reward: "적대 의식 차단 혜택 후보",
      },
    ],
    benefits: HOSTILE_BENEFITS,
  },
  AHNENERBE: {
    operatorLabel: "적대 연구 추적",
    contactLine: "비밀 연구, 시설 흔적, 광명회 계열 침투 의혹을 추적합니다.",
    scene: scene({
      operatorName: "적대 연구 분석관",
      operatorRole: "HOSTILE RESEARCH DESK",
      operatorCodename: "AH",
      openingLine: "분석 회선이 열렸습니다. 확보할 연구 흔적을 지정하십시오.",
      successLine: "연구 추적 파일이 갱신되었습니다.",
      lockedLine: "검증된 단서가 부족합니다. 관측 기록부터 확보하십시오.",
      sceneTone: "hostile",
    }),
    actions: [
      {
        id: "facility-audit",
        channel: "AUDIT",
        label: "연구 시설 탐문",
        detail: "작전 기록과 시설 정보를 대조해 침투 후보지를 좁힙니다.",
        effectLabel: "시설 단서 후보",
      },
      {
        id: "asset-recovery",
        channel: "RECOVERY",
        label: "자료 회수",
        detail: "적대 연구 자료를 회수해 사무국 분석 라인에 넘깁니다.",
        effectLabel: "보고서 후보",
      },
    ],
    quests: [
      {
        id: "research-site",
        title: "연구 시설 자료 회수",
        summary: "아넨에르베 계열 연구 흔적을 확보하고 광명회 연결성을 검증합니다.",
        minimumFavorability: 3,
        reward: "시설/개체 약점 후보",
      },
    ],
    benefits: HOSTILE_BENEFITS,
  },
};

const DEFAULT_PROFILE: FactionGameProfile = {
  operatorLabel: "사무국 조율 라인",
  contactLine: "세력 정보를 정리하고 다음 접선 후보를 검토합니다.",
  scene: DEFAULT_SCENE,
  actions: [
    {
      id: "briefing",
      channel: "LOCAL",
      label: "브리핑 갱신",
      detail: "현재 문서, 보고서, 연락망을 다시 대조합니다.",
      effectLabel: "정보 갱신 후보",
    },
    {
      id: "contact",
      channel: "CONTACT",
      label: "접선 후보 검토",
      detail: "관계 점수에 따라 가능한 접촉 방식을 정리합니다.",
      effectLabel: "접촉 후보 개방",
    },
  ],
  quests: [
    {
      id: "relation-check",
      title: "관계도 재검토",
      summary: "최근 작전 보고서를 기준으로 관계도 변화 가능성을 점검합니다.",
      minimumFavorability: 0,
      reward: "관계 브리핑 갱신",
    },
  ],
  benefits: DEFAULT_BENEFITS,
};

export function isHostileFaction(node: Pick<FactionBoardNode, "kind" | "parentCode">) {
  return node.kind === "hostile" || node.parentCode === "HOSTILE";
}

export function getRelationTier(
  favorability: number | null,
): RelationTier {
  const score = favorability ?? 0;
  return (
    RELATION_TIERS.find((tier) => score >= tier.min && score <= tier.max) ??
    RELATION_TIERS[2]
  );
}

export function getRelationTierLabel(
  favorability: number | null,
  hostile: boolean,
) {
  const tier = getRelationTier(favorability);
  return hostile ? tier.hostileLabel : tier.label;
}

export function getNextRelationTier(
  favorability: number | null,
  hostile: boolean,
) {
  const score = favorability ?? 0;
  const next = RELATION_TIERS.find((tier) => tier.min > score);
  if (!next) return null;

  return {
    points: next.min - score,
    label: hostile ? next.hostileLabel : next.label,
    min: next.min,
  };
}

export function getRelationProgress(favorability: number | null): number {
  const score = favorability ?? 0;
  return Math.round(((score + 10) / 20) * 100);
}

export function getFactionGameProfile(
  code: string,
  kind: FactionBoardNodeKind,
): FactionGameProfile {
  if (kind === "hostile" && code === "HOSTILE") {
    return {
      ...DEFAULT_PROFILE,
      operatorLabel: "위협 통제 라인",
      contactLine: "직접 협상이 아니라 감시, 차단, 역추적 중심으로 관리합니다.",
      scene: scene({
        operatorName: "위협 통제 분석관",
        operatorRole: "HOSTILE CONTROL",
        operatorCodename: "WATCH",
        openingLine: "적대세력 통제 화면입니다. 추적 대상을 선택하십시오.",
        successLine: "통제 기록이 갱신되었습니다.",
        lockedLine: "추적 근거가 부족합니다. 기본 감시부터 진행하십시오.",
        sceneTone: "hostile",
      }),
      benefits: HOSTILE_BENEFITS,
    };
  }

  return PROFILE_BY_CODE[code] ?? DEFAULT_PROFILE;
}
