import {
  claimDueResearchLabJob,
  claimDueResearchLabReminder,
  claimDueResearchLabSignal,
  completeResearchLabReminder,
  completeResearchLabSignal,
  countHaltedResearchLabJobs,
  createNotificationOnce,
  enqueueIntegrationOutbox,
  getDb,
  haltExhaustedResearchLabJobs,
  processClaimedResearchLabJob,
  releaseResearchLabJobLease,
  releaseResearchLabReminderLease,
  releaseResearchLabSignalLease,
  renewResearchLabReminderLease,
  renewResearchLabSignalLease,
  startIdleResearchLabJobs,
  usersCol,
  type ResearchLabJob,
  type ResearchLabSignalKind,
  type ResearchLabWorkerResult,
  RESEARCH_CLAIM_WINDOW_MS,
  RESEARCH_LAB_INDEX_DEFINITIONS,
} from "@stargate/shared-db";

import type { ConsumerTickResult, DueWorkConsumerPort } from "./port.js";

const LINK = "/erp/research";
const REQUIRED_CATALOG_ITEMS = new Map([
  ["zulu-0028-contained-entity", "SPECIAL"],
  ["broken-syllable", "MATERIAL"],
  ["zulu-0040-crown-specimen", "SPECIAL"],
  ["zulu-0040-crown-mycelium-fragment", "MATERIAL"],
  ["inverted-sock-contained-entity", "SPECIAL"],
  ["aurora-virus-black-smoke-sample", "MATERIAL"],
]);

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableObject(child)]),
  );
}

function sameIndexValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableObject(left)) === JSON.stringify(stableObject(right));
}

export async function assertResearchLabStorageReady(): Promise<void> {
  const db = await getDb();
  for (const [collectionName, definitions] of Object.entries(
    RESEARCH_LAB_INDEX_DEFINITIONS,
  )) {
    const actual = await db.collection(collectionName).listIndexes().toArray();
    for (const expected of definitions) {
      const index = actual.find((candidate) => candidate.name === expected.name);
      if (
        !index ||
        !sameIndexValue(index.key, expected.key) ||
        Boolean(index.unique) !== Boolean(expected.unique) ||
        !sameIndexValue(
          index.partialFilterExpression,
          expected.partialFilterExpression,
        )
      ) {
        throw new Error(
          `research-lab storage index가 준비되지 않았습니다: ${collectionName}.${expected.name}`,
        );
      }
    }
  }
  const catalogItems = await db
    .collection<{ slug: string; category: string }>("master_items")
    .find({ slug: { $in: [...REQUIRED_CATALOG_ITEMS.keys()] } })
    .project({ slug: 1, category: 1 })
    .toArray();
  const catalogBySlug = new Map(
    catalogItems.map((item) => [item.slug, item.category]),
  );
  for (const [slug, category] of REQUIRED_CATALOG_ITEMS) {
    if (catalogBySlug.get(slug) !== category) {
      throw new Error(
        `research-lab catalog item이 준비되지 않았습니다: ${slug}:${category}`,
      );
    }
  }
}

export interface ResearchLabConsumerPort {
  assertReady(): Promise<void>;
  haltExhausted(now: Date): Promise<number>;
  countHalted(): Promise<number>;
  startIdle(now: Date): Promise<ResearchLabJob[]>;
  claimProduction(now: Date): Promise<ResearchLabJob | null>;
  processProduction(input: {
    id: string;
    leaseToken: string;
    now: Date;
  }): Promise<ResearchLabWorkerResult | null>;
  releaseProduction(input: {
    id: string;
    leaseToken: string;
    error: unknown;
    now: Date;
  }): Promise<"RETRY" | "HALTED" | null>;
  claimSignal(now: Date): Promise<ResearchLabJob | null>;
  deliverSignal(job: ResearchLabJob): Promise<void>;
  completeSignal(input: {
    id: string;
    signalLeaseToken: string;
    expectedSignal: ResearchLabSignalKind;
    now: Date;
  }): Promise<boolean>;
  releaseSignal(input: {
    id: string;
    signalLeaseToken: string;
  }): Promise<boolean>;
  claimReminder(now: Date): Promise<ResearchLabJob | null>;
  deliverReminder(job: ResearchLabJob): Promise<void>;
  completeReminder(input: {
    id: string;
    reminderLeaseToken: string;
    now: Date;
  }): Promise<boolean>;
  releaseReminder(input: {
    id: string;
    reminderLeaseToken: string;
  }): Promise<boolean>;
}

function jobId(job: ResearchLabJob): string {
  if (!job._id) throw new Error("연구 작업 ID가 없습니다.");
  return String(job._id);
}

