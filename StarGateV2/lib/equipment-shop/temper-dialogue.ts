export type TemperMood =
  | "welcome"
  | "inspect"
  | "balance"
  | "cart"
  | "checkout"
  | "blocked"
  | "idle";

export type TemperCharacterProfile =
  | "assault"
  | "guard"
  | "endurance"
  | "focus"
  | "balanced";

type TemperCatalogItem = {
  key: string;
  name: string;
  category: "WEAPON" | "ARMOR" | "CONSUMABLE" | "SPECIAL";
  available: boolean;
};

type TemperTab = "ALL" | "WEAPON" | "ARMOR" | "CONSUMABLE" | "LICENSE";

type TemperItemDialogue = {
  mood: Extract<TemperMood, "inspect" | "balance">;
  inspect: readonly string[];
  cart: readonly string[];
};

export const TEMPER_DIALOGUE_LINES = {
  welcome:
    "어서 와. 무기부터 보지 말고 손부터 보여줘. 네 손이 뭘 버틸 수 있는지 먼저 봐야 하니까.",
  noAgent:
    "주 사용자가 지정되지 않았네. 손도 자세도 모르는 사람한테 무기를 맞춰 줄 수는 없어.",
  closed:
    "오늘 작업대는 닫았어. 식은 쇠를 두드려 봐야 금만 늘어나니까 다음 점검 때 와.",
  unavailable:
    "그건 지금 작업대에 못 올려. 빈 재고보다 상태가 나쁜 물건을 내보내는 게 더 위험해.",
  gmOnly:
    "구경은 괜찮아. 하지만 반출은 실제 사용자가 와야 해. 무기는 서류보다 손에 맞춰야 하거든.",
  qualification:
    "훈련 기록이 없는 장비는 못 내줘. 날이 손보다 빠른 사람은 파단 기록벽보다 의무실에 먼저 남거든.",
  insufficient:
    "크레딧보다 장비를 먼저 골랐네. 가격표 다시 보고 와. 외상은 금속보다 빨리 휘어.",
  checkout:
    "반출 검수 끝. 첫 사용 뒤에는 날과 손목을 둘 다 확인해. 망가지는 쪽은 늘 먼저 신호를 보내니까.",
  checkoutError:
    "반출 기록이 막혔네. 잔액, 재고, 승인선 중 하나가 어긋났어. 억지로 밀면 장부도 금속도 부러져.",
} as const;

export const TEMPER_MOOD_LABELS: Record<TemperMood, string> = {
  welcome: "작업대 개방",
  inspect: "구조 판독",
  balance: "균형 조정",
  cart: "반출 준비",
  checkout: "검수 완료",
  blocked: "반출 거부",
  idle: "단조 중",
};

export const TEMPER_IDLE_LINES: readonly {
  mood: TemperMood;
  text: string;
}[] = [
  {
    mood: "idle",
    text: "날은 다시 세우면 돼. 중심이 틀어진 건 다시 태어나야 하고.",
  },
  {
    mood: "inspect",
    text: "금속은 거짓말 안 해. 금이 간 자리만 보면 사용자가 어디서 무리했는지 다 나오거든.",
  },
  {
    mood: "balance",
    text: "무게가 가볍다고 다루기 쉬운 건 아니야. 중심이 손에서 멀어지면 숫자보다 훨씬 무거워져.",
  },
  {
    mood: "idle",
    text: "파단 기록벽에 이름을 남기고 싶지 않으면, 반납할 때 어떻게 썼는지부터 제대로 말해.",
  },
  {
    mood: "inspect",
    text: "불꽃만 보고 멋있다고 하지 마. 좋은 단조는 불이 꺼진 뒤에 드러나는 법이야.",
  },
  {
    mood: "balance",
    text: "비싼 무기가 널 살리는 게 아니야. 끝까지 네 손에 남아 있는 무기가 살리는 거지.",
  },
] as const;

const TEMPER_PROFILE_LINES: Record<
  TemperCharacterProfile,
  readonly string[]
