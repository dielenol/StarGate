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

export type TemperBlockReason =
  | "noAgent"
  | "closed"
  | "unavailable"
  | "gmOnly"
  | "qualification"
  | "insufficient"
  | "checkoutError";

type TemperCatalogItem = {
  key: string;
  name: string;
  category: "WEAPON" | "ARMOR" | "CONSUMABLE" | "SPECIAL";
  available: boolean;
  discount?: {
    type: "towaski-armor-referral";
    percent: number;
    amount: number;
  };
};

type TemperTab = "ALL" | "WEAPON" | "ARMOR" | "CONSUMABLE" | "LICENSE";

type TemperItemDialogue = {
  mood: Extract<TemperMood, "inspect" | "balance">;
  inspect: readonly string[];
  cart: readonly string[];
};

const TEMPER_BLOCKED_LINES: Record<TemperBlockReason, readonly string[]> = {
  noAgent: [
    "주 사용자가 지정되지 않았네. 손도 자세도 모르는 사람한테 무기를 맞춰 줄 수는 없어.",
    "사용자 기록이 비어 있어. 이름 없는 장비는 만들 수 있어도, 주인 없는 반출은 승인 못 해.",
    "누가 쓸지부터 정하고 와. 체격도 습관도 모른 채 맞춘 장비는 잘 만든 사고일 뿐이야.",
  ],
  closed: [
    "오늘 작업대는 닫았어. 식은 쇠를 두드려 봐야 금만 늘어나니까 다음 점검 때 와.",
    "화로 온도 내렸어. 급하다고 열처리 순서를 건너뛰면 현장에서 대가를 치러.",
    "반출선까지 봉인했다. 오늘은 장비보다 네 계획을 다시 벼려 오는 편이 낫겠네.",
  ],
  unavailable: [
    "그건 지금 작업대에 못 올려. 빈 재고보다 상태가 나쁜 물건을 내보내는 게 더 위험해.",
    "재고표에는 있어도 검수대는 통과 못 했어. 숫자보다 균열 하나가 더 정확한 답이지.",
    "반출 보류. 쓸 수 없는 장비를 쓸 수 있다고 말하는 건 판매가 아니라 사고 은폐야.",
  ],
  gmOnly: [
    "구경은 괜찮아. 하지만 반출은 실제 사용자가 와야 해. 무기는 서류보다 손에 맞춰야 하거든.",
    "승인 권한과 사용 적합성은 다른 문제야. 실제로 쥘 사람이 없으면 여기서 멈춘다.",
    "대리 반출은 안 받아. 이 무게를 감당할 손목이 직접 검수대 앞에 서야 해.",
  ],
  qualification: [
    "훈련 기록이 없는 장비는 못 내줘. 날이 손보다 빠른 사람은 파단 기록벽보다 의무실에 먼저 남거든.",
    "이 규격을 다룬 기록이 부족해. 용기는 자격이 아니고, 무기는 그 차이를 아주 빨리 증명해.",
    "반출은 불가합니다. 손목보다 장비의 관성이 더 빠르니, 훈련장에서 순서부터 다시 맞추고 오세요.",
  ],
  insufficient: [
    "크레딧보다 장비를 먼저 골랐네. 가격표 다시 보고 와. 외상은 금속보다 빨리 휘어.",
    "잔액이 모자라. 재료비를 깎으면 가장 먼저 줄어드는 건 네가 믿을 수 있는 시간이고.",
    "결제선이 안 맞아. 값싼 약속으로 합금값을 대신할 수는 없으니 장부부터 정리해.",
  ],
  checkoutError: [
    "반출 기록이 막혔네. 잔액, 재고, 승인선 중 하나가 어긋났어. 억지로 밀면 장부도 금속도 부러져.",
    "봉인 직전에 기록이 틀어졌어. 원인을 찾기 전에는 한 발짝도 밖으로 못 나가.",
    "반출을 중지하겠습니다. 실패한 절차를 반복하는 건 검수가 아니라 고집이니, 장부부터 다시 맞추세요.",
  ],
};

