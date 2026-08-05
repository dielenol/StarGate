import assert from "node:assert/strict";
import test from "node:test";

const {
  guardDataTransactionOutcome,
  observeInReadOnlySnapshot,
  reconcileDataTransactionCommit,
  runLoreStorageExecutionPhases,
} = await import(
  "../lore-storage-execution.ts"
);

test("remaining plan과 target verifier는 하나의 read-only snapshot에서 관찰한다", async () => {
  let live = { plan: "approved", target: "legacy" };
  let snapshot = null;
  const observed = await observeInReadOnlySnapshot(
    async (callback, options) => {
      assert.deepEqual(options, { readConcern: { level: "snapshot" } });
      snapshot = { ...live };
      live = { plan: "empty", target: "normalized" };
      await callback();
    },
    async () => {
      const plan = snapshot.plan;
      live = { plan: "approved", target: "legacy" };
      await Promise.resolve();
      return { plan, target: snapshot.target };
    },
  );

  assert.deepEqual(observed, { plan: "approved", target: "legacy" });
  assert.deepEqual(live, { plan: "approved", target: "legacy" });
});

test("data transaction 실패는 DDL을 시작하지 않고 no-commit으로 보고한다", async () => {
  let ddlCalls = 0;
  const result = await runLoreStorageExecutionPhases({
    applyDataPlan: async () => {
      throw new Error("snapshot drift");
    },
    applyIndexDdl: async () => {
      ddlCalls += 1;
    },
  });

  assert.deepEqual(result, {
    status: "failed-no-commit",
    dataTransaction: "aborted",
    indexDdl: "not-started",
    appliedDataPlan: null,
    error: { phase: "data-transaction", message: "snapshot drift" },
  });
  assert.equal(ddlCalls, 0);
});

test("mutation 전 실패는 확정 no-commit으로 유지한다", async () => {
  const result = await runLoreStorageExecutionPhases({
    applyDataPlan: () => guardDataTransactionOutcome(async () => {
      throw new Error("preflight drift");
    }),
    applyIndexDdl: async () => assert.fail("DDL을 시작하면 안 됩니다."),
  });

  assert.equal(result.status, "failed-no-commit");
  assert.equal(result.dataTransaction, "aborted");
});

test("mutation 시작 후 label 없는 timeout도 commit-unknown으로 fail-closed한다", async () => {
  const result = await runLoreStorageExecutionPhases({
    applyDataPlan: () => guardDataTransactionOutcome(async (markMutationAttempted) => {
      markMutationAttempted();
      throw new Error("Timed out during socket read");
    }),
    applyIndexDdl: async () => assert.fail("DDL을 시작하면 안 됩니다."),
  });

  assert.equal(result.status, "commit-unknown");
  assert.equal(result.dataTransaction, "unknown");
  assert.equal(result.indexDdl, "not-started");
  assert.equal(result.error?.message, "Timed out during socket read");
});

test("UnknownTransactionCommitResult는 미커밋으로 단정하지 않는다", async () => {
  let ddlCalls = 0;
  const commitError = new Error("commit acknowledgement lost");
  commitError.errorLabels = ["UnknownTransactionCommitResult"];
  const result = await runLoreStorageExecutionPhases({
    applyDataPlan: async () => {
      throw commitError;
    },
    applyIndexDdl: async () => {
      ddlCalls += 1;
    },
  });

  assert.deepEqual(result, {
    status: "commit-unknown",
    dataTransaction: "unknown",
    indexDdl: "not-started",
    appliedDataPlan: null,
    error: {
      phase: "data-transaction",
      message: "commit acknowledgement lost",
    },
  });
  assert.equal(ddlCalls, 0);
});

test("commit-unknown은 post-read plan으로 commit/abort/unknown을 조정한다", () => {
  const base = {
    dataTransaction: "unknown",
    approvedMutationCount: 2,
    postReadAvailable: true,
    approvedDataPlanDigest: "approved",
  };
  assert.equal(
    reconcileDataTransactionCommit({
      ...base,
      remainingDataPlanDigest: "approved",
      postconditionState: "mismatch",
    }),
    "state-consistent-with-abort",
  );
  assert.equal(
    reconcileDataTransactionCommit({
      ...base,
      remainingDataPlanDigest: "approved",
      postconditionState: "verified",
    }),
    "unknown",
    "같은 snapshot에서 plan과 exact postcondition이 모순되면 확정하면 안 됨",
  );
  assert.equal(
    reconcileDataTransactionCommit({
      ...base,
      remainingDataPlanDigest: "empty",
      postconditionState: "verified",
    }),
    "state-consistent-with-commit",
  );
  assert.equal(
    reconcileDataTransactionCommit({
      ...base,
      postReadAvailable: false,
      remainingDataPlanDigest: "unknown",
      postconditionState: "unavailable",
    }),
    "unknown",
  );
  assert.equal(
    reconcileDataTransactionCommit({
      ...base,
      remainingDataPlanDigest: "planner-target-disappeared",
      postconditionState: "mismatch",
    }),
    "unknown",
    "target 삭제나 invalid-row 이동으로 plan이 사라져도 commit으로 확정하면 안 됨",
  );
});

test("data commit 후 DDL 실패는 적용 plan을 보존한 partial-apply다", async () => {
  const applied = { loreBackfill: 3, seedCompatibility: ["TIME"] };
  const result = await runLoreStorageExecutionPhases({
    applyDataPlan: async () => applied,
    applyIndexDdl: async () => {
      throw new Error("IndexKeySpecsConflict");
    },
  });

  assert.deepEqual(result, {
    status: "partial-apply",
    dataTransaction: "committed",
    indexDdl: "failed",
    appliedDataPlan: applied,
    error: { phase: "index-ddl", message: "IndexKeySpecsConflict" },
  });
});

test("두 phase 성공은 complete audit을 반환한다", async () => {
  const applied = { loreBackfill: 0, seedCompatibility: [] };
  const result = await runLoreStorageExecutionPhases({
    applyDataPlan: async () => applied,
    applyIndexDdl: async () => {},
  });

  assert.deepEqual(result, {
    status: "complete",
    dataTransaction: "committed",
    indexDdl: "completed",
    appliedDataPlan: applied,
    error: null,
  });
});
