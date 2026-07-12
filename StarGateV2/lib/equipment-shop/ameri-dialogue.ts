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
    "병기부 안내데스크입니다. 요청하실 구역을 고르세요. 양식이 필요한 업무면 먼저 말씀하시고요.",
  noAgent:
    "주 대상 AGENT가 지정되지 않았어요. 열람은 가능하지만 반출이나 개인 승인 요청은 접수할 수 없습니다.",
  closed:
    "병기부 응대 시간이 끝났습니다. 긴급 요청이면 승인권자와 문서 번호를 같이 가져오세요.",
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
    text: "구매 요청과 연구 승인은 결재선이 달라요. 한 문서에 같이 적으면 둘 다 반려됩니다.",
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
    "신체증강 연구소요. 혼자 받을 강화인지, 팀 전체 연구인지 먼저 정하세요. 이레나 소장 앞에서 고민하면 검사부터 하나 더 늘어날 테니까.",
    "연구가 끝났다는 표시와 몸에 적용됐다는 표시는 달라요. 완료 대기열까지 보고 나오세요. 사람 몸은 결재 취소로 되돌릴 수 없으니까요.",
    "팀 연구에 크레딧을 보탤 거면 남은 금액부터 확인하세요. 넘쳐서 좋은 건 커피뿐이에요. 연구비는 아닙니다.",
    "연구 일정을 당기고 싶다고요? 이레나 소장에게 직접 말하세요. 제 서류보다 그분 표정이 더 빠르게 안 된다고 알려줄 거예요.",
    "연구 수치는 체력, 정신력, 공격, 방어. 네 칸뿐인데 사람은 그렇게 단순하지 않죠. 원하는 숫자만 보고 시술 고르진 마세요.",
  ],
  towaski: [
    "토와스키 건샵은 화기, 방호구, 전투 소모품 쪽이에요. 기본 화기 라이센스가 없으면 물건보다 시험장이 먼저 보일 겁니다.",
    "총을 사러 가는 건 좋은데요. 자격하고 잔액은 확인하셨어요? 토와스키 씨한테 갔다가 다시 제 앞을 지나가는 표정, 이제 그만 보고 싶어서요.",
    "기본 자격은 시작일 뿐이에요. 장비마다 별도 시험이나 적성 조건이 붙을 수 있으니, 가격표만 보고 장바구니부터 채우진 마세요.",
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
    "차량이나 전략 자산을 찾는 거면 이쪽이에요. 크레딧만 맞는다고 끝은 아니고, 가용 상태도 같이 보세요. 정비 중인 전차는 꽤 비싼 장식물이니까.",
    "마테오 씨가 차량과 특수 장비를 보고 있습니다. 승무원, 연료, 회수 계획 중 하나라도 비었으면 출고보다 잔소리가 먼저 나올 거예요.",
    "드론 개조나 유도 장비 같은 작전 보조품도 전략 보급소에 있어요. 한 번 쓰고 끝나는 장비는 특히 사용 시점을 먼저 정하세요.",
    "큰 장비를 고르실수록 돌아오는 방법부터 보세요. 현장에 두고 오면 회수 요청서가 제 책상에 착륙하거든요.",
    "전략 장비는 카탈로그 사진보다 운용 조건이 본문이에요. 승무원 수와 지속 시간을 안 읽었다면 아직 고른 게 아닙니다.",
  ],
  custom: [
    "공방에서는 지금 장착 중인 장비의 강화 문의를 보낼 수 있어요. 먼저 장비를 고르고, 뭘 어떻게 바꾸고 싶은지 사람 말로 적으세요. 알아듣게만요.",
    "커스텀 장비 의뢰도 접수는 됩니다. 형태, 용도, 작동 방식 정도는 써주세요. '멋있고 강하게'는 요구사항 두 글자와 감상문입니다.",
    "전용 장비 신규 제작은 아직 정비 중이에요. 버튼이 없다고 찾지 마세요. 숨겨둔 게 아니라 정말 아직 없는 겁니다.",
    "공방 문의를 보내면 운영자 검토 채널로 넘어갑니다. 바로 장비가 바뀌는 건 아니에요. 그렇게 빨랐으면 제가 여기 앉아 있지도 않았겠죠.",
    "강화 문의는 장착 중인 장비만 고를 수 있어요. 창고 물건을 고치고 싶다면 먼저 꺼내 드세요. 시스템도 독심술은 못 합니다.",
  ],
  simulator: [
    "훈련장은 장비를 사는 곳이 아니라 써보는 곳이에요. 사거리와 탄환, 공격 흐름이 헷갈리면 여기서 먼저 몇 번 굴려보세요.",
    "보급형 장비끼리 바꿔가며 시험할 수 있어요. 크레딧도 인벤토리도 안 움직이니, 마음껏 틀리셔도 됩니다. 기록지만 찢지 마시고요.",
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
  return `${codename}, 병기부 요청 화면 열었습니다. 필요한 구역을 고르세요. 결재가 필요한 업무면 서류부터 확인할게요.`;
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