export function researchLabPartitionOrderAt(
  job: ResearchLabJob,
  event: ResearchLabSignalKind | "CHARACTER_CLAIM_REMINDER",
): Date {
  if (event === "CHARACTER_CLAIMABLE") {
    return job.claimDeadline
      ? new Date(job.claimDeadline.getTime() - RESEARCH_CLAIM_WINDOW_MS)
      : job.updatedAt;
  }
  if (event === "CHARACTER_CLAIM_REMINDER") {
    return job.claimReminderAt ?? job.updatedAt;
  }
  return job.completedAt ?? job.updatedAt;
}

async function enqueueDm(
  job: ResearchLabJob,
  event: ResearchLabSignalKind | "CHARACTER_CLAIM_REMINDER",
): Promise<void> {
  const timestamp = researchLabPartitionOrderAt(job, event);
  await enqueueIntegrationOutbox({
    kind: "RESEARCH_LAB_DM",
    dedupeKey: `research-lab:${jobId(job)}:${event}:dm`,
    partitionKey: `research-lab:${job.requesterUserId}`,
    partitionOrderAt: timestamp,
    payload: {
      event,
      userId: job.requesterUserId,
      jobId: jobId(job),
      recipeId: job.recipeId,
      outputName: job.output.name,
      timestamp: timestamp.toISOString(),
      ...(job.claimDeadline
        ? { claimDeadline: job.claimDeadline.toISOString() }
        : {}),
    },
  });
}

async function notifyRequester(
  job: ResearchLabJob,
  suffix: string,
  title: string,
  message: string,
): Promise<void> {
  await createNotificationOnce({
    userId: job.requesterUserId,
    dedupeKey: `research-lab:${jobId(job)}:${suffix}:erp`,
    type: "SYSTEM",
    title,
    message,
    link: LINK,
  });
}

async function deliverResearchLabSignal(job: ResearchLabJob): Promise<void> {
  const signal = job.pendingSignals?.[0];
  if (!signal) throw new Error("연구 작업 pendingSignals가 없습니다.");
  if (signal === "CHARACTER_CLAIMABLE") {
    if (!job.signalLeaseToken) {
      throw new Error("연구 작업 signal lease token이 없습니다.");
    }
    const fenced = await renewResearchLabSignalLease({
      id: jobId(job),
      signalLeaseToken: job.signalLeaseToken,
      expectedSignal: signal,
    });
    if (!fenced) return;
  }
  switch (signal) {
    case "INITIAL_COMPLETED": {
      await notifyRequester(
        job,
        "initial-requester",
        "최초 연구가 완료되었습니다",
        `${job.recipeId} 연구선이 개방되고 ${job.output.name}이 공용 인벤토리에 지급되었습니다.`,
      );
      const activeUsers = await (await usersCol())
        .find({ status: "ACTIVE" })
        .project({ _id: 1 })
        .toArray();
      for (const user of activeUsers) {
        if (!user._id) continue;
        await createNotificationOnce({
          userId: String(user._id),
          dedupeKey: `research-lab:${jobId(job)}:unlock:${String(user._id)}:erp`,
          type: "SYSTEM",
          title: "새 연구선이 개방되었습니다",
          message: `${job.recipeId} 반복 생산을 이용할 수 있습니다.`,
          link: LINK,
        });
      }
      await enqueueDm(job, signal);
      return;
    }
    case "SHARED_COMPLETED":
      await notifyRequester(
        job,
        "shared-completed",
        "공용 연구 생산이 완료되었습니다",
        `${job.output.name} ${job.output.quantity}개가 공용 인벤토리에 지급되었습니다.`,
      );
      await enqueueDm(job, signal);
      return;
    case "CHARACTER_CLAIMABLE":
      await notifyRequester(
        job,
        "claimable",
        "개인 연구 산출물을 수령할 수 있습니다",
        `${job.output.name}을 6시간 안에 수령해 주세요. 미수령 시 공용 인벤토리로 전환됩니다.`,
      );
      await enqueueDm(job, signal);
      return;
    case "CHARACTER_DIVERTED":
      await notifyRequester(
        job,
        "diverted",
        "미수령 연구 산출물이 공용으로 전환되었습니다",
        `${job.output.name}이 수령 기한 만료로 공용 인벤토리에 지급되었습니다.`,
      );
      await enqueueDm(job, signal);
      return;
  }
}