> = {
  assault: [
    "손이 먼저 나가는 타입이네. 무게중심이 앞으로 쏠리지 않는 걸로 보자.",
    "힘은 충분해 보여. 이제 휘두른 뒤에 멈출 수 있는 무기를 골라야지.",
  ],
  guard: [
    "버티는 데 익숙한 몸이네. 충격을 받아낼지 흘려낼지부터 정하자.",
    "방호 자세가 몸에 배었어. 손을 묶지 않으면서 중심을 지킬 장비가 맞겠네.",
  ],
  endurance: [
    "오래 버티는 타입이군. 첫 타격보다 열 번째 타격에서 균형이 남는 걸로 보자.",
    "지구력은 좋아 보여. 손잡이 마찰과 관절 피로를 먼저 맞춰 줄게.",
  ],
  focus: [
    "눈이 손보다 먼저 움직이네. 정밀한 날과 짧은 회수 동작이 잘 맞겠어.",
    "서두르지 않는 타입이군. 무게보다 궤적을 읽을 수 있는 걸 골라 봐.",
  ],
  balanced: [
    "치우친 습관은 안 보이네. 임무와 자세에 맞춰 중심부터 잡자.",
    "균형은 괜찮아. 무엇을 더할지보다 끝까지 쥘 수 있는지를 먼저 보자.",
  ],
};

const TEMPER_ITEM_DIALOGUE: Record<string, TemperItemDialogue> = {
  "basic-assault-shield": {
    mood: "balance",
    inspect: [
      "공격 방패라. 막는 판에 타격면까지 얹었네. 손목 각도가 틀리면 적보다 팔꿈치를 먼저 부숴.",
      "방패로 때릴 생각이면 팔힘보다 발부터 봐. 중심을 못 받치면 네가 먼저 밀려나니까.",
    ],
    cart: [
      "타격면과 손잡이 체결 확인했어. 방패로 밀기 전에 발부터 고정해.",
      "공격 방패 올린다. 막는 동작과 치는 동작 사이에 손목을 세우지 마.",
    ],
  },
  "old-tactical-sword-titanium-shield": {
    mood: "balance",
    inspect: [
      "구식이라고 얕보지 마. 도검과 방패를 한 몸처럼 못 쓰면 무게가 두 배로 돌아와.",
      "검과 방패를 같이 들면 어느 손이 먼저 움직일지 정해 둬. 둘 다 욕심내면 둘 다 늦어.",
    ],
    cart: [
      "도검 날과 방패 체결부 모두 확인했어. 두 장비의 간격을 흐트러뜨리지 마.",
      "구식 전술 세트 올린다. 오래된 규격일수록 기본 자세를 더 정확히 지켜.",
    ],
  },
  "basic-dagger": {
    mood: "inspect",
    inspect: [
      "단검은 짧아서 정직해. 거리를 잘못 잡으면 칼보다 네 손이 먼저 들어가.",
      "작은 날일수록 손버릇이 그대로 보여. 역수로 잡기 전에 손목부터 풀어.",
    ],
    cart: [
      "단검 칼집 잠금 확인했어. 허리에 달기 전에 뽑는 방향부터 정해.",
      "단검 한 자루 올린다. 작다고 주머니에 함부로 넣지는 마.",
    ],
  },
  "basic-katana": {
    mood: "balance",
    inspect: [
      "카타나는 날보다 궤적이 중요해. 베겠다고 힘주면 날이 먼저 비틀려.",
      "칼끝만 보지 마. 손잡이에서 시작한 움직임이 끝까지 이어져야 제대로 베어.",
    ],
    cart: [
      "날과 칼집 간격 맞췄어. 뽑는 동작에서 손가락 잃지 않게 조심해.",
      "카타나 균형 잡아서 올린다. 첫 사용 뒤에는 날 휨부터 확인해.",
    ],
  },
  "basic-longsword": {
    mood: "balance",
    inspect: [
      "롱소드는 양손으로 잡아도 판단은 하나여야 해. 중심 놓치면 칼이 널 휘두른다.",
      "긴 칼은 사거리만 늘리는 게 아니야. 실수할 공간도 같이 늘어나지.",
    ],
    cart: [
      "롱소드 중심점 표시해 뒀어. 장갑 낀 손으로도 같은 자리를 잡아.",
      "장검 한 자루 반출대에 올린다. 좁은 복도에서는 길이부터 기억해.",
    ],
  },
  "basic-blunt-weapon": {
    mood: "inspect",
    inspect: [
      "둔기는 날을 세울 필요가 없지. 대신 어디까지 부수면 되는지는 알아야 해.",
      "무게만 믿고 휘두르면 어깨부터 망가져. 충격은 목표에 남기고 반동은 흘려.",
    ],
    cart: [
      "타격면 균열 없고 손잡이 고정도 끝났어. 이제 부술 곳만 제대로 골라.",
      "둔기 올린다. 무게는 충분하니 힘까지 과하게 보태지 마.",
    ],
  },
  "basic-chainsaw": {
    mood: "inspect",
    inspect: [
      "그건 무기라 부르기 전에 시동 절차부터 외워. 멈추는 법은 그보다 먼저고.",
      "전기톱은 날보다 구동부가 먼저 배신해. 소리가 달라지면 바로 손 떼.",
    ],
    cart: [
      "체인 장력과 비상 정지 확인했어. 다섯 번 쓰면 욕심내지 말고 다시 시동 걸어.",
      "전기톱 반출 준비 끝. 연료보다 비상 정지 손잡이 위치부터 외워.",
    ],
  },
};