export const TEMPER_DIALOGUE_LINES = {
  welcome:
    "어서 와. 무기부터 보지 말고 손부터 보여줘. 네 손이 뭘 버틸 수 있는지 먼저 봐야 하니까.",
  noAgent: TEMPER_BLOCKED_LINES.noAgent[0],
  closed: TEMPER_BLOCKED_LINES.closed[0],
  unavailable: TEMPER_BLOCKED_LINES.unavailable[0],
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
  {
    mood: "idle",
    text: "두 번 두드렸을 때 울림이 다르면 속에 빈 곳이 있다는 뜻이야. 사람도 크게 다르진 않고.",
  },
  {
    mood: "inspect",
    text: "손잡이의 닳은 방향을 보면 자세가 보여. 장비를 속이는 사람은 있어도 마모를 속이진 못해.",
  },
  {
    mood: "balance",
    text: "무게중심은 표시해 줄 수 있어. 그 자리를 매번 찾아가는 건 네 몫이고.",
  },
  {
    mood: "idle",
    text: "열은 금속을 부드럽게 만들고, 냉각은 성질을 남겨. 어느 쪽도 급하게 하면 깨져.",
  },
] as const;

const TEMPER_PROFILE_LINES: Record<
  TemperCharacterProfile,
  readonly string[]
> = {
  assault: [
    "손이 먼저 나가는 타입이네. 무게중심이 앞으로 쏠리지 않는 걸로 보자.",
    "힘은 충분해 보여. 이제 휘두른 뒤에 멈출 수 있는 무기를 골라야지.",
    "첫 동작은 빠르네. 회수할 때 자세가 무너지지 않는 길이부터 맞춰 보자.",
  ],
  guard: [
    "버티는 데 익숙한 몸이네. 충격을 받아낼지 흘려낼지부터 정하자.",
    "방호 자세가 몸에 배었어. 손을 묶지 않으면서 중심을 지킬 장비가 맞겠네.",
    "충격을 정면으로 받는 습관이 있어. 관절까지 밀리지 않는 손잡이를 찾아야겠군.",
  ],
  endurance: [
    "오래 버티는 타입이군. 첫 타격보다 열 번째 타격에서 균형이 남는 걸로 보자.",
    "지구력은 좋아 보여. 손잡이 마찰과 관절 피로를 먼저 맞춰 줄게.",
    "긴 임무에선 작은 불편이 먼저 사람을 망가뜨려. 쥔 채로 오래 버틸 규격을 보자.",
  ],
  focus: [
    "눈이 손보다 먼저 움직이네. 정밀한 날과 짧은 회수 동작이 잘 맞겠어.",
    "서두르지 않는 타입이군. 무게보다 궤적을 읽을 수 있는 걸 골라 봐.",
    "손끝이 섬세하네. 반응이 빠른 대신 흔들림까지 그대로 전하는 장비가 맞겠어.",
  ],
  balanced: [
    "치우친 습관은 안 보이네. 임무와 자세에 맞춰 중심부터 잡자.",
    "균형은 괜찮아. 무엇을 더할지보다 끝까지 쥘 수 있는지를 먼저 보자.",
    "기본 자세는 안정적이야. 이제 임무에서 가장 자주 반복할 동작을 기준으로 고르자.",
  ],
};

