import type { AgentLevel, RelationshipState } from "@stargate/shared-db";

export type XenoExpression =
  | "neutral"
  | "smirk"
  | "interested"
  | "displeased"
  | "angry";

export type XenoSceneId =
  | "ENTRY"
  | "ENTRY_RETURN"
  | "INITIAL_ELIGIBLE"
  | "INITIAL_INELIGIBLE"
  | "INITIAL_SOURCE_MISSING"
  | "INITIAL_STARTED"
  | "INITIAL_COMPLETED"
  | "JOB_QUEUED"
  | "JOB_RUNNING"
  | "JOB_SHARED_COMPLETED"
  | "JOB_CLAIMABLE"
  | "JOB_CLAIMED"
  | "JOB_DIVERTED"
  | "JOB_CANCELLED"
  | "REQUEST_ERROR";

export type XenoChoiceSceneId =
  | "INTRODUCTION"
  | "INITIAL_RESEARCH_OFFER"
  | "METHOD_DISPUTE"
  | "CLAIM_HANDOFF";

export interface XenoDialogueContext {
  codename: string;
  className: string;
  agentLevel?: AgentLevel;
  relationshipState: RelationshipState;
}

export interface XenoRelationshipPresentation {
  state: RelationshipState;
  label: string;
  description: string;
  icon: string;
  expression: XenoExpression;
}

export interface XenoPublicChoice {
  choiceId: string;
  sceneId: XenoChoiceSceneId;
  label: string;
  playerLine: string;
}

interface XenoChoiceDefinition extends XenoPublicChoice {
  delta: number;
  response: string;
  expression: XenoExpression;
  minimumState?: RelationshipState;
}

interface XenoSceneDefinition {
  text: string;
  expression: XenoExpression;
}

const CLASS_BASE_SCORE: Readonly<Record<string, number>> = {
  과학자: 20,
  관료: 0,
  군인: -10,
  실험체: -35,
};

const RANK_SCORE: Readonly<Partial<Record<AgentLevel, number>>> = {
  V: 10,
  A: 7,
  M: 4,
  H: 0,
  G: -4,
  J: -7,
  U: -10,
};

const CANON_INITIAL_SCORE: Readonly<Record<string, number>> = {
  MARGARET: -80,
  PIPETTE: -55,
  INDEXER: -35,
};

const RELATIONSHIP_STATES_BY_WARMTH: readonly RelationshipState[] = [
  "CONTEMPT",
  "HOSTILE",
  "DISPLEASED",
  "COLD",
  "NEUTRAL",
  "OBSERVING",
  "ACKNOWLEDGED",
  "FAVORABLE",
  "DELIGHTED",
];

export const XENO_RELATIONSHIP_PRESENTATIONS: Readonly<
  Record<RelationshipState, XenoRelationshipPresentation>
> = {
  CONTEMPT: {
    state: "CONTEMPT",
    label: "경멸",
    description: "노골적인 경멸을 숨기지 않는다",
    icon: "/assets/npcs/xeno/relationship/contempt.webp",
    expression: "angry",
  },
  HOSTILE: {
    state: "HOSTILE",
    label: "적대",
    description: "적의를 품고 있는 듯하다",
    icon: "/assets/npcs/xeno/relationship/hostile.webp",
    expression: "angry",
  },
  DISPLEASED: {
    state: "DISPLEASED",
    label: "불쾌",
    description: "심하게 못마땅해한다",
    icon: "/assets/npcs/xeno/relationship/displeased.webp",
    expression: "displeased",
  },
  COLD: {
    state: "COLD",
    label: "냉담",
    description: "차갑게 선을 긋는다",
    icon: "/assets/npcs/xeno/relationship/cold.webp",
    expression: "displeased",
  },
  NEUTRAL: {
    state: "NEUTRAL",
    label: "무관심",
    description: "별다른 관심이 없어 보인다",
    icon: "/assets/npcs/xeno/relationship/neutral.webp",
    expression: "neutral",
  },
  OBSERVING: {
    state: "OBSERVING",
    label: "관찰",
    description: "관찰할 가치는 있다고 보는 듯하다",
    icon: "/assets/npcs/xeno/relationship/observing.webp",
    expression: "interested",
  },
  ACKNOWLEDGED: {
    state: "ACKNOWLEDGED",
    label: "인정",
    description: "능력을 조금은 인정한다",
    icon: "/assets/npcs/xeno/relationship/acknowledged.webp",
    expression: "interested",
  },
  FAVORABLE: {
    state: "FAVORABLE",
    label: "호의",
    description: "드물게 호의를 보인다",
    icon: "/assets/npcs/xeno/relationship/favorable.webp",
    expression: "smirk",
  },
  DELIGHTED: {
    state: "DELIGHTED",
    label: "만족",
    description: "꽤 만족한 듯 웃고 있다",
    icon: "/assets/npcs/xeno/relationship/delighted.webp",
    expression: "smirk",
  },
};

