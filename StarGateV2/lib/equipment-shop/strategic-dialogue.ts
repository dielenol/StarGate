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
    "아, 오셨습니까? 요청서부터 볼게요. 장비 고르기 전에 운용 인원이랑 임무 시간부터 맞춰보시죠.",
  noAgent:
    "음.. 지금 보급 대상이 지정되어 있지 않은데요. 운용하실 분부터 정해주셔야 다음 절차로 넘길 수 있습니다.",
  closed:
    "아, 오늘 반출 업무는 끝났습니다. 정비 이력하고 승인선 다시 열리면 그때 제가 바로 봐드릴게요.",
  gmOnly:
    "기술 검수까지는 제가 해드릴 수 있는데요, 최종 반출은 담당관 서명이 필요합니다. 이건 제가 마음대로 넘겨드릴 수가 없어서요.",
  unavailable:
    "아, 그 장비는 지금 정비 중입니다. 기록상으로는 멀쩡한데요.. 제가 직접 작동 확인하기 전에는 못 내보냅니다. 조금만 기다려주십쇼.",
  insufficient:
    "음.. 지금 예산으로는 조금 부족합니다. 장비 값만이 아니라 연료하고 회수 비용까지 같이 잡으셔야 돼요. 다시 한번 계산해보시죠.",
  checkout:
    "출고 승인 확인됐습니다. 승무원, 연료, 회수 계획까지 다시 한번 보시고요. 하나라도 빠졌으면 지금 말씀해주십쇼.",
  checkoutError:
    "잠시만요, 반출 절차가 멈췄습니다. 승인 내역이나 잔액, 장비 상태 중에 안 맞는 게 있는 것 같은데요.. 제가 확인할 테니까 일단 시동은 걸지 마십쇼.",
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
    text: "차량은 세워둔다고 멀쩡한 게 아닙니다. 오히려 배터리나 실링부터 나가는 경우가 많아요.",
  },
  {
    mood: "systems",
    text: "표시등이 정상이라고 바로 믿으시면 안 됩니다. 비상 정지까지 눌러봐야 진짜 점검 끝난 거예요.",
  },
  {
    mood: "inspect",
    text: "카탈로그 제원도 중요하죠. 근데 저는 정비 이력을 먼저 봅니다. 현장에서 어떻게 굴렀는지가 더 정확하거든요.",
  },
  {
    mood: "idle",
    text: "음.. 가져가시는 건 좋은데, 회수 계획도 같이 잡아주십쇼. 현장에 두고 오시면 결국 제가 가지러 가야 됩니다.",
  },
  {
    mood: "systems",
    text: "승무원 한 명쯤 빠져도 되겠지 하시면 안 돼요. 그 한 명이 맡는 절차가 생각보다 많습니다.",
  },
  {
    mood: "inspect",
    text: "새 흠집 생기는 건 괜찮습니다. 대신 어디서 생겼는지만 꼭 말씀해주세요. 원인을 알아야 제대로 고치죠.",
  },
] as const;

const STRATEGIC_PROFILE_LINES: Record<
  StrategicCharacterProfile,
  readonly string[]
> = {
  assault: [
    "화력 좋은 장비부터 보고 계시네요. 좋습니다. 다만 승무원하고 회수 수단부터 맞춰주십쇼. 현장에서 멈추면 답이 없거든요.",
    "빠르게 밀어붙이는 편성이시군요. 그러면 탄약만큼 퇴로하고 재급유 지점도 중요합니다. 그쪽부터 같이 보시죠.",
  ],
  guard: [
    "방호를 중요하게 보시는군요. 장갑 수치도 봐야 되는데요, 탈출구하고 견인 지점도 같이 확인해주셔야 합니다.",
    "오래 버티는 장비를 찾으시는 것 같은데요. 음.. 그럼 비상 해치 위치부터 익혀두시는 게 좋겠습니다.",
  ],
  endurance: [
    "장기 임무 편성이시네요. 최고 속도보다는 연료, 냉각, 현장 수리 주기를 먼저 계산해보시죠.",
    "오래 운용하실 거면 보급 주기가 성능이나 마찬가지입니다. 예비 부품 상자도 자산 목록에 꼭 넣어주십쇼.",
  ],
  focus: [
    "정밀 운용 쪽이시군요. 센서나 통신, 전자전 계통을 임무 채널에 맞춰드리면 될 것 같습니다.",
    "드론하고 표적 장비를 많이 쓰시는 편성이네요. 탐지 범위도 좋지만 데이터 지연부터 한번 확인해보시죠.",
  ],
  balanced: [
    "운용 편성이 고르게 잡혀있네요. 그럼 임무 환경하고 귀환 계획부터 보고 장비를 좁혀보시죠.",
    "특정 계통에 치우친 팀은 아니군요. 필요한 화력도 봐야겠지만, 유지 가능한 장비부터 고르시는 게 좋겠습니다.",
  ],
};

