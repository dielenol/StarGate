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
    "어이구, 주 사용자가 비어 있네? 손도 자세도 모르는데 뭘 맞춰 줘. 손님부터 데려와.",
    "사용자 기록이 없잖아. 장비야 만들 수 있지. 근데 주인 없는 반출까지 해 주면 내가 너무 퍼 주는 거 아니야?",
    "누가 쓸 건지부터 정하고 와. 체격도 버릇도 모른 채 맞추면 명품 사고 하나 나오는 거야, 알지?",
  ],
  closed: [
    "오늘 작업대는 끝. 식은 쇠 두드려 봐야 금만 늘어. 다음 점검 때 오면 제대로 봐 줄게.",
    "화로 온도 내렸어. 급한 건 알겠는데 열처리까지 급하게 하면 현장에서 더 크게 갚아야 해.",
    "반출선까지 봉인했네. 오늘은 장비 말고 작전 계획이나 한 번 더 벼려 와. 그건 공짜잖아?",
  ],
  unavailable: [
    "아, 그건 지금 못 내줘. 빈손으로 보내는 게 미안해도 불량품 들려 보내는 것보단 낫잖아.",
    "재고표엔 있는데 검수대에서 걸렸어. 장부 숫자 백 개보다 균열 하나가 더 솔직하거든.",
    "그건 반출 보류. 못 쓸 물건을 쓸 수 있다고 우기는 건 장사가 아니라 사고 떠넘기기야.",
  ],
  gmOnly: [
    "구경은 얼마든지 해. 근데 반출은 실제로 쓸 사람이 와야지. 서류가 무기를 휘두르진 않잖아?",
    "승인 권한이랑 사용 적합성은 별개야, 손님. 직접 쥘 사람이 없으면 여기서 스톱.",
    "대리 반출은 안 받아. 이 무게를 버틸 손목이 직접 검수대 앞에 와야 서비스도 해 주지.",
  ],
  qualification: [
    "훈련 기록이 없네. 이건 못 내줘. 날이 손보다 빠르면 대장간보다 의무실 단골이 먼저 된다니까?",
    "이 규격 다룬 기록이 부족해. 용기랑 자격은 다른 상품이야. 무기는 그걸 아주 빨리 알려 주고.",
    "반출은 불가합니다. 손목보다 장비의 관성이 빠르니 훈련장에서 순서부터 다시 맞추고 오세요.",
  ],
  insufficient: [
    "장비 고르는 눈은 좋은데 잔액이 조금 아쉽네, 손님. 외상은 금속보다 빨리 휘어서 안 받아.",
    "크레딧이 모자라. 여기서 재료비까지 깎으면 대출혈 서비스가 아니라 진짜 출혈이야.",
    "결제선이 안 맞네. 합금값을 의리로 대신할 순 없잖아? 장부 정리하고 다시 와.",
  ],
  checkoutError: [
    "아이고, 반출 기록이 걸렸네. 잔액이든 재고든 하나가 틀어졌어. 잠깐만, 억지로 밀면 둘 다 부러져.",
    "봉인 직전에 장부가 꼬였어. 미안하지만 원인 잡기 전엔 문밖으로 한 발짝도 못 나가.",
    "반출을 중지하겠습니다. 실패한 절차를 반복하는 건 검수가 아니라 고집이니 장부부터 다시 맞추세요.",
  ],
};

