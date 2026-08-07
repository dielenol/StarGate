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

type StrategicItemDialogue = {
  mood: "inspect" | "systems";
  inspect: readonly [string, string, string];
  dispatch: string;
  checkout: string;
};

export const STRATEGIC_DIALOGUE_LINES = {
  welcome:
    "아, 오셨네요. 요청서 줘 보세요. 몇 명이 타고 얼마나 굴릴지만 알면 금방 좁힐 수 있어요.",
  noAgent:
    "어라, 보급 대상이 비었네요. 누가 쓸지부터 정해 주세요. 장비는 주인 없이 출고 못 해요.",
  closed:
    "오늘 반출선은 닫았어요. 정비 이력과 승인선이 다시 열리면 제가 먼저 봐 드릴게요.",
  gmOnly:
    "기술 검수는 해 드릴 수 있어요. 다만 최종 반출엔 담당관 서명이 필요해서, 열쇠까지 넘겨드리진 못해요.",
  unavailable:
    "아, 그 장비는 아직 정비대에 있어요. 기록이 멀쩡해도 제가 직접 돌려 보기 전엔 못 내보내요.",
  insufficient:
    "예산이 조금 모자라네요. 장비 값에 연료와 회수 비용까지 넣어서 다시 맞춰 볼까요?",
  checkout:
    "출고 승인은 났어요. 승무원과 연료는 채웠죠? 회수 계획이 비었으면 시동 전에 말해 주세요.",
  checkoutError:
    "잠깐, 반출선이 멈췄어요. 제가 원인을 볼 테니 시동은 아직 걸지 마세요.",
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
    text: "차량은 세워 둔다고 쉬는 게 아니에요. 오래 안 굴리면 배터리나 실링부터 삐걱대거든요.",
  },
  {
    mood: "systems",
    text: "표시등이 초록이라고 끝은 아니죠. 비상 정지까지 눌러 봐야 진짜 점검이에요.",
  },
  {
    mood: "inspect",
    text: "카탈로그도 보긴 해요. 그래도 정비 이력이 더 솔직하죠—현장에서 어떻게 굴렀는지가 다 남거든요.",
  },
  {
    mood: "idle",
    text: "가져가는 건 좋은데, 돌아오는 방법도 정했죠? 현장에 두고 오면 결국 제가 데리러 가야 해요.",
  },
  {
    mood: "systems",
    text: "승무원 한 명쯤 비워도 되겠지, 싶죠? 안 돼요. 그 자리에서 맡는 절차가 생각보다 많아요.",
  },
  {
    mood: "inspect",
    text: "새 흠집은 괜찮아요. 어디서 생겼는지만 알려 주세요. 그래야 제대로 고치죠.",
  },
] as const;

const STRATEGIC_PROFILE_LINES: Record<
  StrategicCharacterProfile,
  readonly string[]
> = {
  assault: [
    "화력을 우선하실 거면 승무원과 회수 수단부터 맞춰요. 현장에서 멈추면 큰 장비도 그냥 짐이거든요.",
    "빠르게 밀어붙일 계획인가요? 탄약만큼 퇴로와 재급유 지점도 중요해요.",
  ],
  guard: [
    "방호 자산을 찾으세요? 장갑 수치보다 탈출구와 견인 지점부터 같이 볼게요.",
    "오래 버틸 장비라면 비상 해치 위치부터 익혀 둬야 해요. 나갈 길 없는 장갑은 곤란하니까요.",
  ],
  endurance: [
    "장기 임무용이면 최고 속도는 잠깐 잊죠. 연료와 냉각, 현장 수리 주기부터 계산해 봐요.",
    "오래 굴릴수록 보급 주기가 성능이에요. 예비 부품 상자도 자산 목록에 넣어 주세요.",
  ],
  focus: [
    "정밀 운용을 원하세요? 센서와 통신 계통을 임무 채널에 맞춰 볼게요.",
    "드론이나 표적 장비를 쓸 거라면 탐지 범위보다 데이터 지연부터 확인하죠.",
  ],
  balanced: [
    "임무 환경과 귀환 계획부터 말해 주세요. 그걸로 장비를 좁히면 빨라요.",
    "필요한 화력도 좋지만 끝까지 유지할 수 있는 장비부터 고르죠. 이번 운용 시간은 얼마나 돼요?",
  ],
};

