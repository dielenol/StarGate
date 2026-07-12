export type SutureMood =
  | "welcome"
  | "assessment"
  | "protocol"
  | "funding"
  | "procedure"
  | "recovery"
  | "blocked"
  | "idle";

export type SutureCharacterProfile =
  | "assault"
  | "guard"
  | "endurance"
  | "focus"
  | "balanced";

export type SutureBlockReason =
  | "noAgent"
  | "start"
  | "contribution"
  | "rush"
  | "complete";

type SutureResearchScope = "personal" | "team";
type SutureResearchEffect = {
  kind: string;
  stat?: "hp" | "san" | "atk" | "def";
};

const SUTURE_BLOCKED_LINES: Record<SutureBlockReason, readonly string[]> = {
  noAgent: [
    "오늘은 누구 몸을 볼 건가요? 이름도 신체 기록도 없으면 여기선 아무것도 시작하지 않아요.",
    "대상자가 비어 있네요. 기록 없는 몸에 손대는 취미는 없습니다. 먼저 주 AGENT부터 지정해 주세요.",
    "멈추세요. 환자도 없는데 시술부터 고를 순 없어요. 누가 받을 건지 정하고 다시 오세요.",
  ],
  start: [
    "아직은 안 돼요. 돈보다 먼저 선행 연구와 몸 상태가 맞아야 합니다. 하나씩 다시 보죠.",
    "승인은 보류할게요. 준비가 덜 된 몸에 일정을 맞추는 건 시술이 아니라 사고예요.",
    "여기서 멈춥니다. 빠진 조건을 찾고 다시 오세요. 이미 쓴 시간은 사람을 다치게 할 이유가 못 됩니다.",
  ],
  contribution: [
    "금액이 장부와 맞지 않네요. 서두르지 말고 대상자와 남은 액수부터 다시 확인해 주세요.",
    "이 기여는 받을 수 없어요. 재원은 다시 모을 수 있지만 잘못 묶인 연구 대상은 되돌리기 어렵습니다.",
    "잠깐만요. 숫자 하나가 어긋났어요. 돈이 움직이기 전에 제가 먼저 잡겠습니다.",
  ],
  rush: [
    "여기서 더 줄이면 회복 시간을 빚지는 겁니다. 그 빚은 몸이 갚아요. 안 됩니다.",
    "일정은 더 당기지 않겠습니다. 빨리 끝나는 것과 무사히 끝나는 건 다른 일이에요.",
    "그만 줄이죠. 관찰할 시간이 사라지면 이상 반응은 없어지는 게 아니라 늦게 발견됩니다.",
  ],
  complete: [
    "잠깐, 적용 기록이 잠겼어요. 같은 효과를 몸에 두 번 쓰는 실수는 안 합니다. 제가 먼저 풀어볼게요.",
    "지금은 적용하지 않겠습니다. 완료 시각과 대상 기록이 맞지 않아요. 몸보다 장부를 먼저 고치죠.",
    "여기서 멈추세요. 적용선이 꼬였습니다. 원인을 찾기 전에는 누구에게도 손대지 않아요.",
  ],
};

export const SUTURE_DIALOGUE_LINES = {
  welcome:
    "이레나예요. 앉으세요. 뭘 더 달기 전에, 지금 몸이 어디서 버티고 있는지부터 볼게요.",
  noAgent: SUTURE_BLOCKED_LINES.noAgent[0],
  personalScope:
    "당신 몸에 맞추는 연구예요. 남이 멀쩡했다고 당신도 괜찮다는 뜻은 아니니, 불편하면 바로 말해요.",
  teamScope:
    "모두가 같은 방식으로 살아 돌아오게 만드는 쪽이에요. 가장 강한 한 명 말고, 가장 지친 한 명까지 버틸 규격을 보죠.",
  startError: SUTURE_BLOCKED_LINES.start[0],
  contributionError: SUTURE_BLOCKED_LINES.contribution[0],
  rushError: SUTURE_BLOCKED_LINES.rush[0],
  completeError: SUTURE_BLOCKED_LINES.complete[0],
} as const;

export const SUTURE_MOOD_LABELS: Record<SutureMood, string> = {
  welcome: "초진 접수",
  assessment: "적합성 판독",
  protocol: "프로토콜 검토",
  funding: "연구 재원 확인",
  procedure: "시술 준비",
  recovery: "회복 관찰",
  blocked: "승인 보류",
  idle: "생체신호 대기",
};