export const TEMPER_DIALOGUE_LINES = {
  welcome:
    "어서 와, 손님. 무기부터 집지 말고 손부터 보여줘. 네 손이 뭘 버틸지 알아야 서비스도 제대로 해 주지.",
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
    text: "날은 다시 세우면 돼. 근데 중심이 틀어졌으면? 그건 다시 태어나야지, 뭐.",
  },
  {
    mood: "inspect",
    text: "금속은 거짓말 안 해. 금 간 자리만 봐도 어디서 무리했는지 다 보여. 손님들은 자꾸 아니래도.",
  },
  {
    mood: "balance",
    text: "가볍다고 다루기 쉬운 건 아니야. 중심이 손에서 멀면 체감 무게가 확 뛰어. 숫자만 보면 손해라니까.",
  },
  {
    mood: "idle",
    text: "파단 기록벽에 이름 올리기 싫으면 반납할 때 솔직히 말해. 어떻게 부쉈는지까지가 사후 서비스야.",
  },
  {
    mood: "inspect",
    text: "불꽃만 보고 멋있다 하지 마. 좋은 단조는 불 꺼진 다음에 보여. 사람 보는 눈이랑 비슷하지?",
  },
  {
    mood: "balance",
    text: "비싼 무기가 살려 주는 게 아니야. 끝까지 손에 남는 무기가 살려 주지. 이건 영업 멘트 아니고 진짜야.",
  },
  {
    mood: "idle",
    text: "두 번 두드렸는데 울림이 다르면 속이 빈 거야. 금속 얘기다? 왜 다들 자기 얘기처럼 들어.",
  },
  {
    mood: "inspect",
    text: "손잡이 닳은 방향 보면 자세가 딱 나와. 사람은 날 속여도 마모는 못 속여, 알지?",
  },
  {
    mood: "balance",
    text: "무게중심은 내가 표시해 줄게. 매번 그 자리를 찾아가는 건 손님 몫. 이 정도면 공평하지?",
  },
  {
    mood: "idle",
    text: "열은 금속을 풀어 주고 냉각은 성질을 남겨. 둘 다 급하게 하면 깨져. 그러니까 재촉은 금지야.",
  },
] as const;

const TEMPER_PROFILE_LINES: Record<
  TemperCharacterProfile,
  readonly string[]
> = {
  assault: [
    "손이 먼저 나가는 타입이네. 좋아, 앞으로 끌려가지 않는 걸로 골라 줄게.",
    "힘은 충분해 보여. 이제 휘두른 다음에 멈출 줄 아는 무기를 고르자. 시작보다 끝이 더 비싸거든.",
    "첫 동작은 빠르네. 자, 회수할 때 자세 안 무너지는 길이부터 맞춰 보자.",
  ],
  guard: [
    "버티는 데 익숙한 몸이네. 받아낼지 흘릴지부터 정하자. 둘 다 하려면 값이 더 올라가고.",
    "방호 자세가 몸에 배었어. 손 안 묶고 중심 지켜 주는 걸로 봐줄게. 서비스 좋지?",
    "충격을 정면으로 받는 버릇이 있네. 관절까지 밀리지 않는 손잡이로 가자. 손목은 재고가 없거든.",
  ],
  endurance: [
    "오래 버티는 타입이네. 첫 타격 말고 열 번째에도 중심 남는 걸로 보자. 그게 진짜 가성비야.",
    "지구력은 좋아 보여. 손잡이 마찰이랑 관절 피로까지 내가 맞춰 줄게.",
    "긴 임무에선 작은 불편이 사람부터 갉아먹어. 오래 쥐어도 덜 억울한 규격으로 보자.",
  ],
  focus: [
    "눈이 손보다 먼저 움직이네. 좋아, 정밀한 날에 회수 짧은 걸로 맞춰 줄게.",
    "서두르지 않는 타입이군. 무게표 말고 궤적이 잘 읽히는 걸 골라 봐. 숫자는 내가 볼 테니까.",
    "손끝이 섬세하네. 반응 빠른 대신 흔들림도 솔직한 장비가 맞겠어. 까다롭지만 재미는 있지.",
  ],
  balanced: [
    "치우친 버릇은 안 보이네. 좋다, 임무랑 자세에 맞춰 중심부터 예쁘게 잡아 보자.",
    "균형은 괜찮아. 뭘 더 붙일지보다 끝까지 쥘 수 있는지 먼저 보자. 덤은 그다음이고.",
    "기본 자세는 안정적이야. 자, 임무에서 제일 많이 할 동작 기준으로 골라 줄게.",
  ],
};