function stableLine(lines: readonly string[], seed: string): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  return lines[index % lines.length] ?? lines[0] ?? "";
}

export function buildTemperWelcomeLine(args: {
  codename: string | null;
  profile: TemperCharacterProfile;
}): string {
  if (!args.codename) return TEMPER_DIALOGUE_LINES.welcome;
  const profileLine = stableLine(
    TEMPER_PROFILE_LINES[args.profile],
    `${args.codename}:${args.profile}:TEMPER`,
  );
  return `${args.codename}, 손부터 보여줘. ${profileLine}`;
}

export function buildTemperItemLine(
  item: TemperCatalogItem,
): { mood: TemperMood; text: string } {
  if (!item.available) {
    return { mood: "blocked", text: TEMPER_DIALOGUE_LINES.unavailable };
  }

  const dialogue = TEMPER_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return {
      mood: dialogue.mood,
      text: stableLine(dialogue.inspect, `${item.key}:inspect:TEMPER`),
    };
  }

  if (item.category === "ARMOR") {
    return {
      mood: "balance",
      text: `${item.name}. 막는 장비는 무게보다 충격이 빠져나갈 길을 먼저 봐야 해.`,
    };
  }

  return {
    mood: "inspect",
    text: `${item.name}. 이름보다 손잡이, 중심, 파손 지점부터 확인하자.`,
  };
}

export function buildTemperCartLine(item: TemperCatalogItem): string {
  const dialogue = TEMPER_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return stableLine(dialogue.cart, `${item.key}:cart:TEMPER`);
  }
  return `${item.name} 반출대에 올렸어. 봉인 전에 손에 맞는지 마지막으로 확인해.`;
}

export function buildTemperTabLine(tab: TemperTab): string {
  switch (tab) {
    case "WEAPON":
      return "근접무기 쪽이네. 피해량보다 길이, 중심, 회수 동작을 먼저 봐.";
    case "ARMOR":
      return "방호 장비는 충격을 버티는 물건이 아니라 흘려보내는 물건이야. 관절부터 확인해.";
    case "CONSUMABLE":
      return "소모품은 토와스키 쪽이 더 많아. 여기서는 현장에서 다시 손볼 수 있는 장비를 우선해.";
    default:
      return "전부 훑어봐도 좋아. 하지만 마지막에는 네 손에 맞는 하나만 남겨.";
  }
}
