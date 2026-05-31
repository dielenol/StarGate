/**
 * 종목 메타 데이터 — 토스 종목 정보 패널용 (server-safe, React import 금지).
 *
 * 9 종목 각각의 회사 설명/시가총액/대표이사/매출 구성/주요 사업 정보를 정적으로 보유.
 * `catalog.ts` 의 ticker 와 1:1 매칭, 가공된 값을 그대로 사용 (사용자 수정 예정).
 *
 * 사용처:
 *  - `StockInfoPanel` — 매수 페이지(`/erp/stock/[ticker]`) 토스 종목 정보 섹션
 */

/* ── Interface ── */

export interface RevenueSlice {
  label: string;
  /** 0~100 비율. 음수 허용 (예: "부문간 내부거래 제거" 차감). 합 100 가정. */
  ratio: number;
}

export interface MainBusiness {
  label: string;
  /** 랭킹 라벨 — "시가총액 1위", "독점", "점유율 1위" 등 자유 문자열. */
  rank: string;
}

export interface StockInfo {
  ticker: string;
  /** 한 줄 회사 설명 (dossier 톤). */
  description: string;
  /** 기업명 영문. */
  englishName: string;
  /**
   * 시가총액 — 게임 세계관 통화 "크레딧" (10억 크레딧 단위). 메가코프 규모.
   * 표시 시 `formatBillionToKor` 로 "1조 2,300억" 같은 한글 단위로 변환 + " 크레딧" suffix.
   * 매매 가격(`catalog.basePrice`)도 같은 크레딧 단위 (1주 가격은 ¤ 기호로 표시).
   */
  marketCapBillion: number;
  /** 실제 기업가치 — 크레딧 (10억 단위). */
  enterpriseValueBillion: number;
  /** 대표이사 (1-2명). */
  ceos: string[];
  /** 설립 연도. 미등록/비공개 종목은 null. */
  foundedYear: number | null;
  /** 상장일 — display 용 (YYYY년 M월 D일). */
  ipoDate: string;
  /** 발행주식수. */
  sharesOutstanding: number;
  /** 매출 구성 — 부문별 비율. */
  revenueComposition: RevenueSlice[];
  /** 주요 사업 카드 (2-4개). */
  mainBusinesses: MainBusiness[];
}

/* ── Data (9 종목) ── */