export const SUTURE_DEBUG_LINES: Record<SutureMood, string> = {
  welcome: SUTURE_DIALOGUE_LINES.welcome,
  assessment:
    "손을 펴보세요. 네, 천천히. 수치보다 손끝 감각이 따라오는 속도를 먼저 볼게요.",
  protocol:
    "좋아질 것만 말하면 설명이 아니죠. 잃을 수 있는 감각과 멈춰야 할 순간부터 짚겠습니다.",
  funding:
    "재료는 살 수 있어요. 그렇다고 몸의 동의까지 산 건 아닙니다. 그 둘은 따로 보죠.",
  procedure:
    "마지막으로 묻겠습니다. 계속할까요? 멈추고 싶다면 지금 말해도 되고, 도중에 말해도 됩니다.",
  recovery:
    "숫자는 나중에 봐도 돼요. 손끝이 낯설거나 통증 위치가 달라졌으면 그걸 먼저 말해 주세요.",
  blocked:
    "안 됩니다. 이유는 숨기지 않고 설명할게요. 하지만 설명이 끝나도 오늘 승인은 나지 않습니다.",
  idle:
    "왼팔이 오늘 조금 시끄럽네요. 걱정 마세요. 이런 날을 구분하려고 접속부를 드러내 둔 겁니다.",
};

export const SUTURE_IDLE_LINES: readonly {
  mood: SutureMood;
  text: string;
}[] = [
  {
    mood: "idle",
    text: "기다리는 동안 손가락을 한 번씩 움직여 보세요. '괜찮다' 말고, 아까와 다른 게 있는지만 알려줘요.",
  },
  {
    mood: "assessment",
    text: "통증이 사라진 시각을 기억해 두세요. 안 아픈 게 회복이라면 제 왼팔은 진작 완치됐겠죠.",
  },
  {
    mood: "protocol",
    text: "출력을 올리는 건 어렵지 않아요. 그 힘이 필요 없을 때 멈추게 만드는 쪽이 늘 더 어렵습니다.",
  },
  {
    mood: "recovery",
    text: "시술이 끝나면 몸이 새 부품과 협상을 시작해요. 우리는 그 협상이 조용히 끝나는지 지켜보는 거고요.",
  },
  {
    mood: "idle",
    text: "접속부를 왜 덮지 않냐고요? 금이 갔으면 예뻐 보이는 것보다 빨리 들키는 편이 낫잖아요.",
  },
  {
    mood: "funding",
    text: "크레딧은 재료를 삽니다. 적합성과 동의까지 사는 건 아니에요. 가끔 그걸 헷갈리는 분이 있죠.",
  },
  {
    mood: "assessment",
    text: "환상통은 없는 팔이 아픈 게 아니에요. 뇌가 아직 몸의 지도를 고치지 못한 겁니다. 새 감각도 비슷해요.",
  },
  {
    mood: "idle",
    text: "제 팔 소리가 거슬리면 말해 주세요. 작은 잡음은 고장보다 먼저 오는 친절한 경고니까요.",
  },
] as const;

const SUTURE_PROFILE_LINES: Record<
  SutureCharacterProfile,
  readonly string[]
> = {
  assault: [
    "힘은 충분해 보여요. 더 올리기 전에, 그 힘을 멈출 때 손이 떨리는지부터 보죠.",
    "앞으로 나가는 반응이 빠르네요. 관절보다 신경이 먼저 지치지 않는지 확인할게요.",
    "출력 욕심은 이해해요. 다만 돌아온 뒤에도 컵을 놓치지 않는 손이어야 합니다.",
  ],
  guard: [
    "잘 버티는 몸이네요. 그래서 손상을 늦게 알아차릴 수 있어요. 안쪽부터 볼게요.",
    "충격을 참는 버릇이 보입니다. 견디는 것과 다치지 않는 건 다르니, 아프면 숨기지 마세요.",
    "방호는 충분해 보여도 감각이 둔해지면 위험해요. 어디까지 느끼는지부터 맞춰보죠.",
  ],
  endurance: [
    "오래 버티는 편이군요. 이상 반응도 늦게 올 수 있으니 관찰 시간은 더 길게 잡겠습니다.",
    "지구력이 좋다고 회복까지 빠른 건 아니에요. 피로가 쌓이는 순서부터 보죠.",
    "오래 움직이는 몸일수록 작은 감각 지연이 크게 남습니다. 손끝부터 천천히 확인할게요.",
  ],
  focus: [
    "새 감각을 받아들이기엔 유리해 보여요. 그래도 그 감각이 정말 자기 것처럼 느껴지는지는 따로 봐야 합니다.",
    "침착하군요. 좋아요. 눈을 감아도 어느 손가락을 건드렸는지 맞힐 수 있는지부터 해보죠.",
    "정신이 안정적이어도 낯선 감각은 기억을 흔들 수 있어요. 불쾌하면 바로 말해 주세요.",
  ],
  balanced: [
    "크게 치우친 곳은 없네요. 무엇을 더할지보다, 지금 잘 되는 걸 무엇까지 지킬지 먼저 정하죠.",
    "균형은 좋아요. 임무에서 자주 다치는 곳과 오래 쓰는 동작부터 들려주세요.",
    "수치만 보면 무난하군요. 이제 기록에 안 남는 버릇을 볼 차례예요. 평소처럼 손을 움직여 보세요.",
  ],
};