const TEMPER_ITEM_DIALOGUE: Record<string, TemperItemDialogue> = {
  "basic-assault-shield": {
    mood: "balance",
    inspect: [
      "공격 방패네. 막고 때리고 한 번에 다 해 준다니 욕심 좋은 상품이지? 대신 손목 각도 틀리면 팔꿈치부터 나가.",
      "방패로 칠 거면 팔힘보다 발부터 봐봐. 중심 못 받치면 상대 말고 손님이 먼저 날아가.",
      "타격면은 멀쩡한데 손잡이가 살짝 틀어졌네. 자, 팔에 붙여 봐. 힘 새는 건 내가 서비스로 잡아 줄게.",
    ],
    cart: [
      "자, 타격면이랑 손잡이 체결 다 봤어. 방패로 밀기 전에 발부터 고정하는 거 잊지 말고.",
      "공격 방패 반출대에 올린다. 막고 치는 사이에 손목 세우면 내 서비스가 전부 헛수고야.",
      "충격 흡수층까지 꽉 조여 놨어. 첫 훈련 뒤에 체결부가 울면 바로 가져와. 첫 점검은 내가 봐줄게.",
    ],
  },
  "old-tactical-sword-titanium-shield": {
    mood: "balance",
    inspect: [
      "구식이라고 얕보면 섭섭하지. 검이랑 방패를 한 몸처럼 못 쓰면 무게도 두 배, 고생도 두 배야.",
      "검과 방패 같이 들 거면 어느 손이 먼저인지 정해 둬. 둘 다 욕심내면 둘 다 늦어. 세트 상품의 함정이지.",
      "이 규격이 오래 산 건 단순해서야. 대신 자세 틀린 건 장비가 안 숨겨 줘. 아주 정직한 물건이지.",
    ],
    cart: [
      "도검 날이랑 방패 체결부 둘 다 확인했어. 두 장비 간격은 내가 잡아 둔 그대로 써, 알지?",
      "구식 전술 세트 올린다. 오래된 규격은 기본만 지키면 밥값은 확실히 해.",
      "세트 균형 다시 맞췄어. 한쪽만 바꾸면 처음부터 재조율이야. 그땐 서비스라고 못 해준다?",
    ],
  },
  "basic-dagger": {
    mood: "inspect",
    inspect: [
      "단검은 짧아서 아주 정직해. 거리 잘못 잡으면 칼보다 손님 손이 먼저 들어가거든.",
      "작은 날일수록 손버릇이 다 보여. 자, 역수로 잡기 전에 손목부터 풀어 봐.",
      "날이 짧으면 실수도 바로 코앞에서 돌아와. 손가락은 가드 뒤로, 이건 무료 안전 교육이야.",
    ],
    cart: [
      "단검 칼집 잠금 확인했어. 허리에 달기 전에 뽑는 방향부터 정해. 반대로 달고 내 탓 하면 안 돼.",
      "단검 한 자루 올린다. 작고 싸다고 주머니에 막 넣는 손님들이 꼭 있더라. 그러지 마.",
      "칼끝이랑 칼집 입구 정렬해 놨어. 급하게 넣다 손등 긁지 말고, 천천히 써. 알겠지?",
    ],
  },
  "basic-katana": {
    mood: "balance",
    inspect: [
      "카타나는 날보다 궤적이야. 잘 베겠다고 힘부터 주면 날이 먼저 삐쳐서 비틀린다니까.",
      "칼끝만 보지 말고 손잡이부터 봐봐. 여기서 시작한 움직임이 끝까지 이어져야 제값을 해.",
      "이 정도 휨은 정상 서비스 범위야. 억지로 펴지 말고 베는 선을 곧게 써. 그게 더 싸게 먹혀.",
    ],
    cart: [
      "자, 날이랑 칼집 간격 딱 맞췄어. 뽑다가 손가락 잃으면 이 좋은 서비스가 무슨 소용이야.",
      "카타나 균형 잡아서 올린다. 첫 사용 뒤엔 날 휨부터 확인해. 사후 점검도 상품의 일부야.",
      "날각 정리 끝. 단단한 데 걸렸으면 두 번째로 치기 전에 꼭 봐. 한 번 참으면 수리비가 굳어.",
    ],
  },
  "basic-longsword": {
    mood: "balance",
    inspect: [
      "롱소드는 양손으로 잡아도 판단은 하나만 해야 해. 중심 놓치면 손님이 칼을 드는 게 아니라 칼이 손님을 들어.",
      "긴 칼은 사거리만 늘려 주는 게 아니야. 실수할 공간도 넉넉하게 서비스해 주지.",
      "양손 간격이 좁으면 힘이 남고 넓으면 방향이 늦어져. 자, 손님 자세에 맞는 딱 그 지점 찾아보자.",
    ],
    cart: [
      "롱소드 중심점 표시해 뒀어. 장갑 껴도 같은 자리 잡아. 표시값은 따로 안 받는다.",
      "장검 한 자루 반출대에 올린다. 좁은 복도에선 적보다 천장부터 치지 않게 길이 기억하고.",
      "가드랑 손잡이 유격 잡았어. 한 손으로 멋 부릴 생각은 훈련장에 두고 와, 알겠지?",
    ],
  },
  "basic-blunt-weapon": {
    mood: "inspect",
    inspect: [
      "둔기는 날 세울 돈이 안 들어서 좋지. 대신 어디까지 부술지는 손님이 알고 써야 해.",
      "무게만 믿고 휘두르면 목표보다 어깨가 먼저 나가. 충격은 저쪽에 주고 반동은 흘려, 알지?",
      "타격면보다 손잡이 끝을 봐봐. 회수할 때 흔들리면 다음 동작이 전부 할부로 늦어져.",
    ],
    cart: [
      "타격면 균열 없고 손잡이 고정도 끝. 자, 이제 부술 곳만 제대로 고르면 완벽한 상품이야.",
      "둔기 올린다. 무게는 이미 충분하니까 힘까지 풀옵션으로 넣진 마. 어깨가 못 버텨.",
      "완충 그립 새로 감아 줬어. 이건 서비스. 젖으면 미끄러우니 임무 전 장갑이랑 같이 확인해.",
    ],
  },
  "basic-chainsaw": {
    mood: "inspect",
    inspect: [
      "전기톱 좋지. 근데 무기라고 부르기 전에 시동 절차부터 외워. 멈추는 법은 그보다 먼저고.",
      "전기톱은 날보다 구동부가 먼저 배신해. 소리 달라지면 바로 손 떼. 비싼 장비도 경고는 한 번뿐이야.",
      "체인 속도 흔들리면 힘으로 밀지 마. 걸리는 순간부터 상품이 아니라 사고 접수 건이야.",
    ],
    cart: [
      "체인 장력이랑 비상 정지 다 봤어. 다섯 번 쓰면 욕심내지 말고 다시 시동 걸어. 오래 쓰는 비결이야.",
      "전기톱 반출 준비 끝. 연료 위치보다 비상 정지 손잡이부터 외워. 이건 추가금 없는 필수 옵션이고.",
      "구동부 열이랑 체인 오일 확인했어. 이상음 한 번이면 바로 정지. 두 번째는 수리비가 아니라 장례비야.",
    ],
  },
  "basic-standard-ballistic-vest": {
    mood: "inspect",
    inspect: [
      "기본형 방탄복이네. 가격부터 보지 말고 어깨끈부터 봐봐. 몸에서 뜨면 충격이 빈틈으로 파고들어.",
      "이건 한 발 제대로 막고 끝나는 장비야. 아깝다고 두 번 입으면 방탄복이 장례복 된다니까.",
      "가벼운 조끼일수록 체형을 더 타. 자, 숨 한번 쉬어 봐. 가슴판 안 뜨게 내가 맞춰 줄게.",
    ],
    cart: [
      "기본 방탄판이랑 체결부 확인 끝. 첫 피격 뒤엔 미련 두지 말고 바꿔. 목숨에 중고 할인은 없어.",
      "기본형 조끼 조율 끝. 어깨끈 표시선도 서비스로 남겨 놨어. 그 이상 조이면 움직임부터 막혀.",
      "판재 모서리랑 봉제선까지 다 봤어. 돌아오면 맞은 자리 표시해서 가져와. 사후 분석까지 해 줄게.",
    ],
  },
  "basic-intermediate-ballistic-vest": {
    mood: "balance",
    inspect: [
      "중급형은 판이 두꺼워서 중심도 올라가. 팔 들어 봐. 목 누르면 비싼 장비가 아니라 안 맞는 장비야.",
      "RF2급 충격은 막아도 반동까지 무료로 없애 주진 않아. 갈비뼈랑 판 사이 여유부터 보자.",
      "보강판 무게가 앞에 몰렸네. 등판 당겨서 달릴 때 따로 안 놀게 맞춰 줄게. 이게 장인 서비스지.",
    ],
    cart: [
      "중급 방탄판 균형 잡았어. 맞고 나서 숨 쉬어진다고 멀쩡한 거 아니니까 의무실이 먼저야.",
      "어깨랑 옆구리 체결선 표시해 뒀어. 다른 사람이 입으면 처음부터 다시 조율, 추가 서비스는 그때 얘기하고.",
      "판재 유격이랑 봉제부 확인 끝. 충격 자국은 닦지 말고 가져와. 증거를 왜 지워, 손님.",
    ],
  },
  "basic-advanced-ballistic-vest": {
    mood: "balance",
    inspect: [
      "고급형 찾는 임무면 위험도 계산은 끝났겠지? 그럼 난 손님이 이 무게로 움직일 수 있는지만 볼게.",
      "RF3급 판재는 단단해도 사람은 아니야. 몸통 지키겠다고 목이랑 관절 내주면 비싼 돈 쓰고 손해야.",
      "두꺼운 판은 안심 팔기 딱 좋지. 근데 난 안심 말고 체결 각도랑 파단 방향까지 묶어서 팔아.",
    ],
    cart: [
      "고급 방호구 최종 검수 끝. 한 발 막았으면 임무보다 교체가 먼저야. 비싸다고 아끼지 마.",
      "목 가동 범위랑 어깨 간섭까지 맞췄어. 이 정도면 풀서비스지? 자세 무너지면 바로 돌아와.",
      "고위험 규격으로 봉인한다. 피격 위치랑 자세 기록해 와. 다음 판 더 좋게 만드는 값까지 이미 받은 거야.",
    ],
  },
};

