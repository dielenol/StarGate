export interface LoreStorageExecutionError {
  phase: "data-transaction" | "index-ddl";
  message: string;
}

export interface LoreStorageExecutionResult<TAppliedDataPlan> {
  status: "complete" | "failed-no-commit" | "commit-unknown" | "partial-apply";
  dataTransaction: "committed" | "aborted" | "unknown";
  indexDdl: "completed" | "not-started" | "failed";
  appliedDataPlan: TAppliedDataPlan | null;
  error: LoreStorageExecutionError | null;
}

export type DataCommitReconciliation =
  | "not-run"
  | "driver-confirmed-committed"
  | "driver-confirmed-aborted"
  | "no-op"
  | "state-consistent-with-abort"
  | "state-consistent-with-commit"
  | "unknown";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasUnknownTransactionCommitResult(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const labeled = error as {
    dataTransactionOutcomeUnknown?: unknown;
    errorLabels?: unknown;
    hasErrorLabel?: (label: string) => boolean;
  };
  if (labeled.dataTransactionOutcomeUnknown === true) return true;
  if (typeof labeled.hasErrorLabel === "function") {
    return labeled.hasErrorLabel("UnknownTransactionCommitResult");
  }
  return Array.isArray(labeled.errorLabels) &&
    labeled.errorLabels.includes("UnknownTransactionCommitResult");
}

function markDataTransactionOutcomeUnknown(error: unknown): Error {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { dataTransactionOutcomeUnknown?: unknown })
      .dataTransactionOutcomeUnknown === true
  ) {
    return error as Error;
  }
  const wrapped = new Error(errorMessage(error), { cause: error });
  Object.defineProperty(wrapped, "dataTransactionOutcomeUnknown", {
    value: true,
    enumerable: false,
  });
  return wrapped;
}

/**
 * Callback이 mutation을 시작한 뒤 driver가 label 없는 timeout/network 오류를
 * 반환해도 abort로 단정하지 않는다. 호출자는 첫 mutation 직전에 mark를 호출한다.
 */
export async function guardDataTransactionOutcome<T>(
  execute: (markMutationAttempted: () => void) => Promise<T>,
): Promise<T> {
  let mutationAttempted = false;
  try {
    return await execute(() => {
      mutationAttempted = true;
    });
  } catch (error) {
    if (!mutationAttempted) throw error;
    throw markDataTransactionOutcomeUnknown(error);
  }
}

export function reconcileDataTransactionCommit(options: {
  dataTransaction: LoreStorageExecutionResult<unknown>["dataTransaction"] | "not-run";
  approvedMutationCount: number;
  postReadAvailable: boolean;
  approvedDataPlanDigest: string;
  remainingDataPlanDigest: string;
  postconditionState: "verified" | "mismatch" | "unavailable";
}): DataCommitReconciliation {
  if (options.dataTransaction === "not-run") return "not-run";
  if (options.dataTransaction === "committed") {
    return "driver-confirmed-committed";
  }
  if (options.dataTransaction === "aborted") return "driver-confirmed-aborted";
  if (!options.postReadAvailable) return "unknown";
  if (options.approvedMutationCount === 0) return "no-op";
  if (options.postconditionState === "unavailable") return "unknown";
  if (options.remainingDataPlanDigest === options.approvedDataPlanDigest) {
    return options.postconditionState === "verified"
      ? "unknown"
      : "state-consistent-with-abort";
  }
  if (options.postconditionState === "verified") {
    return "state-consistent-with-commit";
  }
  return "unknown";
}

export async function observeInReadOnlySnapshot<T>(
  runTransaction: (
    callback: () => Promise<void>,
    options: { readConcern: { level: "snapshot" } },
  ) => Promise<unknown>,
  observe: () => Promise<T>,
): Promise<T> {
  let result: { value: T } | null = null;
  await runTransaction(async () => {
    result = { value: await observe() };
  }, { readConcern: { level: "snapshot" } });
  const observedResult = result as { value: T } | null;
  if (!observedResult) {
    throw new Error("read-only snapshot observation이 없습니다.");
  }
  return observedResult.value;
}

/**
 * Transactional data와 비원자적 index DDL의 phase 경계를 명시한다. DDL 실패는
 * 이미 commit된 data plan을 숨기지 않고 partial-apply audit으로 반환한다.
 */
export async function runLoreStorageExecutionPhases<TAppliedDataPlan>(options: {
  applyDataPlan: () => Promise<TAppliedDataPlan>;
  applyIndexDdl: () => Promise<void>;
}): Promise<LoreStorageExecutionResult<TAppliedDataPlan>> {
  let appliedDataPlan: TAppliedDataPlan;
  try {
    appliedDataPlan = await options.applyDataPlan();
  } catch (error) {
    const commitUnknown = hasUnknownTransactionCommitResult(error);
    return {
      status: commitUnknown ? "commit-unknown" : "failed-no-commit",
      dataTransaction: commitUnknown ? "unknown" : "aborted",
      indexDdl: "not-started",
      appliedDataPlan: null,
      error: { phase: "data-transaction", message: errorMessage(error) },
    };
  }

  try {
    await options.applyIndexDdl();
  } catch (error) {
    return {
      status: "partial-apply",
      dataTransaction: "committed",
      indexDdl: "failed",
      appliedDataPlan,
      error: { phase: "index-ddl", message: errorMessage(error) },
    };
  }

  return {
    status: "complete",
    dataTransaction: "committed",
    indexDdl: "completed",
    appliedDataPlan,
    error: null,
  };
}