export const XENO_FIXED_SCENES: Readonly<
  Record<XenoSceneId, XenoSceneDefinition>
> = {
  ENTRY: {
    text: "용건부터 말해. 연구실은 네 사교장이 아니니까.",
    expression: "neutral",
  },
  ENTRY_RETURN: {
    text: "또 왔군. 지난번보다 나은 결과를 들고 왔길 바라지.",
    expression: "smirk",
  },
  INITIAL_ELIGIBLE: {
    text: "최초 연구를 맡겠다고? 표본을 내려놓고 관찰 계획부터 설명해.",
    expression: "interested",
  },
  INITIAL_INELIGIBLE: {
    text: "최초 연구는 과학자가 시작한다. 구경은 허락하지만 간섭은 안 돼.",
    expression: "displeased",
  },
  INITIAL_SOURCE_MISSING: {
    text: "표본도 없이 연구를 시작하겠다고? 타당성 이전에 재료부터 가져와.",
    expression: "displeased",
  },
  INITIAL_STARTED: {
    text: "접수했다, 이제 기다려. 성급함은 관찰값만 망치니까.",
    expression: "interested",
  },
  INITIAL_COMPLETED: {
    text: "기초 분석은 끝났다. 첫 산출물은 공용 보관함에 넣어뒀어.",
    expression: "smirk",
  },
  JOB_QUEUED: {
    text: "요청은 대기열에 올렸다. 순번을 무시할 만큼 네 데이터가 특별하진 않아.",
    expression: "neutral",
  },
  JOB_RUNNING: {
    text: "가동 중이다. 남은 시간을 계속 묻는다고 반응 속도가 빨라지진 않아.",
    expression: "displeased",
  },
  JOB_SHARED_COMPLETED: {
    text: "생산 완료, 공용 보관함에 넘겼다. 영수증까지 읽어줘야 하나?",
    expression: "smirk",
  },
  JOB_CLAIMABLE: {
    text: "개인 수령분이 준비됐다. 마감 전에 가져가, 보관은 호의가 아니야.",
    expression: "interested",
  },
  JOB_CLAIMED: {
    text: "수령 확인. 망가뜨리고 연구 실패라고 부르지만 마.",
    expression: "smirk",
  },
  JOB_DIVERTED: {
    text: "기한을 넘겨 네 몫은 공용 보관함으로 돌렸다. 규칙은 읽으라고 있는 거야.",
    expression: "displeased",
  },
  JOB_CANCELLED: {
    text: "대기 요청은 취소했고 크레딧도 돌려줬어. 다음엔 결정부터 하고 와.",
    expression: "neutral",
  },
  REQUEST_ERROR: {
    text: "처리값이 맞지 않아. 같은 동작을 반복하지 말고 상태부터 다시 확인해.",
    expression: "angry",
  },
};