const TEMPER_ARMOR_REFERRAL_LINES = [
  "토와스키 그놈은 바가지가 심해. 이윤 남겨 먹을 건 꼭 붙인다니까? 여기서 보급받아 가. 그놈보다 10%는 싸게 줄 테니까. 이거 우리 수고비도 안 나오는 거야, 알지?",
  "토와스키 열람표 들고 왔네? 잘했어. 그놈 가격에는 말값이 너무 많이 붙어. 난 딱 10% 빼 줄게. 대신 어디 가서 공짜 장사했다고 소문은 내 주고.",
  "쇳덩이 성직자한테 보고 왔다고? 거긴 물건보다 설명이 더 비싸. 여기선 10% 깎고 치수까지 맞춰 줄게. 이 정도면 단골 해야 하는 거 알지?",
] as const;

const TEMPER_REFERRAL_CART_LINES = [
  "자, 가격도 10% 싸고 유격 부분도 내가 손봐 줄게. 이 정도면 진짜 대출혈 서비스인 거 알지?",
  "토와스키 기록이랑 치수는 맞네. 10% 깎고 판재 유격도 다시 잡아 줄게. 가격만 깎는 데랑은 급이 다르다니까.",
  "자, 할인 확인했고 체결부까지 내가 봐 준다. 조율비도 못 건지는 판인데 손님이 잘 써 주면 그걸로 된 거지, 뭐.",
] as const;