const TEMPER_ITEM_DIALOGUE: Record<string, TemperItemDialogue> = {
  "basic-assault-shield": {
    mood: "balance",
    inspect: [
      "공격 방패라. 막는 판에 타격면까지 얹었네. 손목 각도가 틀리면 적보다 팔꿈치를 먼저 부숴.",
      "방패로 때릴 생각이면 팔힘보다 발부터 봐. 중심을 못 받치면 네가 먼저 밀려나니까.",
      "타격면은 멀쩡해도 손잡이가 틀어지면 힘이 옆으로 샌다. 팔에 붙여서 중심부터 느껴 봐.",
    ],
    cart: [
      "타격면과 손잡이 체결 확인했어. 방패로 밀기 전에 발부터 고정해.",
      "공격 방패 올린다. 막는 동작과 치는 동작 사이에 손목을 세우지 마.",
      "충격 흡수층까지 조였어. 첫 훈련 뒤 체결부가 울면 바로 가져와.",
    ],
  },
  "old-tactical-sword-titanium-shield": {
    mood: "balance",
    inspect: [
      "구식이라고 얕보지 마. 도검과 방패를 한 몸처럼 못 쓰면 무게가 두 배로 돌아와.",
      "검과 방패를 같이 들면 어느 손이 먼저 움직일지 정해 둬. 둘 다 욕심내면 둘 다 늦어.",
      "이 규격은 단순해서 오래 살아남았어. 대신 자세가 틀리면 장비가 대신 숨겨 주지 않지.",
    ],
    cart: [
      "도검 날과 방패 체결부 모두 확인했어. 두 장비의 간격을 흐트러뜨리지 마.",
      "구식 전술 세트 올린다. 오래된 규격일수록 기본 자세를 더 정확히 지켜.",
      "세트 균형 다시 맞췄어. 한쪽만 교체하면 중심도 처음부터 다시 봐야 해.",
    ],
  },
  "basic-dagger": {
    mood: "inspect",
    inspect: [
      "단검은 짧아서 정직해. 거리를 잘못 잡으면 칼보다 네 손이 먼저 들어가.",
      "작은 날일수록 손버릇이 그대로 보여. 역수로 잡기 전에 손목부터 풀어.",
      "날이 짧으면 실수도 가까이서 돌아와. 손가락이 가드 앞으로 나가지 않게 잡아.",
    ],
    cart: [
      "단검 칼집 잠금 확인했어. 허리에 달기 전에 뽑는 방향부터 정해.",
      "단검 한 자루 올린다. 작다고 주머니에 함부로 넣지는 마.",
      "칼끝과 칼집 입구 정렬했어. 급하게 넣다가 손등 긁는 일은 없게 해.",
    ],
  },
  "basic-katana": {
    mood: "balance",
    inspect: [
      "카타나는 날보다 궤적이 중요해. 베겠다고 힘주면 날이 먼저 비틀려.",
      "칼끝만 보지 마. 손잡이에서 시작한 움직임이 끝까지 이어져야 제대로 베어.",
      "날의 휨은 정상 범위야. 억지로 곧게 만들려 하지 말고 베는 선을 곧게 써.",
    ],
    cart: [
      "날과 칼집 간격 맞췄어. 뽑는 동작에서 손가락 잃지 않게 조심해.",
      "카타나 균형 잡아서 올린다. 첫 사용 뒤에는 날 휨부터 확인해.",
      "날각 정리 끝. 단단한 표적에 걸렸으면 두 번째 타격 전에 반드시 확인해.",
    ],
  },
  "basic-longsword": {
    mood: "balance",
    inspect: [
      "롱소드는 양손으로 잡아도 판단은 하나여야 해. 중심 놓치면 칼이 널 휘두른다.",
      "긴 칼은 사거리만 늘리는 게 아니야. 실수할 공간도 같이 늘어나지.",
      "양손 간격이 좁으면 힘이 남고, 넓으면 방향이 늦어져. 네 자세에 맞는 지점을 찾아.",
    ],
    cart: [
      "롱소드 중심점 표시해 뒀어. 장갑 낀 손으로도 같은 자리를 잡아.",
      "장검 한 자루 반출대에 올린다. 좁은 복도에서는 길이부터 기억해.",
      "가드와 손잡이 유격 잡았어. 한 손으로 버틸 생각은 훈련장에 두고 와.",
    ],
  },
  "basic-blunt-weapon": {
    mood: "inspect",
    inspect: [
      "둔기는 날을 세울 필요가 없지. 대신 어디까지 부수면 되는지는 알아야 해.",
      "무게만 믿고 휘두르면 어깨부터 망가져. 충격은 목표에 남기고 반동은 흘려.",
      "타격면보다 손잡이 끝을 봐. 회수할 때 흔들리면 다음 동작이 전부 늦어진다.",
    ],
    cart: [
      "타격면 균열 없고 손잡이 고정도 끝났어. 이제 부술 곳만 제대로 골라.",
      "둔기 올린다. 무게는 충분하니 힘까지 과하게 보태지 마.",
      "완충 그립 새로 감았어. 젖으면 미끄러우니 임무 전 장갑과 같이 확인해.",
    ],
  },
  "basic-chainsaw": {
    mood: "inspect",
    inspect: [
      "그건 무기라 부르기 전에 시동 절차부터 외워. 멈추는 법은 그보다 먼저고.",
      "전기톱은 날보다 구동부가 먼저 배신해. 소리가 달라지면 바로 손 떼.",
      "체인 속도가 흔들리면 힘으로 밀지 마. 걸린 순간부터는 무기가 아니라 사고야.",
    ],
    cart: [
      "체인 장력과 비상 정지 확인했어. 다섯 번 쓰면 욕심내지 말고 다시 시동 걸어.",
      "전기톱 반출 준비 끝. 연료보다 비상 정지 손잡이 위치부터 외워.",
      "구동부 열과 체인 오일 확인했어. 이상음 한 번이면 바로 정지, 두 번은 없어.",
    ],
  },
  "basic-standard-ballistic-vest": {
    mood: "inspect",
    inspect: [
      "기본형 방탄복이네. 판재보다 먼저 어깨끈을 봐. 몸에서 뜨면 충격이 빈틈으로 파고들어.",
      "한 발 막고 끝나는 장비야. 아깝다고 두 번째 피격까지 입고 있으면 장례복이 된다.",
      "가벼운 조끼일수록 체형 차이가 크게 나. 가슴판이 뜨지 않게 숨 쉬는 자세부터 맞춰 봐.",
    ],
    cart: [
      "기본 방탄판과 체결부 확인했어. 첫 피격 뒤에는 미련 두지 말고 바로 폐기해.",
      "기본형 조끼 조율 끝. 어깨끈에 표시한 선을 넘겨 조이면 움직임부터 막힌다.",
      "판재 모서리와 봉제선까지 봤어. 돌아오면 어디를 맞았는지 표시해서 가져와.",
    ],
  },
  "basic-intermediate-ballistic-vest": {
    mood: "balance",
    inspect: [
      "중급형은 판이 두꺼워진 만큼 중심이 올라가. 팔을 들었을 때 목을 누르면 규격이 안 맞는 거야.",
      "RF2급 충격은 막아도 반동까지 사라지는 건 아니야. 갈비뼈와 판 사이 여유를 먼저 보자.",
      "보강판 무게가 앞에 몰렸네. 등판을 당겨서 달릴 때 조끼가 따로 놀지 않게 맞춰야 해.",
    ],
    cart: [
      "중급 방탄판 균형 잡았어. 피격 뒤 숨이 쉬어진다고 멀쩡한 건 아니니 의무실부터 가.",
      "어깨와 옆구리 체결선 표시했다. 다른 사람이 입으면 처음부터 다시 조율해야 해.",
      "판재 유격과 봉제부 확인 끝. 충격 자국은 닦지 말고 그대로 가져와.",
    ],
  },
  "basic-advanced-ballistic-vest": {
    mood: "balance",
    inspect: [
      "고급형을 찾는 임무면 이미 위험도 계산은 끝났겠지. 그럼 난 네가 이 무게로 움직일 수 있는지만 본다.",
      "RF3급 판재는 단단하지만 사람은 아니야. 몸통을 지키겠다고 목과 관절을 내주면 계산이 틀려.",
      "두꺼운 판은 안심을 팔기 좋아. 난 안심 말고 체결 각도와 파단 방향을 팔아.",
    ],
    cart: [
      "고급 방호구 최종 검수 끝. 한 발 막았으면 임무보다 교체가 먼저야.",
      "목 가동 범위와 어깨 간섭까지 맞췄어. 무게 때문에 자세가 무너지면 바로 돌아와.",
      "고위험 규격으로 봉인한다. 피격 위치와 자세를 기록해 와야 다음 판을 더 낫게 만든다.",
    ],
  },
};

