export type AmeriMood = "welcome" | "routing" | "review" | "blocked" | "idle";

export type AmeriDestination =
  | "lab"
  | "towaski"
  | "acheron"
  | "strategic"
  | "custom"
  | "simulator";

export const AMERI_DIALOGUE_LINES = {
  welcome:
    "병기부 안내데스크예요. 가실 곳만 말씀해 주세요. 결재 건이면 양식부터 볼게요.",
  noAgent:
    "주 대상 AGENT가 비어 있네요. 구경은 괜찮지만 반출이나 개인 승인은 지금 못 받아요.",
  closed:
    "오늘 접수는 끝났어요. 정말 급한 건이면 승인권자 이름이랑 문서 번호를 같이 가져오세요.",
} as const;

export const AMERI_MOOD_LABELS: Record<AmeriMood, string> = {
  welcome: "안내 접수",
  routing: "구역 배정",
  review: "서류 확인",
  blocked: "접수 보류",
  idle: "결재 대기",
};

export const AMERI_IDLE_LINES: readonly {
  mood: AmeriMood;
  text: string;
}[] = [
  {
    mood: "idle",
    text: "선택하실 때까지 기다릴게요. 커피가 식는 속도보다만 빠르면 됩니다.",
  },
  {
    mood: "review",
    text: "구매랑 연구 승인은 결재선이 달라요. 한 장에 섞어 쓰면요? 네, 둘 다 돌아옵니다.",
  },
  {
    mood: "idle",
    text: "하아.. 빈칸은 검토 대상이 아니라 반려 사유예요. 제출 전에 한 번만 더 확인하세요.",
  },
  {
    mood: "review",
    text: "긴급 표시를 세 번 붙여도 결재 순서는 빨라지지 않아요. 근거 문서를 붙이세요.",
  },
  {
    mood: "idle",
    text: "아직 고민 중이세요? 괜찮아요. 잘못 들어갔다가 다시 오는 것보단 제가 커피 한 모금 더 마시는 편이 낫죠.",
  },
  {
    mood: "review",
    text: "구매는 바로 끝나도 반출 기록은 남아요. 그러니까 이름이 멋있다는 이유만으로 고르지는 마세요.",
  },
  {
    mood: "idle",
    text: "오늘은 결재 대기열이 짧네요. 네, 이게 짧은 겁니다. 물어보지 마세요. 조금 슬퍼지니까.",
  },
  {
    mood: "review",
    text: "어디로 갈지 모르겠으면 하려는 일만 말하세요. 사는 건지, 시험하는 건지, 사람을 개조하는 건지. 그 정도면 찾아드려요.",
  },
] as const;