export const STOCK_INFO: Record<string, StockInfo> = {
  TWS: {
    ticker: "TWS",
    description:
      "동사는 1947년 설립된 글로벌 화기 제조 기업으로 군용·민간·치안 시장에 걸쳐 종합 화기 라인업 및 탄약·OEM 사업을 영위함.",
    englishName: "Towaski Industries",
    marketCapBillion: 123,
    enterpriseValueBillion: 46,
    ceos: ["안톤 토와스키", "카밀라 토와스키"],
    foundedYear: 1947,
    ipoDate: "1956년 3월 14일",
    sharesOutstanding: 1_230_000_000,
    revenueComposition: [
      { label: "군용·치안 라이센스", ratio: 55 },
      { label: "민간 사격용", ratio: 28 },
      { label: "탄약·소모품", ratio: 12 },
      { label: "부품·OEM", ratio: 5 },
    ],
    mainBusinesses: [
      { label: "화기 제조", rank: "시가총액 1위" },
      { label: "탄약 산업", rank: "시가총액 2위" },
      { label: "사격장 운영", rank: "점유율 1위" },
    ],
  },
  STM: {
    ticker: "STM",
    description:
      "1968년 설립된 미국 종합 유통 체인으로 식품·생활용품·의류·초인 장비를 취급하는 옴니채널 사업자. 미국 상권 지분 30% 보유.",
    englishName: "StarMart Holdings",
    marketCapBillion: 18,
    enterpriseValueBillion: 11,
    ceos: ["존 W. 스턴"],
    foundedYear: 1968,
    ipoDate: "1979년 7월 22일",
    sharesOutstanding: 180_000_000,
    revenueComposition: [
      { label: "식품·식자재", ratio: 38 },
      { label: "생활용품", ratio: 27 },
      { label: "의류·잡화", ratio: 15 },
      { label: "초인 장비 코너", ratio: 12 },
      { label: "온라인몰", ratio: 8 },
    ],
    mainBusinesses: [
      { label: "종합 유통", rank: "시가총액 1위" },
      { label: "PB 브랜드", rank: "시가총액 2위" },
      { label: "온라인몰", rank: "시가총액 3위" },
    ],
  },
  SSR: {
    ticker: "SSR",
    description:
      "다국적기업의 종합 해운 기업으로 컨테이너·벌크·LNG 화물 운송 및 항만 터미널 운영, 선박 건조 사업을 영위함.",
    englishName: "SongSaRi Shipping Co., Ltd.",
    marketCapBillion: 54,
    enterpriseValueBillion: 23,
    ceos: ["미등록"],
    foundedYear: null,
    ipoDate: "미등록",
    sharesOutstanding: 180_000_000,
    revenueComposition: [
      { label: "컨테이너 해운", ratio: 47 },
      { label: "벌크 화물", ratio: 26 },
      { label: "항만·터미널", ratio: 15 },
      { label: "선박 건조", ratio: 9 },
      { label: "기타", ratio: 3 },
    ],
    mainBusinesses: [
      { label: "해운", rank: "시가총액 3위" },
      { label: "항만 운영", rank: "시가총액 1위" },
      { label: "조선", rank: "시가총액 5위" },
    ],
  },
  MSF: {
    ticker: "MSF",
    description:
      "1953년 설립된 한국 종합 식품 기업. 아이스크림·제과·음료 라인업 보유. 서울-만세 아이스크림으로 잘 알려져 있으며 고급화 전략 추진 중.",
    englishName: "ManSe Foods Co., Ltd.",
    marketCapBillion: 12,
    enterpriseValueBillion: 7,
    ceos: ["이만세", "박지영"],
    foundedYear: 1953,
    ipoDate: "1985년 6월 18일",
    sharesOutstanding: 24_000_000,
    revenueComposition: [
      { label: "아이스크림", ratio: 42 },
      { label: "과자·스낵", ratio: 31 },
      { label: "음료", ratio: 18 },
      { label: "고급 디저트", ratio: 9 },
    ],
    mainBusinesses: [
      { label: "아이스크림", rank: "시가총액 1위" },
      { label: "과자", rank: "시가총액 2위" },
      { label: "음료", rank: "시가총액 4위" },
    ],
  },
  VFP: {
    ticker: "VFP",
    description:
      "1956년 설립된 일본계 생명공학·제약 기업으로 백신·과학자 혈청 등 특수 의약품과 만성질환 치료제, 의료기기 사업을 영위함.",
    englishName: "VF Pharma Co., Ltd.",
    marketCapBillion: 89,
    enterpriseValueBillion: 38,
    ceos: ["와타나베 시게오", "김연수"],
    foundedYear: 1956,
    ipoDate: "1972년 9월 5일",
    sharesOutstanding: 111_250_000,
    revenueComposition: [
      { label: "백신·면역", ratio: 38 },
      { label: "만성질환 의약품", ratio: 27 },
      { label: "특수 의약품(혈청)", ratio: 21 },
      { label: "의료기기", ratio: 9 },
      { label: "연구 라이센싱", ratio: 5 },
    ],
    mainBusinesses: [
      { label: "백신", rank: "시가총액 2위" },
      { label: "특수의약", rank: "시가총액 1위" },
      { label: "의료기기", rank: "시가총액 4위" },
    ],
  },
  BPE: {
    ticker: "BPE",
    description:
      "블랙피라미드에서 생산되는 전력을 전 세계에 송배전하는 단일 에너지 기업. 자체 발전소 운영 및 ESS 사업도 영위.",
    englishName: "BlackPyramid Energy Corp.",
    marketCapBillion: 220,
    enterpriseValueBillion: 124,
    ceos: ["알렉스 모로", "라이언 콜드웰"],
    foundedYear: 1981,
    ipoDate: "1993년 12월 1일",
    sharesOutstanding: 220_000_000,
    revenueComposition: [
      { label: "송배전 라이센스", ratio: 58 },
      { label: "발전소 운영", ratio: 24 },
      { label: "에너지 저장(ESS)", ratio: 11 },
      { label: "R&D 라이센싱", ratio: 7 },
    ],
    mainBusinesses: [
      { label: "에너지 라이센싱", rank: "독점" },
      { label: "발전", rank: "시가총액 1위" },
      { label: "ESS", rank: "시가총액 2위" },
    ],
  },
  ART: {
    ticker: "ART",
    description:
      "오로라 판데믹 이후 2018년 창설된 중국계 생명공학·광원 융합 기업. 오로라 바이러스 백신 및 광원화 응용 기술 보유.",
    englishName: "AuroraTech Biolab",
    marketCapBillion: 144,
    enterpriseValueBillion: 67,
    ceos: ["첸 윈펑", "리 자오민"],
    foundedYear: 2018,
    ipoDate: "2022년 4월 27일",
    sharesOutstanding: 120_000_000,
    revenueComposition: [
      { label: "오로라 백신", ratio: 51 },
      { label: "광원화 응용", ratio: 26 },
      { label: "진단·의료 기기", ratio: 13 },
      { label: "라이센스 수익", ratio: 10 },
    ],
    mainBusinesses: [
      { label: "오로라 백신", rank: "시가총액 1위" },
      { label: "광원화 응용", rank: "독점" },
      { label: "의료기기", rank: "시가총액 7위" },
    ],
  },
  GN3: {
    ticker: "GN3",
    description:
      "1933년 설립된 글로벌 자산 운용 명가. 사모펀드·헤지펀드·투자은행(IB) 사업을 33개국에서 운영하는 다국적 금융 그룹.",
    englishName: "Genius 33 Capital",
    marketCapBillion: 350,
    enterpriseValueBillion: 185,
    ceos: ["헬렌 야마구치", "마틴 베른슈타인"],
    foundedYear: 1933,
    ipoDate: "1968년 10월 14일",
    sharesOutstanding: 100_000_000,
    revenueComposition: [
      { label: "사모펀드 운용", ratio: 39 },
      { label: "헤지펀드", ratio: 26 },
      { label: "투자은행(IB)", ratio: 22 },
      { label: "자산관리(WM)", ratio: 13 },
    ],
    mainBusinesses: [
      { label: "사모펀드", rank: "시가총액 1위" },
      { label: "IB", rank: "시가총액 3위" },
      { label: "자산운용", rank: "시가총액 2위" },
    ],
  },
  SPZ: {
    ticker: "SPZ",
    description:
      "2008년 설립된 우주항공·방산·AI·전기차 콤글로머릿. 위성 발사체·자율주행 EV·군사 AI 전 영역에서 글로벌 선두.",
    englishName: "Space Zero Industries",
    marketCapBillion: 12_400,
    enterpriseValueBillion: 8_620,
    ceos: ["요한 스미스"],
    foundedYear: 2008,
    ipoDate: "2014년 6월 26일",
    sharesOutstanding: 1_240_000_000,
    revenueComposition: [
      { label: "우주 발사체·위성", ratio: 32 },
      { label: "전기차·EV 인프라", ratio: 28 },
      { label: "방산·군사 AI", ratio: 22 },
      { label: "자율주행 솔루션", ratio: 12 },
      { label: "기타(반도체 등)", ratio: 6 },
    ],
    mainBusinesses: [
      { label: "발사체", rank: "시가총액 1위" },
      { label: "EV", rank: "시가총액 2위" },
      { label: "군사 AI", rank: "시가총액 1위" },
      { label: "자율주행", rank: "시가총액 1위" },
    ],
  },
};