const TEMPER_ARMOR_REFERRAL_LINES = [
  "탄약 장사꾼 쪽에서 규격은 보고 왔네. 같은 치수를 두 번 잴 필요는 없으니 조율비는 10% 빼 줄게. 안전 검수는 그대로고.",
  "토와스키가 열람표에 네 이름을 남겼군. 그 사람 말은 깎아 들어도 치수 기록은 쓸 만해. 중복 측정비는 덜어낸다.",
  "쇳덩이 성직자한테 왔다고 전했나 보네. 좋아, 연계 할인은 넣어 줄게. 대신 판재와 체결부 검사는 한 줄도 안 줄여.",
] as const;

const TEMPER_REFERRAL_CART_LINES = [
  "열람 연계 확인했어. 중복 측정값은 빼고, 안전 검수는 전부 다시 했다. 10% 조율 할인으로 반출대에 올린다.",
  "토와스키 기록과 내 측정값이 맞아. 가격은 줄였지만 검수 항목은 안 줄였어. 이제 네 몸에 맞춰 봉인한다.",
  "탄약 장사꾼 표식 확인. 조율비 10%는 덜었고, 판재 유격은 내가 다시 잡았어. 할인과 대충은 다른 말이니까.",
] as const;

const TEMPER_WEAPON_CHECKOUT_LINES = [
  "반출 검수 끝. 첫 사용 뒤에는 날과 손목을 둘 다 확인해. 망가지는 쪽은 늘 먼저 신호를 보내니까.",
  "중심 표시와 봉인 기록 끝냈어. 파손되면 닦지 말고 그대로 가져와. 흔적이 다음 장비를 살린다.",
  "반출 승인. 장비가 널 살렸다면 기록을 남기고, 못 살렸다면 더 정확히 남겨. 둘 다 다음 단조에 필요해.",
] as const;