const TEMPER_WEAPON_CHECKOUT_LINES = [
  "오케이, 여기 있습니다 손님. 날이랑 중심, 체결부까지 다 봤어. 첫 사용 뒤엔 장비도 손목도 같이 확인해.",
  "자, 중심 표시하고 봉인까지 끝. 파손되면 닦지 말고 그대로 가져와. 사후 분석도 우리 서비스거든.",
  "반출 승인. 잘 쓰고, 이상하면 바로 들고 와. 억지로 한 번 더 쓰는 순간 수리비가 새 장비값 된다니까.",
] as const;

const TEMPER_ARMOR_CHECKOUT_LINES = [
  "오케이, 여기 있습니다 손님. 판재랑 체결부 다 체크했고 치수도 맞췄어. 맞고 나면 방호구보다 몸부터 확인해.",
  "자, 몸에 맞춘 위치까지 표시해 뒀어. 다른 사람이 입거나 끈 다시 조이면 서비스 무효, 처음부터 재검수야.",
  "반출 승인. 충격 자국은 닦지 말고 그대로 가져와. 내가 어느 방향으로 힘 빠졌는지까지 봐 줄게.",
] as const;

const TEMPER_POWER_TOOL_CHECKOUT_LINES = [
  "오케이, 구동부랑 비상 정지까지 다 봤어. 소리 한 번 달라지면 바로 손 떼. 두 번째 경고는 유료야.",
  "체인 장력, 열, 오일 전부 정상. 멈추는 절차만 안 잊으면 아주 가성비 좋은 사고 방지 상품이지.",
  "반출 승인. 힘으로 밀지 말고 회전수가 일하게 둬. 걸리면 정지부터, 수리비 걱정은 그다음이야.",
] as const;

