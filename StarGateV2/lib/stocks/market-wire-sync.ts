export interface StockMarketWireLease<TPayload> {
  requestedRevision: number;
  messageIds: string[];
  desiredPayloads: TPayload[];
  leaseToken: string;
}

export interface StockMarketWireSyncDependencies<TPayload> {
  newLeaseToken(): string;
  acquire(leaseToken: string): Promise<StockMarketWireLease<TPayload> | null>;
  deleteMessage(messageId: string): Promise<void>;
  createMessage(payload: TPayload): Promise<string>;
  recordInflight(args: {
    leaseToken: string;
    messageIds: string[];
  }): Promise<boolean>;
  complete(args: {
    leaseToken: string;
    syncedRevision: number;
    messageIds: string[];
  }): Promise<boolean>;
  confirm(args: {
    syncedRevision: number;
    messageIds: string[];
  }): Promise<boolean>;
  fail(args: {
    leaseToken: string;
    error: string;
    cleanupMessageIds: string[];
  }): Promise<void>;
  warn?(message: string, error?: unknown): void;
}

export type StockMarketWireSyncResult =
  | "synced"
  | "idle"
  | "failed"
  | "pass_limit";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function deleteMessages(
  messageIds: readonly string[],
  deleteMessage: (messageId: string) => Promise<void>,
): Promise<void> {
  for (const messageId of messageIds) {
    await deleteMessage(messageId);
  }
}

export async function drainStockMarketWireSync<TPayload>(
  dependencies: StockMarketWireSyncDependencies<TPayload>,
  maxPasses = 10,
): Promise<StockMarketWireSyncResult> {
  let synced = false;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const leaseToken = dependencies.newLeaseToken();
    let lease: StockMarketWireLease<TPayload> | null;
    try {
      lease = await dependencies.acquire(leaseToken);
    } catch (error) {
      dependencies.warn?.("[stock-market-wire] lease 획득 실패", error);
      return "failed";
    }
    if (!lease) return synced ? "synced" : "idle";

    const newMessageIds: string[] = [];
    let completionUncertain = false;
    try {
      await deleteMessages(lease.messageIds, dependencies.deleteMessage);
      for (const payload of lease.desiredPayloads) {
        newMessageIds.push(await dependencies.createMessage(payload));
        const inflightRecorded = await dependencies.recordInflight({
          leaseToken,
          messageIds: newMessageIds,
        });
        if (!inflightRecorded) {
          throw new Error("주식 공시 message id 기록 전에 lease를 상실했습니다.");
        }
      }

      const completion = {
        leaseToken,
        syncedRevision: lease.requestedRevision,
        messageIds: newMessageIds,
      };
      let completed: boolean;
      try {
        completed = await dependencies.complete(completion);
      } catch (completionError) {
        let confirmed: boolean | null = null;
        try {
          confirmed = await dependencies.confirm({
            syncedRevision: lease.requestedRevision,
            messageIds: newMessageIds,
          });
        } catch (confirmationError) {
          completionUncertain = true;
          dependencies.warn?.(
            "[stock-market-wire] 완료 응답 유실 후 상태 확인 실패",
            confirmationError,
          );
        }
        if (confirmed) {
          synced = true;
          continue;
        }
        if (completionUncertain) return "failed";
        throw completionError;
      }

      if (!completed) {
        await deleteMessages(newMessageIds, dependencies.deleteMessage).catch(
          (error) =>
            dependencies.warn?.(
              "[stock-market-wire] lease 상실 후 보상 삭제 실패",
              error,
            ),
        );
        throw new Error("주식 공시 동기화 lease를 완료 전에 상실했습니다.");
      }
      synced = true;
    } catch (error) {
      if (newMessageIds.length > 0 && !completionUncertain) {
        await deleteMessages(newMessageIds, dependencies.deleteMessage).catch(
          (cleanupError) =>
            dependencies.warn?.(
              "[stock-market-wire] 신규 메시지 보상 삭제 실패",
              cleanupError,
            ),
        );
      }
      await dependencies
        .fail({
          leaseToken,
          error: errorMessage(error),
          cleanupMessageIds: newMessageIds,
        })
        .catch((releaseError) =>
          dependencies.warn?.(
            "[stock-market-wire] 실패 상태 기록 실패",
            releaseError,
          ),
        );
      dependencies.warn?.("[stock-market-wire] 공시 동기화 실패", error);
      return "failed";
    }
  }

  return "pass_limit";
}