const TEMPER_ARMOR_CHECKOUT_LINES = [
  "체결과 판재 검수 끝. 첫 피격 뒤에는 겉보다 몸부터 확인하고, 방호구는 바로 회수해.",
  "몸에 맞춘 위치를 표시했어. 다른 사람이 입거나 끈을 다시 조이면 처음부터 재검수다.",
  "반출 승인. 충격 자국은 닦지 말고 그대로 가져와. 어느 방향으로 힘이 빠졌는지 봐야 하니까.",
] as const;

const TEMPER_POWER_TOOL_CHECKOUT_LINES = [
  "구동부와 비상 정지까지 확인했어. 소리가 한 번 달라지면 즉시 손 떼. 두 번째 경고는 없어.",
  "체인 장력, 열, 오일 전부 정상. 멈추는 절차를 잊는 순간부터 이건 무기가 아니라 사고야.",
  "반출 승인. 힘으로 밀지 말고 회전수가 일을 하게 둬. 걸리면 정지부터, 판단은 그다음이야.",
] as const;

const TEMPER_REFERRAL_CHECKOUT_LINES = [
  "토와스키 열람 기록까지 반영했어. 조율비는 덜었지만 판재와 체결 검수는 전부 마쳤다.",
  "중복 측정값은 빼고 네 몸에 맞춘 위치만 다시 잡았어. 할인받은 건 절차지, 안전이 아니야.",
  "연계 반출 승인. 가격은 10% 줄었고 검수 항목은 하나도 안 줄었어. 그 차이는 기억해 둬.",
] as const;

function stableLine(lines: readonly string[], seed: string): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  return lines[index % lines.length] ?? lines[0] ?? "";
}

function cycleLine(lines: readonly string[], variant: number): string {
  const index = Math.abs(Math.trunc(variant)) % lines.length;
  return lines[index] ?? lines[0] ?? "";
}