/* ── Lookup ── */

export function getStockInfo(ticker: string): StockInfo | undefined {
  return STOCK_INFO[ticker];
}

export interface StockValuation {
  marketCapBillion: number;
  enterpriseValueBillion: number;
}

const CREDIT_VALUE_UNIT = 100_000_000;

export function calculateStockValuation(
  info: StockInfo,
  currentPrice: number,
  basePrice: number,
): StockValuation {
  const safeBasePrice = Number.isFinite(basePrice) && basePrice > 0
    ? basePrice
    : currentPrice;
  const safeCurrentPrice =
    Number.isFinite(currentPrice) && currentPrice > 0
      ? currentPrice
      : safeBasePrice;
  const priceRatio = safeBasePrice > 0 ? safeCurrentPrice / safeBasePrice : 1;

  return {
    marketCapBillion: Math.round(
      (safeCurrentPrice * info.sharesOutstanding) / CREDIT_VALUE_UNIT,
    ),
    enterpriseValueBillion: Math.round(
      info.enterpriseValueBillion * priceRatio,
    ),
  };
}

/* ── Formatters (server-safe — React/DOM 의존 없음) ── */

/**
 * 10억 단위(`marketCapBillion`) → 한글 단위 문자열 변환.
 *
 *   12300 → "1조 2,300억"
 *   124000 → "12조 4,000억"
 *   720 → "720억"
 *
 * `Math.floor(value / 10_000)` 로 조 단위 분리 후, 나머지를 억 단위로 표기.
 * 0 인 경우 "0억" 반환. 음수는 가정하지 않음 (게임 머니 양수만).
 */