const STRATEGIC_ITEM_DIALOGUE: Record<string, StrategicItemDialogue> = {
  "ch-47-chinook": {
    mood: "systems",
    inspect: [
      "치누크는 조종사 둘과 항공 기관사 한 명, 셋이 있어야 굴러가요. 쉰 명을 태워도 기관사 자리는 비우면 안 돼요.",
      "여덟 시간 상주할 거면 내리는 순서부터 짜죠. 마지막에 탄 사람이 먼저 내릴 수 있게요.",
      "치누크는 화력보다 시간을 벌어 주는 기체예요. 착륙지와 집결·복귀 시각이 맞아야 제값을 해요.",
    ],
    dispatch:
      "조종사 두 명, 항공 기관사 한 명, 후송 명단까지… 아, 됐네요. 운용하지 않는 주에도 정기 점검은 잡아 주세요.",
    checkout:
      "인계 끝났어요. 복귀하면 마지막 착륙 장소부터 알려 주세요—비행 기록보다 기체 상태를 잘 말해 주거든요.",
  },
  "uh-60-black-hawk": {
    mood: "systems",
    inspect: [
      "블랙 호크는 조종사 둘, 도어 거너 둘이 먼저예요. 남는 일곱 자리는 그다음에 채워요.",
      "전투 투입 다섯 라운드, 체류 네 시간, 미사일 세 발이에요. 화력보다 철수 시각부터 맞추죠.",
      "수송과 화력 지원, 둘 다 되긴 해요. 그런데 둘 다 급하면 연료가 먼저 항의하죠—이번엔 뭐가 우선이에요?",
    ],
    dispatch:
      "조종사 둘, 도어 거너 둘, 탑승자 일곱 명에 미사일 세 발. 네 시간 안에 복귀하는 항로 맞죠? 그럼 준비됐어요.",
    checkout:
      "인계 끝났어요. 도어 거너 탄약을 볼 때 연료계도 같이 봐 주세요. 생각보다 빨리 줄어요.",
  },
  "hmmwv-humvee": {
    mood: "inspect",
    inspect: [
      "험비는 네 자리예요. 기관총에 별도 숙련은 없어도 운전수까지 사수로 돌리면 안 돼요—돌아올 사람이 있어야죠.",
      "중거리 기동엔 이만한 게 없죠. 그래도 장갑 믿고 길 한가운데 세우진 마세요. 바퀴 하나 나가면 거기서 끝이에요.",
      "빨리 들어갔다 나올 때 딱 좋아요. 탑승자 네 명의 승하차 순서만 미리 맞춰 두세요. 현장에서 꽤 엉켜요.",
    ],
    dispatch:
      "네 자리 확인했고 중기관총도 멀쩡해요. 운전수는 끝까지 운전수, 맞죠? 그럼 나가도 돼요.",
    checkout:
      "인계 끝났어요. 복귀하면 주행거리와 하부 충격 지점만 알려 주세요. 리프트에 올려 볼게요.",
  },
  "m1-abrams": {
    mood: "inspect",
    inspect: [
      "에이브람스는 전차장, 포수, 조종수, 탄약수 네 자리가 맞물려야 굴러가요. 한 명 겸직이요? 그건 안 돼요. 진짜로요.",
      "포탄 한 발이면 얘기가 끝나죠. 장전 전에 표적과 아군 위치를 다시 봐 주세요. 쏜 뒤엔 제가 고칠 수 없어요.",
      "내구 삼백에 방어 삼십, 든든하죠. 그래도 궤도가 빠지면 못 움직여요. 회수 차량은 배정했나요?",
    ],
    dispatch:
      "승무원 네 명과 포탄 장전 절차, 확인했고요. 견인 계획도 있네요. 기술 점검은 통과예요.",
    checkout:
      "인계 끝났어요. 좁은 길에서는 포탑 방향을 꼭 봐 주세요. 차체는 지나가도 포신이 걸리거든요.",
  },
  "m977-hemtt-military-truck": {
    mood: "inspect",
    inspect: [
      "HEMTT는 열여섯 명이나 대형 화물을 실을 수 있어요. 둘 다 꽉 채우려고요? 잠깐, 그럼 적재 계획부터 다시 봐요.",
      "적재함이 넓어도 그냥 올려 두면 안 돼요. 체결점마다 묶지 않으면 급정거 한 번에 전부 앞으로 쏟아져요.",
      "이 차는 속도보다 보급 순서가 중요해요. 어디서 뭘 먼저 내릴지만 적어 주면 제가 그 순서로 실을게요.",
    ],
    dispatch:
      "인원과 화물 배치 확인했고 체결도 끝났어요. 첫 하역품은 뒤쪽에 뺐으니 현장에서 순서만 바꾸지 마세요.",
    checkout:
      "인계 끝났어요. 적재함이 비어도 천천히 돌아오세요. 빈 차가 노면 충격은 더 세게 받아요.",
  },
  "medical-ambulance": {
    mood: "inspect",
    inspect: [
      "의무품은 이백까지 실려요. 다만 환자 동선을 막는 자리에는 한 상자도 두면 안 돼요. 급할 때 손이 안 닿아요.",
      "중거리 후송까지 가능해요. 환자 분류와 도착지 인계 담당은 정했나요? 없으면 도착해서 더 늦어져요.",
      "방어는 십이에요. 약하진 않아도 총격선에서 버틸 차는 아니죠. 환자를 태우면 바로 빠져 주세요.",
    ],
    dispatch:
      "의무품 이백과 환자 동선 확인했고 후송지 담당자도 있네요. 바로 출발해도 돼요.",
    checkout:
      "인계 끝났어요. 복귀하면 남은 수량보다 부족했던 의무품부터 알려 주세요. 다음엔 앞쪽에 채워 둘게요.",
  },
  "drone-self-destruct-mod": {
    mood: "systems",
    inspect: [
      "정찰 드론에 자폭 장치를 다는 개조예요. 화염 피해는 오십, 그리고 터뜨리는 순간 정찰도 끝. 사용할 시점부터 정해요.",
      "폭약보다 명령 신호 분리가 더 중요해요. 정찰 복귀 옆에 자폭 버튼이 붙어 있으면 언젠가 잘못 누르거든요. 채널은 제가 따로 뺄게요.",
      "드론이 강해진다기보다 마지막 선택지가 하나 생기는 거예요. 그 뒤 정찰은 누가 맡을지도 정해 두죠.",
    ],
    dispatch:
      "정찰과 자폭 명령은 분리했고 안전 거리도 넣었어요. 마지막 영상 저장 위치까지 잡혔네요. 개조 끝.",
    checkout:
      "기술 인계 끝났어요. 사용 뒤에는 성공 여부보다 왜 그 시점에 자폭 신호를 보냈는지 남겨 주세요. 다음 개조에 쓸게요.",
  },
  "missile-guidance-laser": {
    mood: "systems",
    inspect: [
      "레이저를 조사하면 다음 턴에 미사일이 와요. 네 개 라인이 모두 피해 범위라, 아군 대피는 그 전에 끝내야 해요.",
      "이건 한 번 쓰면 끝이에요. 좌표와 아군 동선이 맞는지, 미사일 도착 시각까지 본 다음 스위치를 올려요.",
      "표적이 움직여도 발사된 미사일은 기다려 주지 않아요. 추적 대상이면 이동 경로까지 계산했나요?",
    ],
    dispatch:
      "1회분 봉인과 네 개 라인 경고 채널, 둘 다 멀쩡해요. 아군 이탈 신호를 확인한 뒤 조준을 시작하세요.",
    checkout:
      "인계 끝났어요. 레이저 운용자와 철수 담당자는 같은 지도를 봐야 해요. 좌표가 다르면 정말 큰일 나요.",
  },
  "stealth-cloak": {
    mood: "systems",
    inspect: [
      "광학 보정은 여덟 시간 가요. 안 보인다고 발소리까지 사라지진 않으니 평소보다 조심해서 걸어요.",
      "은신 보정은 오십이에요. 완전히 사라지는 장비가 아니라 들킬 때까지 시간을 버는 쪽이죠. 퇴로는 잡아 뒀나요?",
      "망토에 흠집이 나면 그 자리만 빛이 튀어요. 사용 뒤엔 접지 말고 펼친 채 검수대에 올려 주세요.",
    ],
    dispatch:
      "광학 보정 정상, 여덟 시간 타이머도 들어갔어요. 종료 삼십 분 전에 경고가 뜨면 바로 복귀 준비하세요.",
    checkout:
      "인계 끝났어요. 안 보인다고 혼자 너무 멀리 가진 마세요. 구조팀도 위치를 못 잡으면 찾아갈 수 없어요.",
  },
  "electric-barbed-wire-mod": {
    mood: "inspect",
    inspect: [
      "감전 효과는 한 번만 들어가요. 적이 들어올 길은 막되 아군 퇴로까지 닫진 않았는지 봐 주세요.",
      "성공치는 낮은 편이에요. 그래도 접지와 우회로는 꼭 잡아야 해요. 안 그러면 설치자가 먼저 감전될 수 있어요.",
      "철조망만 펴면 끝은 아니죠. 첫 감전 뒤에 그 라인을 맡을 사람도 정해야 시간을 벌어요.",
    ],
    dispatch:
      "접지 장비와 아군 통과로 표시, 대응조까지 확인했어요. 설치 순서대로 포장했으니 위에서부터 꺼내면 돼요.",
    checkout:
      "기술 인계 끝났어요. 회수할 땐 전원을 끄고, 검전기로 한 번 더 확인한 뒤 만지세요.",
  },
  jetpack: {
    mood: "systems",
    inspect: [
      "공중 체류는 두 라운드예요. 올라가는 건 쉬워도 두 번째 라운드 끝에 내릴 곳은 미리 정해야 해요.",
      "공중에 뜨면 지상과 장거리 판정이에요. 적에게서 멀어지는 만큼 지원팀과도 멀어진다는 건 기억해요.",
      "제트팩은 오래 나는 장비가 아니에요. 짧게 우회하거나 고지에 오를 때 쓰고, 비상 분리 손잡이부터 익혀 봐요.",
    ],
    dispatch:
      "두 라운드 타이머와 착륙 지점, 비상 분리까지 확인했어요. 무릎 괜찮죠? 그럼 운용 가능해요.",
    checkout:
      "인계 끝났어요. 올라가는 것보다 내려오는 게 중요하죠. 착륙할 때 무릎 굽히는 것, 잊지 마세요.",
  },
  "extended-magazine-mod": {
    mood: "systems",
    inspect: [
      "공격 한 번을 더 할 수 있는 개조예요. 급탄도 그만큼 정확해야 하니 실제로 쓰는 무기를 가져오세요.",
      "탄 수만 늘리면 끝일 것 같죠? 스프링 장력과 탄창 입구가 안 맞으면 계속 걸려요. 실탄 규격부터 볼게요.",
      "무기 하나에만 적용돼요. 제일 강한 것보다 자주 쓰는 걸 가져오세요. 손에 익은 쪽이 훨씬 나아요.",
    ],
    dispatch:
      "대상 화기 확인했고 급탄 시험도 끝났어요. 추가 1회가 걸림 1회로 바뀌면 안 되니까, 첫 임무 전에 한 번 더 시험해요.",
    checkout:
      "개조 인계 끝났어요. 첫 임무 뒤엔 남은 탄 수보다 걸림이 있었는지부터 알려 주세요. 바로 조정할게요.",
  },
  "portable-emp-launcher": {
    mood: "systems",
    inspect: [
      "탄약은 한 발, 정지 시간은 삼십 초예요. 그동안 뭘 할지 지금 정해요. 발사 뒤에 의논하기엔 너무 짧아요.",
      "중거리 전자 장비를 멈추지만 아군이라고 피해 가진 않아요. 통신기와 의료 장비부터 영향권 밖으로 빼 주세요.",
      "드론을 떨어뜨린 뒤 회수할지 파괴할지도 정해 둬야 해요. 삼십 초면 작업은 돼도 고민할 시간은 없어요.",
    ],
    dispatch:
      "1회 탄약 장전했고 삼십 초 타이머도 맞췄어요. 아군 전자 장비 격리 목록도 붙어 있네요. 운용 가능해요.",
    checkout:
      "인계 끝났어요. 발사 뒤에는 적 장비보다 아군 통신과 의료 장비부터 확인해 주세요. 같이 나가면 곤란하니까요.",
  },
};

