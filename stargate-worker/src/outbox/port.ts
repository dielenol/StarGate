import type {
  IntegrationOutboxEvent,
  IntegrationOutboxKind,
} from "@stargate/shared-db";

export interface IntegrationOutboxDeliveryHandler {
  readonly kind: IntegrationOutboxKind;
  /**
   * 성공적으로 외부 전달했거나 정책상 영구 skip이면 resolve한다.
   * 재시도해야 하는 오류는 throw한다.
   */
  deliver(event: IntegrationOutboxEvent): Promise<void>;
}

/**
 * persistence 구현은 @stargate/shared-db가 소유한다.
 * worker는 이 port를 통해서만 범용 outbox를 claim/complete/release한다.
 */
export interface IntegrationOutboxPort {
  claimDue(now: Date): Promise<IntegrationOutboxEvent | null>;
  complete(input: {
    id: NonNullable<IntegrationOutboxEvent["_id"]>;
    leaseToken: string;
    completedAt: Date;
  }): Promise<boolean>;
  fail(input: {
    id: NonNullable<IntegrationOutboxEvent["_id"]>;
    leaseToken: string;
    attempts: number;
    error: unknown;
    failedAt: Date;
  }): Promise<"PENDING" | "DEAD" | null>;
}
