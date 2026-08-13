export type StockScheduledEventStatus = "PENDING" | "APPLIED" | "CANCELLED";
export type StockScheduledEventTier = "scenario" | "shock";

export interface StockScheduledEventActor {
  id: string;
  displayName: string;
}
/** GM이 지정한 정기 시세 슬롯에서 한 번만 적용되는 예약 이벤트. */
export interface StockScheduledEvent {
  /** `stock-event:{KST date}:{ticker}` — ticker/date당 하나의 lifecycle만 허용한다. */
  _id: string;
  ticker: string;
  kstDate: string;
  executeAt: Date;
  changePercent: number;
  eventText: string;
  eventTier: StockScheduledEventTier;
  status: StockScheduledEventStatus;
  createdBy: StockScheduledEventActor;
  createdAt: Date;
  updatedAt: Date;
  cancelledBy?: StockScheduledEventActor;
  cancelledAt?: Date;
  appliedAt?: Date;
  appliedOperationKey?: string;
}