const TEMPER_REFERRAL_CHECKOUT_LINES = [
  "오케이, 여기 있습니다 손님. 검수 항목 다 체크했고 치수 맞게 조정도 했어. 이게 매번 수리도 못 하게 박살 나서 돌아오더라고? 넌 좀 조심히 써, 알겠지?",
  "자, 10% 할인에 판재 검수, 유격 조정까지 전부 끝. 토와스키한텐 비밀로 해. 알면 또 말값 붙여 받을 테니까.",
  "연계 반출 완료. 가격은 깎았지만 검수는 풀코스야. 그러니까 이번엔 수리도 못 하게 박살 내서 가져오지 마, 손님.",
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
      text: `${item.name}. 자, 가격보다 충격이 빠져나갈 길부터 보자. 막기만 하는 방어구는 반쪽짜리 상품이야.`,
    };
  }

  return {
    mood: "inspect",
    text: `${item.name}. 이름은 거창한데 물건은 봐야 알지. 손잡이, 중심, 파손 지점부터 확인해 줄게.`,
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
  return `${item.name} 반출대에 올렸어. 봉인 전에 손에 맞는지 마지막으로 봐줄게. 이게 장인 서비스지.`;
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
    "전부 둘러봐, 손님. 구경은 공짜야. 대신 마지막엔 네 손에 맞는 하나만 제대로 골라.",
    "진열 순서는 신경 쓰지 마. 쥐었을 때 중심이 어디 남는지만 봐. 가격표는 내가 설명해 줄게.",
    "종류 많아 보여도 기준은 셋이야. 길이, 중심, 놓치지 않는 손. 나머지는 옵션이지.",
  ],
  WEAPON: [
    "근접무기 보러 왔네. 피해량 숫자보다 길이, 중심, 회수 동작부터 봐. 그게 진짜 상품 설명이야.",
    "날이랑 타격면만 보지 마. 빗나간 뒤 자세 잡는 시간까지가 성능이야. 광고에는 잘 안 쓰지만.",
    "손에 쥐는 장비는 숫자보다 버릇을 먼저 타. 제일 자주 할 동작부터 말해 봐. 내가 골라 줄게.",
  ],
  ARMOR: [
    "방호 장비는 충격을 버티는 게 아니라 흘려보내는 물건이야. 자, 관절부터 확인해 보자.",
    "두껍다고 무조건 좋은 상품은 아니야. 움직임 막으면 충격보다 먼저 손님을 늦춘다니까.",
    "방호구는 멀쩡한 척해도 체결부부터 늙어. 버클이랑 관절까지 봐주는 데가 진짜 장인이지.",
  ],
  CONSUMABLE: [
    "소모품은 토와스키 그놈 창고가 더 커. 여긴 현장에서 다시 손볼 수 있는 물건을 우선해.",
    "한 번 쓰고 버릴 물건보다 계속 살아남을 도구를 만드는 게 내 일이야. 장사엔 손해여도 말이지.",
    "소모품 목록은 짧아. 대신 장비 오래 쓰게 해 주는 정비재는 챙겨 줄게. 그런 게 진짜 서비스야.",
  ],
  LICENSE: [
    "허가증이 금속을 강하게 해 주진 않아. 반출선 필요하면 토와스키 장부부터 보고 와. 거긴 종이도 비싸지만.",
    "여긴 서류보다 파단 기록을 봐. 면허 장사는 건샵 카운터로 가고, 제대로 맞추는 건 다시 나한테 와.",
    "자격은 장부가 확인하고 장비는 내가 확인해. 둘 다 필요하지만 같은 값어치는 아니지, 알지?",
  ],
};

export function buildTemperTabLine(tab: TemperTab, variant = 0): string {
  return cycleLine(TEMPER_TAB_LINES[tab], variant);
}
