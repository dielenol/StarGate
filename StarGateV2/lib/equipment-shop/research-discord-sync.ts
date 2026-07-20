export interface ResearchDiscordCardLease {
  projectKey: string;
  requestedRevision: number;
  messageId?: string;
  leaseToken: string;
}

export interface ResearchDiscordCardSyncDependencies<TPayload> {
  newLeaseToken(): string;
  acquire(
    projectKey: string,
    leaseToken: string,
  ): Promise<ResearchDiscordCardLease | null>;
  buildPayload(projectKey: string): Promise<TPayload>;
  deleteMessage(messageId: string): Promise<void>;
  createMessage(payload: TPayload): Promise<string>;
  complete(args: {
    projectKey: string;
    leaseToken: string;
    syncedRevision: number;
    messageId: string;
  }): Promise<boolean>;
  confirm(args: {
    projectKey: string;
    syncedRevision: number;
    messageId: string;
  }): Promise<boolean>;
  fail(args: {
    projectKey: string;
    leaseToken: string;
    error: string;
  }): Promise<void>;
  warn?(message: string, error?: unknown): void;
}

export type ResearchDiscordCardSyncResult =
  | "synced"
  | "idle"
  | "failed"
  | "pass_limit";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function drainResearchDiscordCardSync<TPayload>(
  projectKey: string,
  dependencies: ResearchDiscordCardSyncDependencies<TPayload>,
  maxPasses = 10,
): Promise<ResearchDiscordCardSyncResult> {
  let synced = false;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const leaseToken = dependencies.newLeaseToken();
    let lease: ResearchDiscordCardLease | null;
    try {
      lease = await dependencies.acquire(projectKey, leaseToken);
    } catch (error) {
      dependencies.warn?.(
        `[research-discord] lease 획득 실패 key=${projectKey}`,
        error,
      );
      return "failed";
    }
    if (!lease) return synced ? "synced" : "idle";

    let newMessageId: string | null = null;
    try {
      const payload = await dependencies.buildPayload(projectKey);
      if (lease.messageId) {
        await dependencies.deleteMessage(lease.messageId);
      }
      newMessageId = await dependencies.createMessage(payload);
      const completion = {
        projectKey,
        leaseToken,
        syncedRevision: lease.requestedRevision,
        messageId: newMessageId,
      };
      let completed: boolean;
      try {
        completed = await dependencies.complete(completion);
      } catch (completionError) {
        let confirmed: boolean | null = null;
        try {
          confirmed = await dependencies.confirm({
            projectKey,
            syncedRevision: lease.requestedRevision,
            messageId: newMessageId,
          });
        } catch (confirmationError) {
          dependencies.warn?.(
            `[research-discord] 완료 응답 유실 후 상태 확인 실패 key=${projectKey}`,
            confirmationError,
          );
        }
        if (confirmed) {
          synced = true;
          continue;
        }
        if (confirmed === null) {
          return "failed";
        }
        throw completionError;
      }
      if (!completed) {
        await dependencies.deleteMessage(newMessageId).catch((error) =>
          dependencies.warn?.(
            `[research-discord] lease 상실 후 보상 삭제 실패 key=${projectKey}`,
            error,
          ),
        );
        return "failed";
      }
      synced = true;
    } catch (error) {
      if (newMessageId) {
        await dependencies.deleteMessage(newMessageId).catch((cleanupError) =>
          dependencies.warn?.(
            `[research-discord] 신규 메시지 보상 삭제 실패 key=${projectKey}`,
            cleanupError,
          ),
        );
      }
      await dependencies
        .fail({
          projectKey,
          leaseToken,
          error: errorMessage(error),
        })
        .catch((releaseError) =>
          dependencies.warn?.(
            `[research-discord] 실패 상태 기록 실패 key=${projectKey}`,
            releaseError,
          ),
        );
      dependencies.warn?.(
        `[research-discord] 카드 동기화 실패 key=${projectKey}`,
        error,
      );
      return "failed";
    }
  }

  return "pass_limit";
}