const DESTINATION_LINES: Record<AmeriDestination, readonly string[]> = {
  lab: [
    "신체증강 연구소요. 개인 강화인지 팀 연구인지만 정해 두세요. 접수선이 다르거든요.",
    "연구 완료랑 신체 적용은 같은 표시가 아니에요. 완료 대기열까지 보고 나오세요. 몸은 결재 취소로 되돌릴 수 없거든요.",
    "팀 연구에 보탤 거면 남은 금액부터 보세요. 커피는 넘쳐도 반갑지만 연구비는 아닙니다.",
    "일정을 당기고 싶으세요? 그건 이레나 소장에게 직접 말씀하세요. 제 서류보다 그분 표정이 더 빠를걸요.",
    "연구 표에는 체력, 정신력, 공격, 방어 네 칸뿐이죠. 사람까지 네 칸짜리는 아니니까 숫자만 보고 고르진 마세요.",
  ],
  towaski: [
    "토와스키 건샵은 화기, 방호구, 전투 소모품 쪽이에요. 기본 화기 라이센스가 없으면 진열장보다 시험장부터 보일 거고요.",
    "화기 보러 가시게요? 자격이랑 잔액부터 확인해 주세요. 갔다가 같은 표정으로 돌아오는 분을 오늘만 벌써 봤거든요.",
    "기본 자격은 말 그대로 시작이에요. 장비마다 시험이나 적성 조건이 따로 붙을 수 있으니 장바구니부터 채우진 마세요.",
    "결제가 끝나면 장비는 인벤토리로 넘어갑니다. 안 보인다고 두 번 사지 말고 먼저 새로고침하세요. 중복 구매 보고서는 저도 쓰기 싫어요.",
    "방호구도 토와스키 쪽에서 볼 수 있어요. 총보다 덜 흥미로워 보여도, 맞고 나면 생각이 꽤 달라질 겁니다.",
  ],
  acheron: [
    "검, 단검, 둔기 같은 근접무기는 아케론 대장간이에요. 브리짓 케인에게 손에 맞는 걸 물으면 알아서 골라줄 겁니다. 아주 솔직하게요.",
    "아케론 장비는 직접 보고 고르세요. 피해량이 같아도 손에 남는 감각은 다르다나 봐요. 그쪽은 브리짓이 저보다 훨씬 잘 압니다.",
    "전기톱도 근접무기로 치냐고요? 병기부 분류상은 그렇습니다. 반론은 아케론에서 시동 걸기 전에 하세요.",
    "방호구 추천을 받고 왔다면 아케론에서도 확인할 수 있어요. 추천표는 잃어버리지 마세요. 재발급 결재가 제 쪽으로 옵니다.",
    "파손된 무기를 새것처럼 숨겨서 가져가진 마세요. 브리짓은 알아보고, 저는 반납 사유서를 받게 됩니다. 둘 다 피곤해져요.",
  ],
  strategic: [
    "차량이나 전략 자산은 이쪽이에요. 잔액만 보지 말고 가용 상태도 확인하세요. 정비 중인 전차는 비싼 장식물이거든요.",
    "마테오 씨가 차량이랑 특수 장비를 봐요. 운용 인원이나 회수 계획이 비면 출고는 거기서 멈춥니다.",
    "드론 개조나 유도 장비 같은 작전 보조품도 전략 보급소에 있어요. 한 번 쓰고 끝나는 장비는 특히 사용 시점을 먼저 정하세요.",
    "큰 장비를 고르실수록 돌아오는 방법부터 보세요. 현장에 두고 오면 회수 요청서가 제 책상에 착륙하거든요.",
    "전략 장비는 사진보다 운용 조건이 본문이에요. 승무원 수랑 지속 시간을 안 봤으면 아직 고른 거 아니고요.",
  ],
  custom: [
    "공방에는 지금 장착한 장비의 강화 문의를 보낼 수 있어요. 장비를 고른 다음, 뭘 어떻게 바꾸고 싶은지만 사람 말로 적어 주세요.",
    "커스텀 장비도 접수해요. 형태, 용도, 작동 방식은 적어 주세요. '멋있고 강하게'는 요구사항보다 감상에 가깝습니다.",
    "전용 장비 신규 제작 문의도 열려 있어요. 형태와 용도, 반드시 필요한 기능을 요청서에 남겨주세요. 실제 제작은 운영자 검토 뒤에 진행됩니다.",
    "공방 문의는 운영자 검토 채널로 넘어가요. 바로 장비가 바뀌진 않습니다. 그렇게 빨랐으면 제가 여기 앉아 있지도 않았겠죠.",
    "강화 문의는 장착 중인 장비만 고를 수 있어요. 창고 물건을 고치고 싶다면 먼저 꺼내 드세요. 시스템도 독심술은 못 합니다.",
  ],
  simulator: [
    "훈련장은 장비를 사는 데가 아니라 써보는 데예요. 사거리나 공격 순서가 헷갈리면 여기서 몇 번 굴려보세요.",
    "보급형 장비는 마음껏 바꿔 시험해도 돼요. 크레딧도 인벤토리도 안 움직입니다. 기록지만 찢지 마시고요.",
    "가까우면 무조건 세고 멀면 무조건 약한 건 아니에요. 장비마다 편한 거리가 다르니 표적 위치부터 바꿔보세요.",
    "탄환 수와 판정 결과는 실시간 안내가 따라갑니다. 안내를 안 읽고 같은 실수를 반복하면… 네, 그것도 훈련 기록이긴 하죠.",
    "훈련장에서 실전 공격 순서를 익히려는 거면 잘 오셨어요. 여기서 난 구멍은 표적지 값으로 끝나니까요.",
  ],
};

function stableLine(
  lines: readonly string[],
  seed: string,
  variant = 0,
): string {
  const index = Array.from(seed).reduce(
    (sum, char, charIndex) =>
      sum + (char.codePointAt(0) ?? 0) * (charIndex + 1),
    0,
  );
  const normalizedVariant = Math.abs(Math.trunc(variant));
  return lines[(index + normalizedVariant) % lines.length] ?? lines[0] ?? "";
}

export function buildAmeriWelcomeLine(codename: string | null): string {
  if (!codename) return AMERI_DIALOGUE_LINES.welcome;
  return `${codename}, 요청 화면 열어뒀어요. 필요한 구역을 고르세요. 결재 건이면 서류부터 볼게요.`;
}

export function buildAmeriDestinationLine(
  destination: AmeriDestination,
  codename: string | null,
  variant = 0,
): { mood: AmeriMood; text: string } {
  const line = stableLine(
    DESTINATION_LINES[destination],
    `${codename ?? "VISITOR"}:${destination}:AMERI`,
    variant,
  );
  return {
    mood: destination === "custom" ? "review" : "routing",
    text: codename ? `${codename}, ${line}` : line,
  };
}