export function formatBillionToKor(billion: number): string {
  if (!Number.isFinite(billion) || billion <= 0) return "0억";
  const trillion = Math.floor(billion / 10_000);
  const remainder = billion % 10_000;
  if (trillion === 0) {
    return `${remainder.toLocaleString()}억`;
  }
  if (remainder === 0) {
    return `${trillion.toLocaleString()}조`;
  }
  return `${trillion.toLocaleString()}조 ${remainder.toLocaleString()}억`;
}

/**
 * 매출 구성 슬라이스 색상 — brand color 기반 HSL lightness step.
 *
 * - brand color (`#RRGGBB`) 를 HSL 로 변환
 * - 각 슬라이스마다 lightness 를 ±10/±20 step 으로 배치 (인덱스 짝/홀 + 거리)
 * - 결과는 `hsl(H, S%, L%)` 문자열 (recharts Cell fill 에 직접 주입)
 *
 * 1개 슬라이스만 있으면 brand color 그대로. 5개 초과는 -30 ~ +30 사이 wrap.
 */
export function deriveRevenueSliceColors(
  brandColor: string,
  count: number,
): string[] {
  const hsl = hexToHsl(brandColor);
  if (!hsl) {
    // fallback — gold-dim 톤 그라데이션
    return Array.from({ length: count }, (_, i) => {
      const l = 50 + (i % 5) * 6 - 12;
      return `hsl(40, 30%, ${l}%)`;
    });
  }
  const [h, s, baseL] = hsl;
  // step sequence: 0, +10, -10, +20, -20, +5, -5, +15, -15 ...
  const steps = [0, 10, -10, 20, -20, 5, -5, 15, -15];
  return Array.from({ length: count }, (_, i) => {
    const step = steps[i % steps.length];
    const l = Math.max(22, Math.min(78, baseL + step));
    return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
  });
}

/** `#RRGGBB` → `[H, S, L]` (HSL — H: 0-360, S/L: 0-100). 실패 시 null. */
function hexToHsl(hex: string): [number, number, number] | null {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return null;
  const intVal = parseInt(match[1], 16);
  const r = ((intVal >> 16) & 0xff) / 255;
  const g = ((intVal >> 8) & 0xff) / 255;
  const b = (intVal & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}
