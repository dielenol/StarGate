export type StockEventTier = "routine" | "scenario" | "shock";

export interface StockMarketEvent {
  tier: Exclude<StockEventTier, "routine">;
  text: string;
  minPercent: number;
  maxPercent: number;
}

export interface StockEventRoll {
  tier: StockEventTier;
  text: string;
  percent: number;
}

export type StockPriceDirection = "up" | "down";

const SCENARIO_CHANCE = 0.24;
const SHOCK_CHANCE = 0.06;

const EVENTS_BY_TICKER: Record<string, StockMarketEvent[]> = {
  TWS: [
    { tier: "scenario", text: "치안국 대량 조달 계약 체결", minPercent: 0.05, maxPercent: 0.13 },
    { tier: "scenario", text: "신형 탄약 라인 시험 생산 성공", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "민간 총기 규제안 상정", minPercent: -0.12, maxPercent: -0.05 },
    { tier: "scenario", text: "군납 단가 재협상 난항", minPercent: -0.1, maxPercent: -0.04 },
    { tier: "shock", text: "주력 소총 결함 조사 착수", minPercent: -0.34, maxPercent: -0.18 },
    { tier: "shock", text: "국가 단위 장기 군납 계약 수주", minPercent: 0.18, maxPercent: 0.32 },
  ],
  STM: [
    { tier: "scenario", text: "초인 장비 코너 매출 급증", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "PB 식료품 판매 호조", minPercent: 0.03, maxPercent: 0.09 },
    { tier: "scenario", text: "물류센터 파업 장기화", minPercent: -0.11, maxPercent: -0.05 },
    { tier: "scenario", text: "온라인몰 배송 지연 확산", minPercent: -0.09, maxPercent: -0.03 },
    { tier: "shock", text: "전국 매장 대규모 리콜 공지", minPercent: -0.3, maxPercent: -0.16 },
    { tier: "shock", text: "경쟁 체인 인수 합의", minPercent: 0.16, maxPercent: 0.28 },
  ],
  SSR: [
    { tier: "scenario", text: "항만 터미널 신규 운영권 확보", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "LNG 장기 운송 계약 체결", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "해상 보험료 급등", minPercent: -0.1, maxPercent: -0.04 },
    { tier: "scenario", text: "주요 항로 운임 하락", minPercent: -0.09, maxPercent: -0.03 },
    { tier: "shock", text: "핵심 항로 봉쇄로 운항 차질", minPercent: -0.33, maxPercent: -0.17 },
    { tier: "shock", text: "국제 구호 물류 독점 수주", minPercent: 0.17, maxPercent: 0.31 },
  ],
  MSF: [
    { tier: "scenario", text: "고급 디저트 라인 완판", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "서울-만세 아이스크림 해외 진출", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "원재료 가격 상승", minPercent: -0.09, maxPercent: -0.03 },
    { tier: "scenario", text: "계절 상품 판매 부진", minPercent: -0.08, maxPercent: -0.03 },
    { tier: "shock", text: "대표 제품 위생 논란 확산", minPercent: -0.28, maxPercent: -0.15 },
    { tier: "shock", text: "글로벌 식품사와 합작 발표", minPercent: 0.16, maxPercent: 0.27 },
  ],
  VFP: [
    { tier: "scenario", text: "특수 혈청 임상 데이터 개선", minPercent: 0.06, maxPercent: 0.14 },
    { tier: "scenario", text: "백신 공급 계약 확대", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "의료기기 승인 지연", minPercent: -0.1, maxPercent: -0.04 },
    { tier: "scenario", text: "연구 라이센스 분쟁 발생", minPercent: -0.11, maxPercent: -0.05 },
    { tier: "shock", text: "핵심 임상 중단 권고", minPercent: -0.38, maxPercent: -0.2 },
    { tier: "shock", text: "오로라 변이 대응 치료제 승인", minPercent: 0.2, maxPercent: 0.36 },
  ],
  BPE: [
    { tier: "scenario", text: "ESS 설비 효율 개선 발표", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "송배전 라이센스 갱신", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "발전소 정비 비용 증가", minPercent: -0.09, maxPercent: -0.04 },
    { tier: "scenario", text: "전력 수요 전망 하향", minPercent: -0.08, maxPercent: -0.03 },
    { tier: "shock", text: "블랙피라미드 송전망 사고", minPercent: -0.36, maxPercent: -0.18 },
    { tier: "shock", text: "대륙 전력 독점 계약 체결", minPercent: 0.18, maxPercent: 0.34 },
  ],
  ART: [
    { tier: "scenario", text: "광원화 응용 특허 등록", minPercent: 0.05, maxPercent: 0.13 },
    { tier: "scenario", text: "오로라 진단 장비 수주 확대", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "백신 부작용 조사 착수", minPercent: -0.12, maxPercent: -0.05 },
    { tier: "scenario", text: "연구 설비 가동률 하락", minPercent: -0.09, maxPercent: -0.03 },
    { tier: "shock", text: "오로라 백신 핵심 특허 무효 심판", minPercent: -0.4, maxPercent: -0.22 },
    { tier: "shock", text: "광원화 치료 기술 돌파구 발표", minPercent: 0.22, maxPercent: 0.4 },
  ],
  GN3: [
    { tier: "scenario", text: "사모펀드 신규 펀딩 성공", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "IB 대형 딜 주관 확정", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "헤지펀드 수익률 부진", minPercent: -0.1, maxPercent: -0.04 },
    { tier: "scenario", text: "감독기관 조사 착수", minPercent: -0.12, maxPercent: -0.05 },
    { tier: "shock", text: "주요 펀드 환매 중단 공지", minPercent: -0.35, maxPercent: -0.18 },
    { tier: "shock", text: "초대형 국부펀드 위탁 계약", minPercent: 0.17, maxPercent: 0.3 },
  ],
  SPZ: [
    { tier: "scenario", text: "위성 발사체 재사용 시험 성공", minPercent: 0.04, maxPercent: 0.1 },
    { tier: "scenario", text: "군사 AI 플랫폼 수주", minPercent: 0.05, maxPercent: 0.12 },
    { tier: "scenario", text: "전기차 배터리 결함 조사", minPercent: -0.1, maxPercent: -0.04 },
    { tier: "scenario", text: "발사 일정 연기", minPercent: -0.09, maxPercent: -0.03 },
    { tier: "shock", text: "궤도 발사 실패 생중계", minPercent: -0.32, maxPercent: -0.16 },
    { tier: "shock", text: "차세대 우주방산 계약 독점", minPercent: 0.16, maxPercent: 0.29 },
  ],
};

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function isDirectionMatch(
  event: StockMarketEvent,
  direction: StockPriceDirection,
): boolean {
  return direction === "up" ? event.maxPercent > 0 : event.minPercent < 0;
}

export function rollStockMarketEvent(
  ticker: string,
  routinePercent: number,
  direction: StockPriceDirection,
): StockEventRoll {
  const events = EVENTS_BY_TICKER[ticker] ?? [];
  const roll = Math.random();
  const shockEvents = events.filter(
    (event) => event.tier === "shock" && isDirectionMatch(event, direction),
  );
  const scenarioEvents = events.filter(
    (event) =>
      event.tier === "scenario" && isDirectionMatch(event, direction),
  );

  if (roll < SHOCK_CHANCE && shockEvents.length > 0) {
    const event = pickRandom(shockEvents);
    return {
      tier: "shock",
      text: event.text,
      percent: randomInRange(event.minPercent, event.maxPercent),
    };
  }

  if (roll < SHOCK_CHANCE + SCENARIO_CHANCE && scenarioEvents.length > 0) {
    const event = pickRandom(scenarioEvents);
    return {
      tier: "scenario",
      text: event.text,
      percent: randomInRange(event.minPercent, event.maxPercent),
    };
  }

  return {
    tier: "routine",
    text: "정기 변동",
    percent: routinePercent,
  };
}

