export type TiaMood =
  | "welcome"
  | "tired"
  | "soldout"
  | "bag"
  | "doodle"
  | "purchase"
  | "nap";

export const TIA_DIALOGUE_LINES = {
  welcome: "어서 오세요~! 스타마트입니다!",
  newItems:
    "오늘 새로 들어온 게 꽤 많아요. 눈에 가는 거 있으면 편하게 보세요~",
  idleBrowse: "천천히 보셔도 돼요. 저는 카운터에 있을게요~",
  idleDoodle:
    "이건 어디에 놔야 잘 보이려나… 손님은 어느 쪽이 더 눈에 띄어요?",
  idleStockCheck:
    "재고표가 하나 안 맞네요. 금방 맞춰둘 테니 편하게 둘러보세요.",
  idleBag: "봉투는 여기 있어요. 계산할 때 말씀하시면 같이 챙길게요.",
  idleSleepy:
    "아, 방금 눈 감은 거 아니에요. 계산은 멀쩡하게 할 수 있어요.",
  lowStock: "이거 남은 수량이 얼마 없어요. 필요하시면 지금 확인해 보세요.",
  soldOut:
    "이건 지금 품절이에요. 발주 요청을 남기면 입고될 때 알림이 가요.",
  reorderRequested:
    "발주 요청이 접수됐어요. 이제 입고 알림을 기다려 주세요.",
  reorderAlready: "이건 벌써 발주가 들어가 있어요. 장부에도 체크해뒀고요.",
  reorderError:
    "이상하네, 발주 장부가 지금 안 넘어가요. 조금 있다가 한 번만 더 부탁드릴게요.",
  bag: "봉투도 같이 드릴까요?",
  goodbye: "감사합니다! 조심히 들어가세요. 다음에 또 봬요~",
  closed: "편의점이 문을 닫았다.\n편의점 알바생도 퇴근한 것 같다...",
  noAgent:
    "메인 AGENT 확인이 먼저 필요하대요. 이건 제가 처리할 수가 없어서, GM에게 한번 물어봐 주세요.",
  checkoutError:
    "결제 정보가 서로 안 맞네요. 수량이랑 잔액만 한 번 봐주시겠어요?",
  lotteryEnded:
    "어, 방금 복권 이벤트가 끝났네요. 소다 결제는 안 됐으니 안심하시고, 장바구니만 다시 봐주세요.",
  sodaDailyLimit:
    "소다는 오늘 몫을 다 채우셨어요. 열 개까지라, 내일 다시 오셔야 해요~",
  cartAdjusted:
    "사이에 재고가 바뀌었네요. 살 수 있는 수량까지만 장바구니에 다시 맞춰뒀어요.",
} as const;

export const TIA_IDLE_LINES: readonly { mood: TiaMood; text: string }[] = [
  { mood: "doodle", text: TIA_DIALOGUE_LINES.newItems },
  { mood: "welcome", text: TIA_DIALOGUE_LINES.idleBrowse },
  { mood: "doodle", text: TIA_DIALOGUE_LINES.idleDoodle },
  { mood: "tired", text: TIA_DIALOGUE_LINES.idleStockCheck },
  { mood: "bag", text: TIA_DIALOGUE_LINES.idleBag },
  { mood: "nap", text: TIA_DIALOGUE_LINES.idleSleepy },
];

export const TIA_MOOD_LABELS: Record<TiaMood, string> = {
  welcome: "환영",
  tired: "재고 확인",
  soldout: "품절 안내",
  bag: "봉투 확인",
  doodle: "둘러보기",
  purchase: "결제 완료",
  nap: "휴식 중",
};