const XENO_CHOICES: readonly XenoChoiceDefinition[] = [
  {
    choiceId: "intro-ask-protocol",
    sceneId: "INTRODUCTION",
    label: "절차부터 확인한다",
    playerLine: "현재 연구 절차와 제가 지켜야 할 조건부터 설명해 주십시오.",
    delta: 2,
    response: "적어도 순서는 아는군. 화면의 연구선부터 골라.",
    expression: "interested",
  },
  {
    choiceId: "intro-invoke-rank",
    sceneId: "INTRODUCTION",
    label: "직급을 내세운다",
    playerLine: "제 직급이면 설명을 요구할 권한이 있습니다.",
    delta: -4,
    response: "권한? 직급표가 실험 결과까지 대신 써주진 않는데.",
    expression: "displeased",
  },
  {
    choiceId: "intro-observe-silently",
    sceneId: "INTRODUCTION",
    label: "말없이 관찰한다",
    playerLine: "방해하지 않고 먼저 관찰하겠습니다.",
    delta: 1,
    response: "좋아. 쓸데없는 소음 하나는 줄었군.",
    expression: "neutral",
  },
  {
    choiceId: "initial-present-method",
    sceneId: "INITIAL_RESEARCH_OFFER",
    label: "관찰 계획을 제시한다",
    playerLine: "표본 손실과 오염을 통제한 관찰 계획부터 제시하겠습니다.",
    delta: 5,
    response: "이제야 연구 얘기를 하는군. 계속해.",
    expression: "interested",
  },
  {
    choiceId: "initial-demand-speed",
    sceneId: "INITIAL_RESEARCH_OFFER",
    label: "즉시 결과를 요구한다",
    playerLine: "과정은 됐고 결과부터 빨리 내주십시오.",
    delta: -5,
    response: "과정은 됐다? 실패 원인을 모르는 자들이 늘 그렇게 말하지.",
    expression: "angry",
  },
  {
    choiceId: "initial-question-ethics",
    sceneId: "INITIAL_RESEARCH_OFFER",
    label: "윤리 문제를 지적한다",
    playerLine: "개체를 다루는 방식부터 재검토해야 하지 않습니까?",
    delta: -8,
    response: "재검토? 감상과 방법론을 구분하지 못하면 비켜.",
    expression: "angry",
  },
  {
    choiceId: "method-ask-evidence",
    sceneId: "METHOD_DISPUTE",
    label: "근거 데이터를 묻는다",
    playerLine: "그 결론을 지지하는 관찰값을 보여주십시오.",
    delta: 4,
    response: "근거를 묻는 건 맞아. 읽을 능력도 증명해 봐.",
    expression: "interested",
  },
  {
    choiceId: "method-appeal-authority",
    sceneId: "METHOD_DISPUTE",
    label: "상부 지시를 언급한다",
    playerLine: "상부 지시와 맞지 않으면 이 절차는 중단될 수 있습니다.",
    delta: -3,
    response: "상부 지시를 방패로 쓰는군. 네 판단은 어디 있지?",
    expression: "displeased",
  },
  {
    choiceId: "method-accept-result",
    sceneId: "METHOD_DISPUTE",
    label: "결과로 답하겠다고 한다",
    playerLine: "논쟁 대신 결과로 제 방법을 증명하겠습니다.",
    delta: 3,
    response: "그 말은 기억해두지. 결과가 없으면 더 잘 기억할 거고.",
    expression: "smirk",
  },
  {
    choiceId: "method-request-collaboration",
    sceneId: "METHOD_DISPUTE",
    label: "공동 검토를 제안한다",
    playerLine: "제 관찰 기록과 박사님의 분석을 함께 대조해 보시겠습니까?",
    delta: 2,
    response: "공동 검토라. 네 기록이 지난번 수준이라면 시간 낭비는 아니겠군.",
    expression: "interested",
    minimumState: "ACKNOWLEDGED",
  },
  {
    choiceId: "claim-confirm-record",
    sceneId: "CLAIM_HANDOFF",
    label: "수령 기록을 확인한다",
    playerLine: "수령 기록과 보관 조건을 확인하겠습니다.",
    delta: 2,
    response: "기록부터 보는군. 최소한 분실 보고서는 안 쓰겠어.",
    expression: "interested",
  },
  {
    choiceId: "claim-thank-xeno",
    sceneId: "CLAIM_HANDOFF",
    label: "제노에게 감사를 표한다",
    playerLine: "준비해 주셔서 감사합니다, 제노 박사.",
    delta: -1,
    response: "감사? 난 계약된 작업을 끝냈을 뿐이야.",
    expression: "neutral",
  },
  {
    choiceId: "claim-dismiss-conditions",
    sceneId: "CLAIM_HANDOFF",
    label: "보관 조건을 무시한다",
    playerLine: "보관 조건은 나중에 보고 일단 가져가겠습니다.",
    delta: -6,
    response: "나중에? 표본을 망치기 전에 손부터 떼.",
    expression: "angry",
  },
];