async function deliverResearchLabReminder(job: ResearchLabJob): Promise<void> {
  if (!job.reminderLeaseToken) {
    throw new Error("연구 작업 reminder lease token이 없습니다.");
  }
  const fenced = await renewResearchLabReminderLease({
    id: jobId(job),
    reminderLeaseToken: job.reminderLeaseToken,
  });
  if (!fenced) return;
  await notifyRequester(
    job,
    "claim-reminder",
    "개인 연구 산출물 수령 마감 1시간 전입니다",
    `${job.output.name}을 수령하지 않으면 공용 인벤토리로 전환됩니다.`,
  );
  await enqueueDm(job, "CHARACTER_CLAIM_REMINDER");
}

export function createSharedDbResearchLabPort(): ResearchLabConsumerPort {
  return {
    assertReady: assertResearchLabStorageReady,
    haltExhausted: haltExhaustedResearchLabJobs,
    countHalted: countHaltedResearchLabJobs,
    startIdle: startIdleResearchLabJobs,
    claimProduction: (now) => claimDueResearchLabJob({ now }),
    processProduction: ({ id, leaseToken, now }) =>
      processClaimedResearchLabJob({ id, leaseToken, now }),
    releaseProduction: releaseResearchLabJobLease,
    claimSignal: (now) => claimDueResearchLabSignal({ now }),
    deliverSignal: deliverResearchLabSignal,
    completeSignal: completeResearchLabSignal,
    releaseSignal: releaseResearchLabSignalLease,
    claimReminder: (now) => claimDueResearchLabReminder({ now }),
    deliverReminder: deliverResearchLabReminder,
    completeReminder: completeResearchLabReminder,
    releaseReminder: releaseResearchLabReminderLease,
  };
}

export class ResearchLabConsumer implements DueWorkConsumerPort {
  readonly name = "research-lab";

  constructor(
    private readonly port: ResearchLabConsumerPort = createSharedDbResearchLabPort(),
  ) {}

  async tick(): Promise<ConsumerTickResult> {
    await this.port.assertReady();
    const now = new Date();
    const newlyHalted = await this.port.haltExhausted(now);
    const started = await this.port.startIdle(now);
    let observedDue = started.length;
    let claimed = 0;
    let delivered = 0;
    let failed = 0;
    let dead = newlyHalted;

    const production = await this.port.claimProduction(now);
    if (production) {
      observedDue += 1;
      claimed += 1;
      const id = jobId(production);
      if (!production.leaseToken) {
        throw new Error("claim된 연구 작업 leaseToken이 없습니다.");
      }
      try {
        const result = await this.port.processProduction({
          id,
          leaseToken: production.leaseToken,
          now,
        });
        if (result) delivered += 1;
      } catch (error) {
        failed += 1;
        const released = await this.port.releaseProduction({
          id,
          leaseToken: production.leaseToken,
          error,
          now,
        });
        if (released === "HALTED") dead += 1;
      }
    }

    const signal = await this.port.claimSignal(now);
    if (signal) {
      observedDue += 1;
      claimed += 1;
      const id = jobId(signal);
      const expectedSignal = signal.pendingSignals?.[0];
      if (!signal.signalLeaseToken || !expectedSignal) {
        throw new Error("claim된 연구 알림 signal lease가 없습니다.");
      }
      try {
        await this.port.deliverSignal(signal);
        if (!(await this.port.completeSignal({
          id,
          signalLeaseToken: signal.signalLeaseToken,
          expectedSignal,
          now,
        }))) {
          throw new Error("연구 알림 signal 완료 전에 lease를 상실했습니다.");
        }
        delivered += 1;
      } catch (error) {
        failed += 1;
        await this.port.releaseSignal({
          id,
          signalLeaseToken: signal.signalLeaseToken,
        });
      }
    }

    const reminder = await this.port.claimReminder(now);
    if (reminder) {
      observedDue += 1;
      claimed += 1;
      const id = jobId(reminder);
      if (!reminder.reminderLeaseToken) {
        throw new Error("claim된 연구 reminder lease가 없습니다.");
      }
      try {
        await this.port.deliverReminder(reminder);
        if (!(await this.port.completeReminder({
          id,
          reminderLeaseToken: reminder.reminderLeaseToken,
          now,
        }))) {
          throw new Error("연구 reminder 완료 전에 lease를 상실했습니다.");
        }
        delivered += 1;
      } catch (error) {
        failed += 1;
        await this.port.releaseReminder({
          id,
          reminderLeaseToken: reminder.reminderLeaseToken,
        });
      }
    }

    const halted = await this.port.countHalted();
    return {
      observedDue,
      claimed,
      delivered,
      failed,
      dead,
      ...(halted > 0
        ? {
            operationalAlert: {
              fingerprint: "research-lab-worker-halted",
              severity: "CRITICAL" as const,
              summary:
                "연구 작업이 8회 연속 실패해 자동 재시도를 안전정지했습니다.",
            },
          }
        : {}),
    };
  }
}
