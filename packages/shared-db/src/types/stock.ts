import type { ObjectId } from "mongodb";

/**
 * 주식 가격 시계열 스냅샷 (ticker 별 단일 문서).
 *
 * - price / prevPrice: 0.01 단위 숫자.
 * - lastUpdate: KST 'YYYY-MM-DD HH:mm' 문자열.
 *   UTC Date 가 아닌 문자열을 쓰는 이유는 KST 기준 표시 일관성 + 봇 호환.
 */
export interface StockPrice {
  _id?: ObjectId;
  ticker: string;
  price: number;
  prevPrice: number;
  eventText: string;
  lastUpdate: string;
  /** 개별 종목 거래정지. 기존 문서의 필드 누락은 false로 해석한다. */
  isTradingHalted?: boolean;
  /** 매매 claim과 거래정지 변경을 같은 문서 write로 직렬화하는 revision. */
  tradeRevision?: number;
  /** 동일 ticker 기업행동 예약을 transaction 안에서 직렬화하는 revision. */
  corporateActionRevision?: number;
  /** NOVEX 2.0 동적 적정가. 전환 전 문서는 price를 적정가로 해석한다. */
  referencePrice?: number;
  /** 급격한 변동 뒤 자동 냉각 종료 시각. 수동 거래정지와 독립 상태다. */
  cooldownUntil?: Date;
  cooldownReason?: string;
  /** GM exact override 때 다음 회차로 넘긴 기본 변동 기여도. */
  pendingBasePercent?: number;
  /** 정방향 액면분할 누적계수. 기존 문서는 1로 해석한다. */
  cumulativeSplitFactor?: number;
  /** 유상증자 누적 발행주식 증가계수. 액면분할과 별도 도메인으로 유지한다. */
  cumulativeCapitalIncreaseFactor?: number;
  /** 예약 단계에서 같은 종목의 수동 halt/resume과 기업행동 생성을 막는 owner. */
  corporateActionReservationId?: string;
  /** 발표 뒤 거래정지를 소유하는 유상증자 action id. */
  corporateActionHaltId?: string;
  corporateActionHaltReason?: string;
  corporateActionResumeSlotKey?: string;
}

export type CreateStockPriceInput = Omit<StockPrice, "_id">;

/**
 * 주식 보유량 (character × ticker).
 *
 * - shares < 0 금지 (CRUD 단계 atomic guard 로 강제).
 * - avgPrice: 가중평균 매수단가 (0.01 단위 반올림).
 *   newAvg = round((oldShares * oldAvg + buyShares * buyPrice) / (oldShares + buyShares), 2)
 *
 * characterId 는 Character._id.toHexString() (ObjectId 문자열).
 * (Phase 2 ledger 가 character 단위로 전환됨 → holdings 도 같은 키로 정합.)
 */
export interface StockHolding {
  _id?: ObjectId;
  characterId: string;
  ticker: string;
  shares: number;
  avgPrice: number;
  updatedAt: Date;
}

export type CreateStockHoldingInput = Omit<StockHolding, "_id">;

/**
 * 주식 가격 변동 시계열 로그 (ticker × event).
 *
 * - StockPrice 가 "현재 스냅샷" 이라면 본 컬렉션은 차트/이력 표시용 append-only.
 * - createdAt 기준 영구 보관. 기존 TTL은 NOVEX 전환 migration에서 제거한다.
 * - source: 가격 변동 사유 분류.
 *   - "scheduled": tia_bot 스케줄 갱신.
 *   - "trade": 매매로 인한 가격 변동.
 *   - "gm-event": GM 수동 이벤트 (폭락/폭등 등).
 * - operationKey: 예약 실행만 사용하는 ticker/slot 멱등 키.
 */
export interface StockPriceHistory {
  _id?: ObjectId;
  /** 예약 시세 변경의 ticker/slot 멱등 키. 수동/거래 이력에는 없을 수 있다. */
  operationKey?: string;
  ticker: string;
  price: number;
  prevPrice: number;
  eventText?: string;
  eventTier?: "routine" | "scenario" | "shock";
  source: "scheduled" | "trade" | "gm-event" | "dividend" | "split" | "rights-offering";
  /** NOVEX 가격 회차 키(KST `YYYY-MM-DD HH:mm`). */
  slotKey?: string;
  /**
   * 경제적으로 가격이 유효해진 시각. 지연 회차·기업행동은 실제 insert 시각과
   * 다를 수 있으며, 필드가 없는 레거시 문서는 createdAt을 사용한다.
   */
  effectiveAt?: Date;
  /** 같은 effectiveAt에서 배당락(10) → 분할(20) → 가격 회차(30) 순서를 보존한다. */
  effectiveSequence?: number;
  /** 지연 실행에서 하나로 합쳐진 원본 회차들. */
  mergedSlotKeys?: string[];
  delayed?: boolean;
  referencePrice?: number;
  basePercent?: number;
  flowPercent?: number;
  disclosurePercent?: number;
  disclosureIds?: string[];
  splitFactor?: number;
  capitalIncreaseFactor?: number;
  /** 조회 시 이후 액면분할을 누적 반영한 차트용 보정값. DB 원문에는 없을 수 있다. */
  adjustedPrice?: number;
  adjustedReferencePrice?: number;
  cumulativeSplitFactor?: number;
  cumulativeCapitalIncreaseFactor?: number;
  createdAt: Date;
}

/**
 * append-only 시계열 입력. createdAt 은 CRUD 가 항상 now 로 부여 (호출자 주입 금지).
 *
 * 다른 컬렉션(예: createCreditTransaction) 과 동일하게 createdAt 도 Omit 대상.
 */
export type CreateStockPriceHistoryInput = Omit<
  StockPriceHistory,
  "_id" | "createdAt"
>;

export interface MrBeastSodaStockImpactDemand {
  _id: string;
  promotion: "mrbeast-soda-stm-v1";
  ticker: "STM";
  eventId: string;
  configVersion: number;
  startAt: Date;
  endAt: Date;
  soldQuantity: number;
  appliedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
  lastAppliedAt?: Date;
  lastAppliedOperationKey?: string;
  backfilledAt?: Date;
  backfillSource?: "shop_daily_purchase_counters";
}