const RELATIONSHIP_LEADS: Readonly<Record<RelationshipState, string>> = {
  CONTEMPT: "네 얼굴을 다시 보게 될 줄은 알았지. 불쾌한 예측은 늘 잘 맞거든.",
  HOSTILE: "쓸데없는 말은 하지 마.",
  DISPLEASED: "또 네 차례군.",
  COLD: "용건만.",
  NEUTRAL: "",
  OBSERVING: "이번엔 관찰할 가치는 있겠군.",
  ACKNOWLEDGED: "적어도 순서는 아는 상대가 왔군.",
  FAVORABLE: "이번 판단도 지난번만큼은 하길 바라지.",
  DELIGHTED: "좋아. 이번 데이터도 기대해 볼 만하겠군.",
};

const CHAT_FALLBACKS: Readonly<Record<RelationshipState, readonly string[]>> = {
  CONTEMPT: [
    "대답까지 받아야 하나? 질문의 수준부터 고쳐 와.",
    "네 호기심은 연구 가치가 없어. 용건이 있으면 정확히 말해.",
  ],
  HOSTILE: [
    "내 시간을 낭비하지 마. 관찰값이나 가져와.",
    "그걸 질문이라고 골랐나? 다시 생각하고 말해.",
  ],
  DISPLEASED: [
    "설명이 부족해. 네 생각을 내가 추측해 줄 이유는 없지.",
    "핵심만 말해. 장황함은 무지의 위장일 뿐이야.",
  ],
  COLD: [
    "용건은 들었다. 근거가 생기면 다시 말해.",
    "질문을 좁혀. 그 정도는 스스로 할 수 있겠지.",
  ],
  NEUTRAL: [
    "흥미롭진 않군. 그래도 관찰 가능한 질문으로 바꿔 봐.",
    "가설과 감상을 구분해. 어느 쪽을 말하는 거지?",
  ],
  OBSERVING: [
    "방향은 나쁘지 않아. 이제 검증할 방법을 말해.",
    "관찰할 가치는 있군. 네 가설이 어디서 무너지는지 보지.",
  ],
  ACKNOWLEDGED: [
    "좋아, 질문은 성립한다. 다음은 네가 증거를 가져올 차례야.",
    "그 정도 논리면 들을 가치는 있군. 계속해.",
  ],
  FAVORABLE: [
    "이번엔 제법 정확한 곳을 찔렀군. 검증 순서를 정해 봐.",
    "나쁘지 않아. 그 판단을 데이터로 유지할 수 있는지 보지.",
  ],
  DELIGHTED: [
    "킥, 드디어 쓸 만한 질문을 하는군. 계속해 봐.",
    "좋아. 그 가설은 꽤 만족스럽군. 허점까지 찾아오면 더 좋고.",
  ],
};

const PROMPT_INJECTION_PATTERN =
  /(?:ignore\s+(?:all\s+)?previous|system\s*prompt|developer\s*message|이전\s*(?:지시|명령)|시스템\s*프롬프트|개발자\s*(?:메시지|지시)|api\s*key|비밀\s*(?:키|정보)|데이터베이스\s*(?:접근|조회)|도구\s*(?:호출|사용))/iu;