export const STRATEGIC_DIALOGUE_ITEM_KEYS = Object.freeze(
  Object.keys(STRATEGIC_ITEM_DIALOGUE),
);

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

export function buildStrategicWelcomeLine(args: {
  codename: string | null;
  profile: StrategicCharacterProfile;
}): string {
  if (!args.codename) return STRATEGIC_DIALOGUE_LINES.welcome;
  const profileLine = stableLine(
    STRATEGIC_PROFILE_LINES[args.profile],
    `${args.codename}:${args.profile}:RATCHET`,
  );
  return `${args.codename}, 왔네요. ${profileLine}`;
}

export function buildStrategicItemLine(
  item: StrategicCatalogItem,
  variant = 0,
): { mood: StrategicMood; text: string } {
  if (!item.available) {
    return { mood: "blocked", text: STRATEGIC_DIALOGUE_LINES.unavailable };
  }

  const dialogue = STRATEGIC_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return {
      mood: dialogue.mood,
      text: `${item.name}. ${cycleLine(dialogue.inspect, variant)}`,
    };
  }
  return {
    mood: "inspect",
    text: `${item.name}. 장착 위치와 작동 시간부터 볼까요? 회수 방법도 같이 알려 주세요.`,
  };
}

export function buildStrategicDispatchLine(
  item: StrategicCatalogItem,
): string {
  if (!item.available) return STRATEGIC_DIALOGUE_LINES.unavailable;
  const dialogue = STRATEGIC_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return `${item.name} 출고 준비. ${dialogue.dispatch}`;
  }
  return `${item.name} 출고 절차로 넘길게요. 운용 인원과 회수 계획도 같이 적어 주세요.`;
}

export function buildStrategicCheckoutLine(
  item: StrategicCatalogItem,
  variant = 0,
): string {
  if (!item.available) return STRATEGIC_DIALOGUE_LINES.unavailable;
  const dialogue = STRATEGIC_ITEM_DIALOGUE[item.key];
  if (dialogue) {
    return `${item.name}. ${dialogue.checkout}`;
  }
  return variant % 2 === 0
    ? `${item.name}. 인계 끝났어요. 첫 운용 뒤 예상과 달랐던 부분이 있으면 바로 말해 주세요.`
    : `${item.name}. 준비됐어요. 복귀하면 새 흠집이나 이상 소음부터 같이 보죠.`;
}
