export interface DiscordMessageBatchLease<TPayload> {
  requestedRevision: number;
  messageIds: string[];
  desiredPayloads: TPayload[];
  leaseToken: string;
}

export interface DiscordMessageBatchSyncDependencies<TPayload> {
  logPrefix: string;
  newLeaseToken(): string;
  acquire(leaseToken: string): Promise<DiscordMessageBatchLease<TPayload> | null>;
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

export type DiscordMessageBatchSyncResult =
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

export async function drainDiscordMessageBatchSync<TPayload>(
  dependencies: DiscordMessageBatchSyncDependencies<TPayload>,
  maxPasses = 10,
): Promise<DiscordMessageBatchSyncResult> {
  let synced = false;
  const prefix = `[${dependencies.logPrefix}]`;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const leaseToken = dependencies.newLeaseToken();
    let lease: DiscordMessageBatchLease<TPayload> | null;
    try {
      lease = await dependencies.acquire(leaseToken);
    } catch (error) {
      dependencies.warn?.(`${prefix} lease 획득 실패`, error);
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
          throw new Error("Discord message id 기록 전에 lease를 상실했습니다.");
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
            `${prefix} 완료 응답 유실 후 상태 확인 실패`,
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
              `${prefix} lease 상실 후 보상 삭제 실패`,
              error,
            ),
        );
        throw new Error("Discord batch 동기화 lease를 완료 전에 상실했습니다.");
      }
      synced = true;
    } catch (error) {
      if (newMessageIds.length > 0 && !completionUncertain) {
        await deleteMessages(newMessageIds, dependencies.deleteMessage).catch(
          (cleanupError) =>
            dependencies.warn?.(
              `${prefix} 신규 메시지 보상 삭제 실패`,
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
            `${prefix} 실패 상태 기록 실패`,
            releaseError,
          ),
        );
      dependencies.warn?.(`${prefix} batch 동기화 실패`, error);
      return "failed";
    }
  }

  return "pass_limit";
}