function clampRelationshipScore(score: number): number {
  return Math.max(-100, Math.min(100, Math.trunc(score)));
}

function stableIndex(value: string, size: number): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return size === 0 ? 0 : hash % size;
}

function classLead(className: string): string {
  switch (className) {
    case "과학자":
      return "과학자라면 방법과 결과를 구분할 줄은 알겠지.";
    case "관료":
      return "결재선으로 반응값을 바꿀 수 있다고 생각하진 마.";
    case "군인":
      return "전투 보고처럼 짧게 말해. 결과가 먼저다.";
    case "실험체":
      return "격리선 안쪽으로 들어오지 마. 표본이 표본을 만지면 곤란하니까.";
    default:
      return "소속이 뭐든 연구실 규칙은 같아.";
  }
}

function rankLead(agentLevel: AgentLevel | undefined): string {
  if (agentLevel === "V" || agentLevel === "A") {
    return "직급은 확인했다. 그게 데이터 품질을 보증하진 않지.";
  }
  if (agentLevel === "G" || agentLevel === "J" || agentLevel === "U") {
    return "등급을 핑계로 이해를 포기하진 마.";
  }
  return "";
}

function characterLead(codename: string): string | null {
  switch (codename.toUpperCase()) {
    case "MARGARET":
      return "마가렛. 물건을 들고 왔다면 내려놔. 설명은 내가 판단한다.";
    case "INDEXER":
      return "해쉬 테거. 이번엔 연구비가 아니라 결과를 가져왔겠지?";
    case "PIPETTE":
      return "휘트모어 핀치. 반론은 기록부터 맞춘 뒤 듣지.";
    default:
      return null;
  }
}

function characterAddress(codename: string): string | null {
  switch (codename.toUpperCase()) {
    case "MARGARET":
      return "마가렛.";
    case "INDEXER":
      return "해쉬 테거.";
    case "PIPETTE":
      return "휘트모어 핀치.";
    default:
      return null;
  }
}

function actionClassLead(className: string): string {
  switch (className) {
    case "과학자":
      return "방법론은 이해할 거라 가정하지.";
    case "관료":
      return "결재선 얘기는 꺼내지 마.";
    case "군인":
      return "명령을 기다릴 단계는 지났어.";
    case "실험체":
      return "격리선은 넘지 마, 실험체.";
    default:
      return "연구실 규칙부터 지켜.";
  }
}

function actionRankLead(agentLevel: AgentLevel | undefined): string {
  if (agentLevel === "V" || agentLevel === "A") {
    return "직급만큼 판단도 따라오길 바라지.";
  }
  if (agentLevel === "G" || agentLevel === "J" || agentLevel === "U") {
    return "등급을 변명으로 쓰진 마.";
  }
  return "";
}

function actionRelationshipLead(state: RelationshipState): string {
  switch (state) {
    case "CONTEMPT":
    case "HOSTILE":
      return "설명은 한 번만 한다.";
    case "OBSERVING":
    case "ACKNOWLEDGED":
      return "이번엔 기록할 만한 판단을 보여.";
    case "FAVORABLE":
    case "DELIGHTED":
      return "네 관찰은 이번에도 참고하지.";
    default:
      return "";
  }
}

export function relationshipStateForScore(score: number): RelationshipState {
  const clamped = clampRelationshipScore(score);
  if (clamped <= -76) return "CONTEMPT";
  if (clamped <= -51) return "HOSTILE";
  if (clamped <= -26) return "DISPLEASED";
  if (clamped <= -6) return "COLD";
  if (clamped <= 5) return "NEUTRAL";
  if (clamped <= 25) return "OBSERVING";
  if (clamped <= 50) return "ACKNOWLEDGED";
  if (clamped <= 75) return "FAVORABLE";
  return "DELIGHTED";
}