const STRATEGIC_ITEM_DIALOGUE: Record<string, StrategicItemDialogue> = {
  "ch-47-chinook": {
    mood: "systems",
    inspect: [
      "승무원은 셋이 필요하고요, 그중 항공 기관사 자리는 절대 비우시면 안 됩니다. 쉰 명 태우고 계기 읽을 사람 없으면.. 사고인 거 아시죠..?",
      "여덟 시간 상주하실 거면 음.. 탑승 순서부터 짜셔야 될 것 같은데요..? 마지막에 실은 사람이 가장 먼저 내리게 하셔야 된다는 거 잊지 마십쇼!",
      "치누크는 말이죠, 화력 자산보단.. 시간 단축용에 가깝습니다. 착륙 지점부터 집결 시간, 복귀 시간까지 제대로 맞아야 굴러가니까 활용하실 거면 참고해주십쇼!",
    ],
    dispatch:
      "조종사 두 명, 항공 기관사 한 명, 후송 명단 리스트업에 음.. 또 뭐가 있더라.. 아! 됐네요. 이제 운용 가능하십니다. 출격에 사용하지 않더라도 주기적으로 정비받아야 하는 거 잊지 마십쇼!",
    checkout:
      "인계 끝났습니다. 복귀하시면 마지막으로 착륙한 장소부터 말씀해주세요. 비행 기록만 보는 것보다 그게 기체 상태 확인하기 좋거든요.",
  },
  "uh-60-black-hawk": {
    mood: "systems",
    inspect: [
      "블랙 호크는 조종사 두 명하고 도어 거너 두 명이 기본이고요. 남는 일곱 자리만 먼저 채우시면 안 됩니다. 기체 굴릴 사람이 없잖아요.",
      "전투 투입은 다섯 라운드, 작전 체류는 네 시간입니다. 미사일은 세 발이고요. 음.. 그러니까 화력보다 철수 시간부터 맞춰주시는 게 좋겠습니다.",
      "수송이랑 화력 지원 둘 다 맡기실 수는 있는데요, 둘 다 동시에 급하다고 하시면 연료가 먼저 바닥납니다. 이번 임무에서 뭐가 우선인지 정해주십쇼.",
    ],
    dispatch:
      "조종사 둘, 도어 거너 둘, 탑승자 일곱 명에.. 미사일 세 발까지 확인했습니다. 네 시간 안에 복귀하는 항로 맞죠? 좋습니다. 준비됐습니다.",
    checkout:
      "인계 완료했습니다. 도어 거너 탄약 확인하실 때 연료계도 같이 봐주십쇼. 생각보다 훨씬 빨리 줄어듭니다.",
  },
  "hmmwv-humvee": {
    mood: "inspect",
    inspect: [
      "험비는 네 자리입니다. 기관총은 별도 숙련 없이 쓰실 수 있는데요, 그렇다고 운전수까지 사수로 돌리시면 안 됩니다. 복귀할 사람은 남겨두셔야죠.",
      "중거리 기동에는 이만한 게 없죠. 다만 장갑 믿고 길 한가운데 세워두지는 마십쇼. 바퀴 한번 나가면 그 자리에서 꼼짝도 못 합니다.",
      "빠르게 들어갔다 나오는 용도로 쓰실 거면 좋습니다. 음.. 탑승자 네 명의 승하차 순서만 미리 정해두세요. 현장에서 은근히 많이 엉킵니다.",
    ],
    dispatch:
      "네 자리 확인했고 중기관총도 이상 없습니다. 운전수는 끝까지 운전수로 남는 편성 맞으시죠? 그럼 바로 운용하셔도 됩니다.",
    checkout:
      "인계 끝났습니다. 복귀하시면 주행거리랑 하부 충격받은 곳만 말씀해주세요. 제가 리프트 올려서 한번 보겠습니다.",
  },
  "m1-abrams": {
    mood: "inspect",
    inspect: [
      "전차장, 포수, 조종수, 탄약수까지 승무원 네 명이 필요합니다. 한 명쯤 겸직하면 안 되냐고요..? 음.. 안 됩니다. 진짜 안 돼요.",
      "포탄 한 발 위력이 상당합니다. 그래서 장전하기 전에 표적하고 아군 위치를 꼭 다시 보셔야 돼요. 쏜 다음에는 제가 해드릴 수 있는 게 없습니다.",
      "내구 삼백에 방어 삼십이면 든든하긴 하죠. 근데 궤도 빠지면 그대로 끝입니다. 회수 차량 배정하셨는지 먼저 확인해주십쇼.",
    ],
    dispatch:
      "승무원 네 명, 포탄 장전 절차 확인했고요. 견인 계획도.. 네, 들어와 있네요. 그럼 기술 점검은 통과입니다.",
    checkout:
      "인계 완료했습니다. 좁은 길 들어가실 때 포탑 방향만 꼭 봐주십쇼. 차체는 지나가도 포신이 걸리는 경우가 꽤 많습니다.",
  },
  "m977-hemtt-military-truck": {
    mood: "inspect",
    inspect: [
      "HEMTT는 열여섯 명을 태우거나 대형 화물을 실을 수 있습니다. 둘 다 꽉 채우시는 건.. 음, 잠시만요. 그러려면 적재 계획부터 다시 짜셔야 됩니다.",
      "적재함이 넓다고 그냥 올려두시면 안 되고요, 체결점마다 제대로 묶어주셔야 합니다. 급정거 한번 하면 화물이 앞으로 다 쏟아져요.",
      "이 차량은 속도보다 보급 순서가 중요합니다. 어디까지 가실지보다 어디서 뭘 먼저 내리실지 적어주시면 제가 순서 맞춰서 실어드릴게요.",
    ],
    dispatch:
      "인원하고 화물 배치 확인했고요, 체결도 끝났습니다. 아! 첫 하역품은 뒤쪽에 빼놨으니까 현장에서 순서 바꾸지 마십쇼.",
    checkout:
      "인계 끝났습니다. 돌아오실 때 적재함이 비어있어도 천천히 모세요. 빈 차가 오히려 노면 충격을 더 세게 받습니다.",
  },
  "medical-ambulance": {
    mood: "inspect",
    inspect: [
      "의무품은 이백까지 실을 수 있습니다. 대신 환자 치료 동선을 막는 위치에는 한 상자도 놓으시면 안 돼요. 급할 때 손이 안 닿습니다.",
      "중거리 후송까지 가능하고요. 음.. 환자 분류하고 도착지 인계 담당은 정해두셨습니까? 그게 없으면 도착해서 시간이 더 걸립니다.",
      "방어는 십입니다. 아주 약한 건 아닌데요, 그렇다고 총격선 안에서 버티는 차량은 아닙니다. 환자 태우시면 바로 빠져주십쇼.",
    ],
    dispatch:
      "의무품 이백, 환자 동선, 후송지 담당자까지 확인했습니다. 네, 이 정도면 바로 출발하셔도 되겠습니다.",
    checkout:
      "인계 끝났습니다. 복귀하시면 남은 수량보다 부족했던 의무품부터 알려주세요. 다음 출동 때 앞쪽에 채워두겠습니다.",
  },
  "drone-self-destruct-mod": {
    mood: "systems",
    inspect: [
      "정찰 드론에 자폭 장치를 붙이는 개조입니다. 화염 피해는 오십이고요. 다만 한번 터뜨리면 정찰도 거기서 끝나는 거니까 사용 시점은 확실히 정해두십쇼.",
      "폭약 장착보다 명령 신호 분리가 더 중요합니다. 정찰 복귀하고 자폭 버튼이 붙어있으면.. 언젠가는 잘못 누릅니다. 제가 채널부터 따로 빼드릴게요.",
      "드론이 강해지는 개조라고 생각하시면 조금 곤란하고요. 마지막에 자폭 선택지가 하나 생기는 겁니다. 이후 정찰은 누가 맡을지도 같이 정해두셔야 돼요.",
    ],
    dispatch:
      "정찰하고 자폭 명령 분리됐고요, 안전 거리도 입력했습니다. 마지막 영상 저장 위치까지.. 네, 잡혔네요. 개조 끝났습니다.",
    checkout:
      "기술 인계 끝났습니다. 사용하신 뒤에는 자폭이 성공했는지보다 왜 그 시점에 신호를 보냈는지 기록을 남겨주십쇼. 다음 개조할 때 참고하겠습니다.",
  },
  "missile-guidance-laser": {
    mood: "systems",
    inspect: [
      "레이저를 조사한 다음 턴에 미사일이 도착합니다. 네 개 라인이 전부 피해 범위고요. 그러니까 아군 대피는 조사 전에 끝내주셔야 됩니다.",
      "이 장비는 한 번 쓰면 끝입니다. 좌표하고 아군 동선, 미사일 도착 시점까지.. 셋 다 맞는 거 확인하고 스위치 올려주십쇼.",
      "표적이 움직이더라도 발사된 미사일이 기다려주진 않습니다. 음.. 추적할 표적이면 이동 경로까지 계산하고 조사하시는 게 좋겠습니다.",
    ],
    dispatch:
      "1회분 봉인 멀쩡하고 네 개 라인 경고 채널도 연결됐습니다. 아군 이탈 신호 확인하신 다음에 조준 시작하십쇼.",
    checkout:
      "인계 완료했습니다. 레이저 운용자하고 철수 명령 담당자는 꼭 같은 지도를 보셔야 됩니다. 좌표가 다르면 정말 큰일 납니다.",
  },
  "stealth-cloak": {
    mood: "systems",
    inspect: [
      "광학 보정은 여덟 시간 유지됩니다. 아, 투명해진다고 발소리까지 없어지는 건 아니니까요. 걸어 다니실 때는 평소보다 더 조심해주십쇼.",
      "은신 보정은 오십입니다. 무조건 안 들키는 장비는 아니고요, 들키기까지 시간을 벌어주는 쪽에 가깝습니다. 퇴로부터 잡아두세요.",
      "망토 표면에 흠집이 나면 그 부분만 빛이 튑니다. 사용하고 나서 접어 넣지 마시고요, 펼친 상태로 검수대에 올려주십쇼.",
    ],
    dispatch:
      "광학 보정 정상이고 여덟 시간 타이머도 들어갔습니다. 종료 삼십 분 전에 경고 뜨게 해놨으니까 그때는 바로 복귀 준비하십쇼.",
    checkout:
      "인계 끝났습니다. 안 보인다고 혼자 너무 멀리 가지는 마세요. 구조팀이 위치를 못 잡으면 찾으러 갈 방법이 없습니다.",
  },
  "electric-barbed-wire-mod": {
    mood: "inspect",
    inspect: [
      "감전 효과는 한 번만 들어갑니다. 적이 들어올 길에 설치하시는 건 좋은데요, 아군 퇴로까지 막지는 않았는지 꼭 확인해주십쇼.",
      "성공치는 낮은 편이고요. 그래도 접지하고 우회로는 반드시 잡아야 됩니다. 안 그러면 설치하시는 분이 먼저 감전될 수도 있어요.",
      "철조망만 설치한다고 방어가 끝나는 건 아닙니다. 첫 감전 이후에 그 라인을 맡을 인원도 정해두셔야 제대로 시간을 벌 수 있어요.",
    ],
    dispatch:
      "접지 장비, 아군 통과로 표시, 대응조까지 확인했습니다. 설치 순서대로 포장해놨으니까 위에서부터 꺼내 쓰시면 됩니다.",
    checkout:
      "기술 인계 끝났습니다. 회수하실 때는 전원부터 끄시고요. 껐다고 생각하셔도 검전기로 한번 더 확인하고 만지십쇼.",
  },
  jetpack: {
    mood: "systems",
    inspect: [
      "공중 체류는 두 라운드입니다. 올라가시는 건 어렵지 않은데요, 두 번째 라운드 끝에 어디로 착륙할지는 미리 정해두셔야 돼요.",
      "공중에 뜨면 지상하고 장거리 판정이 됩니다. 적한테서 멀어지는 만큼 지원팀하고도 멀어진다는 건 기억해주십쇼.",
      "제트팩은 오래 날아다니는 장비는 아닙니다. 짧게 우회하거나 고지 올라가는 용도고요. 비상 분리 손잡이 위치부터 익혀보시죠.",
    ],
    dispatch:
      "두 라운드 타이머하고 착륙 지점, 비상 분리까지 확인했습니다. 음.. 무릎 괜찮으시죠? 그럼 운용 가능하십니다.",
    checkout:
      "인계 끝났습니다. 올라가는 것보다 내려오는 게 더 중요합니다. 착륙하실 때 무릎 굽히는 거 잊지 마십쇼.",
  },
  "extended-magazine-mod": {
    mood: "systems",
    inspect: [
      "공격 한 번을 더 할 수 있게 해주는 개조입니다. 대신 급탄도 그만큼 정확해야 돼요. 실제로 사용하시는 무기를 가져오셔야 맞춰드릴 수 있습니다.",
      "탄 수만 늘린다고 끝나는 건 아니고요. 스프링 장력하고 탄창 입구가 안 맞으면 계속 걸립니다. 제가 실탄 규격부터 볼게요.",
      "무기 하나에만 적용할 수 있습니다. 제일 강한 무기보다는 자주 쓰시는 걸 가져오세요. 손에 익은 무기에 다는 게 훨씬 낫습니다.",
    ],
    dispatch:
      "대상 화기 확인했고 급탄 시험도 끝났습니다. 추가 1회가 걸림 1회로 바뀌면 안 되니까요. 첫 임무 전에도 한번 시험해보십쇼.",
    checkout:
      "개조 인계 끝났습니다. 첫 임무 끝나고 나면 남은 탄 수보다 걸림이 있었는지부터 알려주세요. 바로 조정해드리겠습니다.",
  },
  "portable-emp-launcher": {
    mood: "systems",
    inspect: [
      "탄약은 한 발이고 정지 시간은 삼십 초입니다. 그 삼십 초 동안 뭘 하실지 먼저 정해주세요. 발사하고 나서 의논하기에는 너무 짧습니다.",
      "중거리 안의 전자 장비를 멈추는데요, 아군 장비라고 알아서 피해가진 않습니다. 통신기하고 의료 장비부터 영향권 밖으로 빼주십쇼.",
      "드론을 떨어뜨린 다음에 회수하실 건지 파괴하실 건지도 정해두셔야 됩니다. 삼십 초면 작업은 가능한데 고민할 시간은 없어요.",
    ],
    dispatch:
      "1회 탄약 장전했고 삼십 초 타이머도 맞췄습니다. 아군 전자 장비 격리 목록까지.. 네, 요청서에 붙어있네요. 운용 가능합니다.",
    checkout:
      "인계 완료했습니다. 발사한 다음에는 적 장비보다 아군 통신하고 의료 장비부터 확인해주십쇼. 그쪽이 같이 나가면 곤란합니다.",
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
  return `${args.codename}, 요청서 확인했습니다. ${profileLine}`;
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
    text: `${item.name}. 음.. 장착 위치하고 작동 시간, 회수 절차부터 같이 확인해보시죠.`,
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
  return `${item.name} 출고 절차로 넘기겠습니다. 운용 인원하고 회수 계획도 같이 적어주십쇼.`;
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
    ? `${item.name}. 인계 끝났습니다. 첫 운용 뒤에 예상과 달랐던 부분이 있으면 바로 말씀해주세요.`
    : `${item.name}. 준비됐습니다. 복귀하시면 새로 생긴 흠집이나 이상 소음부터 같이 보시죠.`;
}
