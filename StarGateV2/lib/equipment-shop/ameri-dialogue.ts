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
] as const;

const DESTINATION_LINES: Record<AmeriDestination, readonly string[]> = {
  lab: [
    "신체증강 연구소는 이레나 소장 담당입니다. 개인 연구면 대상자 기록, 팀 연구면 공동 기여 내역을 준비하세요.",
    "생체 적합성 검토는 출력 수치보다 먼저예요. 시술 동의와 선행 연구 기록을 빠뜨리지 마세요.",
  ],
  towaski: [
    "토와스키 건샵은 화기와 방호구 반출 구역입니다. 기본 화기 라이센스가 없으면 시험장부터 들르세요.",
    "총기 반출은 신원표, 자격, 잔액 순으로 확인합니다. 셋 중 하나라도 비면 토와스키 씨가 돌려보낼 거예요.",
  ],
  acheron: [
    "아케론 대장간은 브리짓 케인 담당입니다. 근접무기 훈련 기록과 장비 규격을 먼저 확인하세요.",
    "냉병기는 아케론 쪽이에요. 손에 맞는다는 설명보다 훈련 기록이 더 빨리 통합니다.",
  ],
  strategic: [
    "전략 장비 보급소는 운용 인원과 회수 계획이 필수예요. 장비명만 적은 요청서는 접수하지 않습니다.",
    "차량과 전략 자산은 마테오 씨가 기술 검수합니다. 승무원, 연료, 귀환 계획을 한 묶음으로 제출하세요.",
  ],
  custom: [
    "공방 상담은 제작 목적과 요구 성능부터 정리하세요. '강한 무기'는 사양서가 아닙니다.",
    "전용무기 요청은 사용 목적, 규격, 예산을 적어주세요. 그림만 제출하면 검토가 오래 걸립니다.",
  ],
  simulator: [
    "훈련장은 보급형 장비의 사거리와 탄환 운용을 시험합니다. 반출 전 확인이 필요하면 이쪽이에요.",
    "시험 기록은 라이센스와 반출 심사에 연결됩니다. 결과 저장 전에 창을 닫지 마세요.",
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

export function buildAmeriWelcomeLine(codename: string | null): string {
  if (!codename) return AMERI_DIALOGUE_LINES.welcome;
  return `${codename}, 병기부 요청 화면 열었습니다. 필요한 구역을 고르세요. 결재가 필요한 업무면 서류부터 확인할게요.`;
}

export function buildAmeriDestinationLine(
  destination: AmeriDestination,
  codename: string | null,
): { mood: AmeriMood; text: string } {
  const line = stableLine(
    DESTINATION_LINES[destination],
    `${codename ?? "VISITOR"}:${destination}:AMERI`,
  );
  return {
    mood: destination === "custom" ? "review" : "routing",
    text: codename ? `${codename}, ${line}` : line,
  };
}