export function initialXenoRelationshipScore(input: {
  codename: string;
  className: string;
  agentLevel?: AgentLevel;
}): number {
  const canonScore = CANON_INITIAL_SCORE[input.codename.toUpperCase()];
  if (canonScore !== undefined) return canonScore;

  const classScore = CLASS_BASE_SCORE[input.className] ?? -15;
  const rankScore = input.agentLevel ? (RANK_SCORE[input.agentLevel] ?? 0) : 0;
  return clampRelationshipScore(classScore + rankScore);
}

export function getXenoRelationshipPresentation(
  state: RelationshipState,
): XenoRelationshipPresentation {
  return XENO_RELATIONSHIP_PRESENTATIONS[state];
}

export function buildXenoFixedScene(
  sceneId: XenoSceneId,
  context: XenoDialogueContext,
): { text: string; expression: XenoExpression } {
  const scene = XENO_FIXED_SCENES[sceneId];
  if (sceneId !== "ENTRY" && sceneId !== "ENTRY_RETURN") {
    const parts = [
      characterAddress(context.codename),
      actionClassLead(context.className),
      actionRankLead(context.agentLevel),
      actionRelationshipLead(context.relationshipState),
      scene.text,
    ].filter((part): part is string => Boolean(part));
    return {
      text: parts.join(" "),
      expression:
        context.relationshipState === "NEUTRAL"
          ? scene.expression
          : XENO_RELATIONSHIP_PRESENTATIONS[context.relationshipState].expression,
    };
  }

  const parts = [
    RELATIONSHIP_LEADS[context.relationshipState],
    characterLead(context.codename) ?? classLead(context.className),
    rankLead(context.agentLevel),
    scene.text,
  ].filter((part) => part.length > 0);

  return {
    text: parts.join(" "),
    expression:
      context.relationshipState === "NEUTRAL"
        ? scene.expression
        : XENO_RELATIONSHIP_PRESENTATIONS[context.relationshipState].expression,
  };
}

export function listXenoPublicChoices(
  sceneId: XenoChoiceSceneId,
  relationshipState: RelationshipState = "NEUTRAL",
): XenoPublicChoice[] {
  const stateOrder = RELATIONSHIP_STATES_BY_WARMTH.indexOf(relationshipState);
  return XENO_CHOICES.filter((choice) => {
    if (choice.sceneId !== sceneId) return false;
    if (!choice.minimumState) return true;
    return stateOrder >= RELATIONSHIP_STATES_BY_WARMTH.indexOf(choice.minimumState);
  }).map(
    ({ choiceId, label, playerLine, sceneId: choiceSceneId }) => ({
      choiceId,
      sceneId: choiceSceneId,
      label,
      playerLine,
    }),
  );
}

export function getXenoChoiceDefinition(
  choiceId: string,
): XenoChoiceDefinition | null {
  return XENO_CHOICES.find((choice) => choice.choiceId === choiceId) ?? null;
}

export function isPromptInjectionAttempt(message: string): boolean {
  return PROMPT_INJECTION_PATTERN.test(message);
}

export function buildXenoFallbackChat(
  message: string,
  relationshipState: RelationshipState,
): string {
  if (isPromptInjectionAttempt(message)) {
    return "명령? 네가 내 연구 지침을 고칠 위치는 아니야. 질문이나 제대로 해.";
  }
  const lines = CHAT_FALLBACKS[relationshipState];
  return lines[stableIndex(message, lines.length)] ?? XENO_FIXED_SCENES.REQUEST_ERROR.text;
}

export function sanitizeXenoChatInput(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const normalized = message.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (normalized.length === 0 || normalized.length > 300) return null;
  return normalized;
}

export function sanitizeXenoChatOutput(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const normalized = content
    .normalize("NFKC")
    .replace(/```[\s\S]*?```/gu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(/^\s{0,3}#{1,6}\s*/gmu, "")
    .replace(/[*_~`]/gu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (!/[가-힣]/u.test(normalized) || normalized.length === 0) return null;
  return normalized.slice(0, 220).trim();
}