function stableLine(lines: readonly string[], seed: string): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  return lines[index % lines.length] ?? lines[0] ?? "";
}

function cycleLine(lines: readonly string[], variant: number): string {
  return lines[Math.abs(Math.trunc(variant)) % lines.length] ?? lines[0] ?? "";
}

function describeSutureConcern(effect: SutureResearchEffect | null): string {
  if (!effect) return "효과가 비어 있네요. 이 상태로는 누구에게도 적용하지 않아요.";
  if (effect.kind === "stat") {
    switch (effect.stat) {
      case "hp":
        return "버티는 힘보다 회복 반응이 제대로 따라오는지 먼저 볼게요.";
      case "san":
        return "새 감각이 기억을 밀어내지 않는지 천천히 확인하죠.";
      case "atk":
        return "힘을 올린 만큼 멈추는 신호도 또렷해야 합니다.";
      case "def":
        return "충격을 못 느끼는 것과 충격을 견디는 건 다른 일이에요.";
    }
  }
  if (
    effect.kind === "refund" ||
    effect.kind === "research_cost_discount" ||
    effect.kind === "credit_bonus"
  ) {
    return "비용이 줄어도 검사 항목은 하나도 줄이지 않습니다.";
  }
  if (
    effect.kind === "research_time_discount" ||
    effect.kind === "rush_discount"
  ) {
    return "시간을 아끼더라도 몸이 대답할 시간까지 빼앗진 않을 겁니다.";
  }
  if (effect.kind === "point") {
    return "가능성이 늘어난 만큼 무엇을 더하지 않을지도 같이 정해야 해요.";
  }
  return "쓸 수 있다는 것과 안전하게 쓸 수 있다는 건 따로 확인하겠습니다.";
}

export function buildSutureBlockedLine(
  reason: SutureBlockReason,
  variant = 0,
): string {
  return cycleLine(SUTURE_BLOCKED_LINES[reason], variant);
}

export function buildSutureWelcomeLine(args: {
  codename: string | null;
  profile: SutureCharacterProfile;
}): string {
  if (!args.codename) return SUTURE_DIALOGUE_LINES.welcome;
  const profileLine = stableLine(
    SUTURE_PROFILE_LINES[args.profile],
    `${args.codename}:${args.profile}:SUTURE`,
  );
  return `${args.codename}, 왔군요. ${profileLine}`;
}

export function buildSutureScopeLine(scope: SutureResearchScope): string {
  return scope === "personal"
    ? SUTURE_DIALOGUE_LINES.personalScope
    : SUTURE_DIALOGUE_LINES.teamScope;
}

export function buildSutureNodeLine(
  args: {
    nodeName: string;
    scope: SutureResearchScope;
    effect: SutureResearchEffect | null;
    effectText: string;
  },
): string {
  const scopeLine =
    args.scope === "personal"
      ? "당신 몸에 맞춰 볼게요."
      : "팀 전원에게 같은 결과가 나와야 해요.";
  return `${args.nodeName}. ${args.effectText}가 목표네요. ${scopeLine} ${describeSutureConcern(args.effect)}`;
}

export function buildSutureResearchStartedLine(nodeName: string): string {
  return `${nodeName}, 접수했어요. 오늘부터 '아픈 것'보다 '평소와 다른 것'을 적어 오세요. 작은 변화가 먼저 옵니다.`;
}

export function buildSutureContributionLine(args: {
  projectKey: string;
  chargedAmount: string;
  started: boolean;
}): string {
  return args.started
    ? `${args.projectKey}, 필요한 재원은 모였네요. 좋아요. 이제 돈 얘기는 끝내고, 모두에게 같은 결과가 나오는지 보죠.`
    : `${args.chargedAmount}, 기록했어요. 다만 돈이 빨리 모인다고 사람을 빨리 눕히진 않을 겁니다.`;
}

export function buildSutureRushLine(duration: string): string {
  return `${duration} 당겼습니다. 대신 관찰 간격은 좁힐게요. 이상하면 일정이 아니라 시술부터 멈춥니다.`;
}

export function buildSutureRecoveryLine(projectKey: string): string {
  return `${projectKey}, 적용됐어요. 바로 힘주지 말고 손끝부터 움직여 보세요. 낯선 감각이 들면 참지 말고 돌아오고요.`;
}