export function buildTemperBlockedLine(
  reason: TemperBlockReason,
  variant = 0,
): string {
  return cycleLine(TEMPER_BLOCKED_LINES[reason], variant);
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
  variant = 0,
): { mood: TemperMood; text: string } {
  if (!item.available) {
    return {
      mood: "blocked",
      text: buildTemperBlockedLine("unavailable", variant),
    };
  }

  const dialogue = TEMPER_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return {
      mood: dialogue.mood,
      text: cycleLine(dialogue.inspect, variant),
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

export function buildTemperCartLine(
  item: TemperCatalogItem,
  variant = 0,
): string {
  if (item.discount?.type === "towaski-armor-referral") {
    return cycleLine(TEMPER_REFERRAL_CART_LINES, variant);
  }
  const dialogue = TEMPER_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return cycleLine(dialogue.cart, variant);
  }
  return `${item.name} 반출대에 올렸어. 봉인 전에 손에 맞는지 마지막으로 확인해.`;
}

export function buildTemperArmorReferralLine(
  item: Pick<TemperCatalogItem, "name">,
  variant = 0,
): string {
  return `${item.name}. ${cycleLine(TEMPER_ARMOR_REFERRAL_LINES, variant)}`;
}

export function buildTemperCheckoutLine(
  item: Pick<TemperCatalogItem, "key" | "name" | "category" | "discount">,
  variant = 0,
): string {
  const lines = item.discount
    ? TEMPER_REFERRAL_CHECKOUT_LINES
    : item.key === "basic-chainsaw"
      ? TEMPER_POWER_TOOL_CHECKOUT_LINES
      : item.category === "ARMOR"
        ? TEMPER_ARMOR_CHECKOUT_LINES
        : TEMPER_WEAPON_CHECKOUT_LINES;
  return `${item.name}. ${cycleLine(lines, variant)}`;
}

const TEMPER_TAB_LINES: Record<TemperTab, readonly string[]> = {
  ALL: [
    "전부 훑어봐도 좋아. 하지만 마지막에는 네 손에 맞는 하나만 남겨.",
    "진열 순서는 중요하지 않아. 쥐었을 때 중심이 어디에 남는지만 기억해.",
    "종류가 많아 보여도 기준은 셋이야. 길이, 중심, 그리고 놓치지 않는 손.",
  ],
  WEAPON: [
    "근접무기 쪽이네. 피해량보다 길이, 중심, 회수 동작을 먼저 봐.",
    "날과 타격면만 보지 마. 빗나간 뒤 다시 자세를 잡는 시간까지가 무기 성능이야.",
    "손에 쥐는 장비는 숫자보다 습관을 먼저 타. 자주 쓰는 동작부터 생각해.",
  ],
  ARMOR: [
    "방호 장비는 충격을 버티는 물건이 아니라 흘려보내는 물건이야. 관절부터 확인해.",
    "두꺼운 장갑이 다 좋은 건 아니야. 움직임을 막으면 충격보다 먼저 널 늦춰.",
    "방호구는 멀쩡해 보여도 체결부부터 늙어. 버클과 관절을 먼저 살펴.",
  ],
  CONSUMABLE: [
    "소모품은 토와스키 쪽이 더 많아. 여기서는 현장에서 다시 손볼 수 있는 장비를 우선해.",
    "한 번 쓰고 버릴 물건보다 계속 살아남을 도구를 만드는 게 내 일이야.",
    "소모품 목록은 짧아. 대신 장비를 오래 쓰게 만드는 정비재는 따로 챙겨 둘게.",
  ],
  LICENSE: [
    "허가증은 금속을 강하게 만들지 않아. 반출선이 필요하면 토와스키 장부부터 확인해.",
    "여기서는 서류보다 파단 기록을 봐. 면허 관련 품목은 건샵 카운터로 가.",
    "자격은 장부가 확인하고, 장비는 내가 확인해. 둘을 같은 일로 생각하지 마.",
  ],
};

export function buildTemperTabLine(tab: TemperTab, variant = 0): string {
  return cycleLine(TEMPER_TAB_LINES[tab], variant);
}
