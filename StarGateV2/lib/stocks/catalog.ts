/**
 * 주식(stocks) 카탈로그 — tia_bot `STOCKS` 의 TS 포팅.
 *
 * 출처: `tia_bot/stock_system.py:70-89` (STOCKS 상수).
 *
 * - ticker 는 tia_bot 의 종목 코드와 1:1 매칭 (DB stock_prices.ticker 와도 동일).
 * - basePrice 는 IPO 시드 가격. 운영 중 stock_prices.price 가 SoT 이며 catalog 의
 *   basePrice 는 시드 미적재 / 신규 종목 fallback 용 + 시드 스크립트 입력.
 * - description 은 종목 소개 (신원조회/매수 모달 등 UI 표시용).
 * - 9 종목. M3-A 시점 기준 봇 코드와 정합 (봇은 이미 중지 상태).
 */

/* ── Interface ── */

export interface StockCatalogItem {
  /** 종목 코드. 대문자 3글자 (TWS, STM, ...). DB 키. */
  ticker: string;
  /** 한글 표시명. */
  name: string;
  /** IPO 시드 가격 (정수). 시드 미적재 시 fallback. */
  basePrice: number;
  /** 종목 설명 (UI 표시용). */
  description: string;
  /**
   * 종목 브랜드 컬러 (hex). 로고 동그라미 배경/액센트 등 시각 식별에 사용.
   * dark theme 배경 위에서 식별 가능한 톤 + globals.css 의 gold/danger 와 충돌하지 않게 선택.
   */
  color: string;
}

/* ── Catalog (9 종목) ── */

export const STOCK_CATALOG: StockCatalogItem[] = [
  {
    ticker: "TWS",
    name: "토와스키",
    basePrice: 10,
    description:
      "연식 있는 브랜드 총기 제조사. 군·경찰·민간 시장에 걸쳐 폭넓은 유통망 보유.",
    color: "#4A5560",
  },
  {
    ticker: "STM",
    name: "스타마트",
    basePrice: 10,
    description:
      "미국 상권 지분 30%를 차지하는 대형 마트 브랜드. 생활용품부터 초인 장비까지 취급.",
    color: "#E08A1F",
  },
  {
    ticker: "SSR",
    name: "송사리",
    basePrice: 30,
    description:
      "다국적기업의 종합 해운 기업으로 컨테이너·벌크·LNG 화물 운송 및 항만 터미널 운영, 선박 건조 사업을 영위함.",
    color: "#1F6B8F",
  },
  {
    ticker: "MSF",
    name: "만세식품",
    basePrice: 50,
    description:
      "한국계 제과 기업. 서울-만세 아이스크림으로 유명하며 현재 고급화 전략 추진 중.",
    color: "#D87093",
  },
  {
    ticker: "VFP",
    name: "VF제약",
    basePrice: 80,
    description:
      "일본계 생명공학·의약품 회사. 과학자 혈청 등 특수 의약품의 주요 공급처.",
    color: "#9B6FBF",
  },
  {
    ticker: "BPE",
    name: "블랙피라미드 에너지",
    basePrice: 100,
    description: "블랙피라미드에서 생산되는 전력을 전 세계에 공급하는 에너지 기업.",
    color: "#9B2C6F",
  },
  {
    ticker: "ART",
    name: "오로라텍",
    basePrice: 120,
    description:
      "오로라 판데믹 이후 창설된 중국계 기업. 오로라 바이러스 백신 및 광원화 활용 연구.",
    color: "#1F9B7A",
  },
  {
    ticker: "GN3",
    name: "지니어스 33",
    basePrice: 350,
    description:
      "글로벌 자산 운용사. 사모펀드·투자 등 금융 전반에 걸친 사업 포트폴리오 보유.",
    color: "#2F6B4F",
  },
  {
    ticker: "SPZ",
    name: "스페이스 제로",
    basePrice: 1000,
    description:
      "우주항공·무기·AI 산업 글로벌 선두주자. 전기차 산업까지 이끄는 초대형 기업.",
    color: "#3A8FBF",
  },
];

/* ── Lookup helpers ── */

/**
 * ticker → item lookup (O(1)).
 *
 * Map 기반이라 단언 없이도 타입 안전. 미존재 ticker 는 `undefined` — 호출자 분기.
 */
const tickerIndex = new Map<string, StockCatalogItem>(
  STOCK_CATALOG.map((item) => [item.ticker, item]),
);

export function findStockByTicker(ticker: string): StockCatalogItem | undefined {
  return tickerIndex.get(ticker);
}
