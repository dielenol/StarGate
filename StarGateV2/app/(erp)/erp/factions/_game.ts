import type { FactionBoardNode, FactionBoardNodeKind } from "./FactionsClient";

export type FactionAccessBand =
  | "command"
  | "senior"
  | "field"
  | "junior"
  | "unassigned";

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

export interface FactionDialogueLine {
  min: number;
  max: number;
  mood: string;
  line: string;
  afterActionLine: string;
  lineVariants?: readonly string[];
  afterActionLineVariants?: readonly string[];
}

export interface FactionRankDialogue {
  band: FactionAccessBand;
  label: string;
  line: string;
  afterActionLine: string;
}

export interface FactionStoryChoice {
  id: string;
  label: string;
  tone: string;
  prompt: string;
  response: string;
  effectLabel: string;
  minimumFavorability?: number;
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
  dialogue: readonly FactionDialogueLine[];
  rankDialogues: readonly FactionRankDialogue[];
  storyChoices: readonly FactionStoryChoice[];
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

export interface FactionSupportOption {
  id: string;
  label: string;
  hostileLabel: string;
  amount: number;
  improvesUntil: number;
}

export const FACTION_SUPPORT_OPTIONS: readonly FactionSupportOption[] = [
  {
    id: "support-small",
    label: "현장 후원",
    hostileLabel: "추적 예산",
    amount: 150,
    improvesUntil: 0,
  },
  {
    id: "support-mid",
    label: "장기 협조금",
    hostileLabel: "감시망 확장",
    amount: 450,
    improvesUntil: 3,
  },
  {
    id: "support-large",
    label: "전략 후원",
    hostileLabel: "침투 작전비",
    amount: 900,
    improvesUntil: 6,
  },
] as const;

export function getFactionActionDelta(favorability: number): number {
  return favorability < 3 ? 1 : 0;
}

export function getFactionQuestCompletionDelta(favorability: number): number {
  return favorability < 10 ? 1 : 0;
}

export function getFactionSupportDelta(
  optionId: string,
  favorability: number,
): number {
  const option = FACTION_SUPPORT_OPTIONS.find((entry) => entry.id === optionId);
  if (!option) return 0;
  return favorability < option.improvesUntil ? 1 : 0;
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

const DEFAULT_DIALOGUE: readonly FactionDialogueLine[] = [
  {
    min: -10,
    max: -7,
    mood: "냉담",
    line: "연결은 허가됐지만, 이쪽에서는 아직 당신을 믿지 않습니다. 필요한 말만 하십시오.",
    afterActionLine: "불필요한 움직임은 기록됩니다. 다음 선택은 더 신중해야 합니다.",
    lineVariants: [
      "당신 쪽 기록은 아직 위험 등급입니다. 회선 유지 자체가 양보라는 점을 잊지 마십시오.",
      "신원은 확인했습니다. 신뢰는 별개의 문제입니다.",
    ],
    afterActionLineVariants: [
      "움직임은 남겼습니다. 다만 우호적 기록이라고 부르기는 어렵습니다.",
    ],
  },
  {
    min: -6,
    max: -3,
    mood: "경계",
    line: "보고서는 읽었습니다. 다만 신뢰를 맡기기에는 아직 근거가 부족합니다.",
    afterActionLine: "작은 협조부터 쌓아 보죠. 이번 선택의 결과를 보겠습니다.",
    lineVariants: [
      "당신의 접근은 허가됐지만, 내부 공유 범위는 제한됩니다.",
      "말보다 기록이 먼저입니다. 확인 가능한 결과를 보여주십시오.",
    ],
    afterActionLineVariants: [
      "기록은 남겼습니다. 다음 접선에서 같은 실수를 반복하지 않는지 보겠습니다.",
    ],
  },
  {
    min: -2,
    max: 2,
    mood: "중립",
    line: "용건을 들을 준비는 되어 있습니다. 어떤 방식으로 관계를 정리할까요?",
    afterActionLine: "기록은 남겼습니다. 이제 다음 접선으로 이어갈 수 있습니다.",
    lineVariants: [
      "현재 관계는 보류 상태입니다. 설득도, 경고도 아직 이릅니다.",
      "기본 회선은 열려 있습니다. 선택은 당신 쪽에서 먼저 하십시오.",
    ],
    afterActionLineVariants: [
      "접수됐습니다. 의미 있는 변화는 누적된 다음 판단하겠습니다.",
    ],
  },
  {
    min: 3,
    max: 5,
    mood: "호의",
    line: "당신 쪽 제안이라면 검토할 이유가 있습니다. 이번에는 조금 더 편하게 말해도 됩니다.",
    afterActionLine: "괜찮은 선택이었습니다. 다음에는 더 깊은 이야기도 가능하겠군요.",
    lineVariants: [
      "최근 기록은 나쁘지 않습니다. 이번 안건은 조금 더 열어 두죠.",
      "당신 이름은 내부 메모에 올라와 있습니다. 좋은 의미로요.",
    ],
    afterActionLineVariants: [
      "이 정도 협조라면 담당 라인을 한 단계 올릴 수 있습니다.",
    ],
  },
  {
    min: 6,
    max: 8,
    mood: "신뢰",
    line: "이미 여러 번 증명했죠. 필요한 게 있다면 먼저 말해 보세요.",
    afterActionLine: "이 정도면 내부 라인에도 올릴 수 있습니다. 계속 이어가죠.",
    lineVariants: [
      "당신이라면 예외를 검토할 수 있습니다. 단, 기록은 남깁니다.",
      "회선 우선순위를 올려 두었습니다. 요청을 말하십시오.",
    ],
    afterActionLineVariants: [
      "내부 반려 가능성은 낮습니다. 당신 이름이면 충분히 통합니다.",
    ],
  },
  {
    min: 9,
    max: 10,
    mood: "핵심 협력",
    line: "당신을 기다리고 있었습니다. 이번 안건은 우리 쪽에서도 우선순위로 다루겠습니다.",
    afterActionLine: "결정권자에게 직접 전달하겠습니다. 신뢰는 이미 충분합니다.",
    lineVariants: [
      "이 회선은 당신에게 우선 배정되어 있습니다. 바로 본론으로 가죠.",
      "당신 요청이라면 검토가 아니라 조율부터 시작하겠습니다.",
    ],
    afterActionLineVariants: [
      "상위 라인으로 올리겠습니다. 이 정도 신뢰는 쉽게 주어지지 않습니다.",
    ],
  },
] as const;

const HOSTILE_DIALOGUE: readonly FactionDialogueLine[] = [
  {
    min: -10,
    max: -7,
    mood: "접촉 실패",
    line: "신호가 흔들립니다. 상대가 눈치챘습니다. 더 깊이 들어가면 역추적됩니다.",
    afterActionLine: "흔적을 지우는 데 시간이 필요합니다. 다음 접근은 우회하십시오.",
    lineVariants: [
      "상대가 우리보다 먼저 보고 있습니다. 이 회선은 오래 버티지 못합니다.",
      "접근 흔적이 너무 큽니다. 지금은 정보보다 생존이 우선입니다.",
    ],
    afterActionLineVariants: [
      "일단 끊습니다. 다음에는 더 낮은 노이즈로 들어가야 합니다.",
    ],
  },
  {
    min: -6,
    max: -3,
    mood: "위협 고조",
    line: "감시망이 얕습니다. 아직은 이름과 그림자만 붙잡은 상태입니다.",
    afterActionLine: "단서 하나를 더 확보했습니다. 하지만 아직 안전하지 않습니다.",
    lineVariants: [
      "대상은 멀지 않습니다. 문제는 우리 쪽 흔적도 남고 있다는 점입니다.",
      "반응은 있습니다. 접촉이라고 부르기엔 아직 이릅니다.",
    ],
    afterActionLineVariants: [
      "신호가 한 번 더 튀었습니다. 상대도 이쪽을 의식하기 시작했습니다.",
    ],
  },
  {
    min: -2,
    max: 2,
    mood: "관측",
    line: "대상은 움직이고 있습니다. 지금은 접촉이 아니라 관측과 차단이 우선입니다.",
    afterActionLine: "관측 로그가 갱신됐습니다. 다음에는 더 좁은 경로를 고를 수 있습니다.",
    lineVariants: [
      "흐름이 잡혔습니다. 아직 칼을 뽑을 때는 아니지만, 방향은 보입니다.",
      "대상의 윤곽이 보입니다. 성급한 접근은 경로를 태울 수 있습니다.",
    ],
    afterActionLineVariants: [
      "관측 창이 안정화됐습니다. 다음 선택지는 조금 더 날카로워질 겁니다.",
    ],
  },
  {
    min: 3,
    max: 5,
    mood: "단서 확보",
    line: "패턴이 보입니다. 이제 단순 감시가 아니라 유도와 차단을 시도할 수 있습니다.",
    afterActionLine: "상대의 반응을 끌어냈습니다. 작전 선택지가 늘어납니다.",
    lineVariants: [
      "추적선이 겹쳤습니다. 이제 상대의 다음 움직임을 유도할 수 있습니다.",
      "단서가 충분히 모였습니다. 여기서부터는 작전입니다.",
    ],
    afterActionLineVariants: [
      "좋습니다. 상대가 숨긴 문 중 하나가 열렸습니다.",
    ],
  },
  {
    min: 6,
    max: 8,
    mood: "침투",
    line: "내부 회선에 걸렸습니다. 말 한마디보다 침묵 하나가 더 많은 정보를 줍니다.",
    afterActionLine: "침투 기록이 안정화됐습니다. 다음 단계는 약점 확인입니다.",
    lineVariants: [
      "상대 내부의 리듬을 읽고 있습니다. 지금은 조용히 오래 보는 쪽이 이깁니다.",
      "거의 닿았습니다. 질문보다 대기 시간이 더 큰 단서가 됩니다.",
    ],
    afterActionLineVariants: [
      "침투가 유지됩니다. 다음에는 핵심 약점을 건드릴 수 있습니다.",
    ],
  },
  {
    min: 9,
    max: 10,
    mood: "약점 포착",
    line: "대상의 핵심 약점이 드러났습니다. 이제는 추적이 아니라 선택의 문제입니다.",
    afterActionLine: "결정적 단서를 확보했습니다. 작전 카드로 전환할 수 있습니다.",
    lineVariants: [
      "약점이 보입니다. 이 지점부터는 한 번의 결정이 전체 판을 바꿉니다.",
      "대상은 아직 모릅니다. 우리가 어디까지 들어왔는지.",
    ],
    afterActionLineVariants: [
      "결정적입니다. 이건 브리핑이 아니라 작전 개시 조건입니다.",
    ],
  },
] as const;

const DEFAULT_RANK_DIALOGUES: readonly FactionRankDialogue[] = [
  {
    band: "command",
    label: "상위 권한 회선",
    line: "상위 등급 접근으로 확인됩니다. 담당자는 형식 절차를 줄이고 본론부터 받습니다.",
    afterActionLine: "상위 권한으로 접수됐습니다. 반려되더라도 검토 라인은 남습니다.",
  },
  {
    band: "senior",
    label: "정규 작전 회선",
    line: "정규 작전 등급으로 확인됩니다. 현장 기록과 권한 범위가 함께 검토됩니다.",
    afterActionLine: "현장 신뢰도는 충분합니다. 다만 결정권자 승인은 별도입니다.",
  },
  {
    band: "field",
    label: "현장 실무 회선",
    line: "현장 실무 등급으로 접속했습니다. 상대는 결과 중심의 짧은 답을 기대합니다.",
    afterActionLine: "실무 기록으로 반영됩니다. 작은 성공을 여러 번 쌓는 쪽이 유리합니다.",
  },
  {
    band: "junior",
    label: "저위 권한 회선",
    line: "낮은 등급 접근입니다. 회선은 열렸지만, 상대가 먼저 신뢰하지는 않습니다.",
    afterActionLine: "기록은 남았지만, 상위 승인 없이 깊은 협조를 끌어내긴 어렵습니다.",
  },
  {
    band: "unassigned",
    label: "대리 접속",
    line: "접근 요원 등급이 확인되지 않았습니다. 사무국 대리 회선으로 처리합니다.",
    afterActionLine: "대리 기록으로 남깁니다. 실제 요원 등급이 확인되면 반응이 달라질 수 있습니다.",
  },
] as const;

const HOSTILE_RANK_DIALOGUES: readonly FactionRankDialogue[] = [
  {
    band: "command",
    label: "상위 통제 권한",
    line: "상위 권한으로 추적 절차를 생략합니다. 분석관은 곧장 핵심 단서부터 꺼냅니다.",
    afterActionLine: "상위 통제 기록으로 잠겼습니다. 차단 판단까지 올릴 수 있습니다.",
  },
  {
    band: "senior",
    label: "작전 분석 권한",
    line: "정규 작전 권한입니다. 상대가 남긴 흔적을 작전 자료와 대조합니다.",
    afterActionLine: "분석 기록이 안정적입니다. 다음 접근 때 더 깊은 신호를 열 수 있습니다.",
  },
  {
    band: "field",
    label: "현장 추적 권한",
    line: "현장 권한으로 접근합니다. 지금은 빠른 판단보다 흔적 보존이 중요합니다.",
    afterActionLine: "현장 추적 로그가 남았습니다. 다음엔 더 작은 흔적도 잡힐 겁니다.",
  },
  {
    band: "junior",
    label: "제한 추적 권한",
    line: "낮은 권한의 추적 요청입니다. 위험 신호가 감지되면 즉시 회선이 차단됩니다.",
    afterActionLine: "제한 로그로 처리했습니다. 깊은 침투는 상위 승인이 필요합니다.",
  },
  {
    band: "unassigned",
    label: "감시 대리 회선",
    line: "요원 등급이 확인되지 않아 감시 대리 회선으로 전환합니다.",
    afterActionLine: "대리 감시 기록으로 남깁니다. 신원 확정 전에는 접근 깊이가 제한됩니다.",
  },
] as const;

const DEFAULT_STORY_CHOICES: readonly FactionStoryChoice[] = [
  {
    id: "greet",
    label: "조심스럽게 안부를 묻는다",
    tone: "SOFT",
    prompt: "상대의 현재 분위기를 살피며 대화를 연다.",
    response: "형식적인 인사였지만, 회선의 긴장이 조금 낮아졌습니다. 상대는 다음 말을 기다립니다.",
    effectLabel: "분위기 확인",
  },
  {
    id: "share-field-note",
    label: "최근 작전 이야기를 꺼낸다",
    tone: "FIELD",
    prompt: "현장에서 확인한 단서와 위험을 먼저 공유한다.",
    response: "상대가 보고서보다 현장 묘사에 더 오래 반응합니다. 신뢰를 쌓을 실마리가 보입니다.",
    effectLabel: "신뢰 반응",
  },
  {
    id: "personal-concern",
    label: "개인적인 배려를 건넨다",
    tone: "PERSONAL",
    prompt: "일이 아니라 사람을 향한 말로 거리를 좁힌다.",
    response: "잠깐의 침묵 뒤, 상대의 말투가 부드러워집니다. 이제 단순 업무 회선은 아닌 듯합니다.",
    effectLabel: "우호 3+ 대화",
    minimumFavorability: 3,
  },
  {
    id: "quiet-promise",
    label: "다음 도움을 약속한다",
    tone: "COMMIT",
    prompt: "말뿐인 협조가 아니라 다음 행동을 약속한다.",
    response: "상대가 당신의 약속을 따로 기록합니다. 깊은 의뢰를 맡길지 검토하는 눈치입니다.",
    effectLabel: "우호 6+ 대화",
    minimumFavorability: 6,
  },
] as const;

const HOSTILE_STORY_CHOICES: readonly FactionStoryChoice[] = [
  {
    id: "listen-signal",
    label: "신호를 조용히 듣는다",
    tone: "SCAN",
    prompt: "말을 걸지 않고 잡음과 반복 패턴을 분석한다.",
    response: "신호의 끝에 같은 리듬이 반복됩니다. 누군가 의도적으로 흔적을 남긴 듯합니다.",
    effectLabel: "패턴 확인",
  },
  {
    id: "bait-phrase",
    label: "미끼 문장을 흘린다",
    tone: "BAIT",
    prompt: "상대가 반응할 만한 단어를 회선에 섞는다.",
    response: "짧은 반응이 돌아왔습니다. 상대는 대화를 피했지만, 위치를 완전히 숨기지는 못했습니다.",
    effectLabel: "반응 유도",
  },
  {
    id: "shadow-contact",
    label: "위장 접촉을 시도한다",
    tone: "COVER",
    prompt: "아군 신분을 드러내지 않은 채 접근 경로를 만든다.",
    response: "가짜 신분이 1차 검문을 통과했습니다. 아직은 말보다 침묵이 유리합니다.",
    effectLabel: "우호 3+ 침투",
    minimumFavorability: 3,
  },
  {
    id: "pressure-point",
    label: "약점을 찌르는 질문을 던진다",
    tone: "PRESS",
    prompt: "이미 확보한 단서를 이용해 상대의 균열을 시험한다.",
    response: "상대의 응답이 한 박자 늦었습니다. 핵심 약점에 닿은 것이 분명합니다.",
    effectLabel: "우호 6+ 압박",
    minimumFavorability: 6,
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
  dialogue: DEFAULT_DIALOGUE,
  rankDialogues: DEFAULT_RANK_DIALOGUES,
  storyChoices: DEFAULT_STORY_CHOICES,
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
        effectLabel: "초기 관계 +1 후보",
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
      dialogue: HOSTILE_DIALOGUE,
      rankDialogues: HOSTILE_RANK_DIALOGUES,
      storyChoices: HOSTILE_STORY_CHOICES,
    }),
    actions: [
      {
        id: "ritual-trace",
        channel: "TRACE",
        label: "의식 흔적 추적",
        detail: "최근 보고서와 위키 기록에서 반복되는 상징을 대조합니다.",
        effectLabel: "초기 통제 +1 후보",
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
      dialogue: HOSTILE_DIALOGUE,
      rankDialogues: HOSTILE_RANK_DIALOGUES,
      storyChoices: HOSTILE_STORY_CHOICES,
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
        dialogue: HOSTILE_DIALOGUE,
        rankDialogues: HOSTILE_RANK_DIALOGUES,
        storyChoices: HOSTILE_STORY_CHOICES,
      }),
      benefits: HOSTILE_BENEFITS,
    };
  }

  return PROFILE_BY_CODE[code] ?? DEFAULT_PROFILE;
}
