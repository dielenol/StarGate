import "./init";

import { kstDateTag } from "@stargate/core/domain/kst-time";
import {
  RESEARCH_RECIPE_IDS,
  getCharacterBalance,
  listResearchLabLines,
  masterItemsCol,
  npcConversationsCol,
  npcRelationshipsCol,
  npcRelationshipEventsCol,
  researchLabJobsCol,
  sharedInventoryCol,
  type AgentCharacter,
  type ResearchJobStatus,
  type ResearchLabJob,
  type ResearchRecipeId,
} from "@stargate/shared-db";

import type {
  ResearchJobView,
  ResearchLabOverview,
  ResearchLineView,
  ResearchRecipeView,
  ResearchViewerEligibilityCode,
} from "@/types/research";

import { findMainCharacterByOwner } from "./characters";
import {
  RESEARCH_LAB_RECIPES,
  type ResearchLabRecipe,
} from "../research/research-lab";
import { isResearchLabMutationConfigured } from "../research/research-lab-readiness";
import {
  buildXenoFixedScene,
  getXenoRelationshipPresentation,
  initialXenoRelationshipScore,
  listXenoPublicChoices,
  relationshipStateForScore,
  type XenoChoiceSceneId,
  type XenoSceneId,
} from "../research/xeno-dialogue";
import {
  XENO_CHAT_COOLDOWN_MS,
  XENO_CHAT_DAILY_LIMIT,
} from "../research/xeno-ollama";
import { isResearchLabProductionRuntimeReady } from "./research-lab-readiness";

const ACTIVE_JOB_STATUSES: readonly ResearchJobStatus[] = [
  "QUEUED",
  "RUNNING",
  "CLAIMABLE",
];

type OverviewResearchJob = Pick<
  ResearchLabJob,
  | "recipeId"
  | "kind"
  | "status"
  | "destination"
  | "requesterUserId"
  | "characterId"
  | "characterCodename"
  | "queuedAt"
  | "startedAt"
  | "completesAt"
  | "claimDeadline"
  | "activeLineKey"
  | "workerHaltedAt"
> & { _id: NonNullable<ResearchLabJob["_id"]> };

const OVERVIEW_JOB_PROJECTION = {
  _id: 1,
  recipeId: 1,
  kind: 1,
  status: 1,
  destination: 1,
  requesterUserId: 1,
  characterId: 1,
  characterCodename: 1,
  queuedAt: 1,
  startedAt: 1,
  completesAt: 1,
  claimDeadline: 1,
  activeLineKey: 1,
  workerHaltedAt: 1,
} as const satisfies Record<keyof OverviewResearchJob, 1>;

const RECIPE_COPY: Readonly<
  Record<
    ResearchRecipeId,
    {
      label: string;
      eyebrow: string;
      description: string;
      gameplayNote: string | null;
      sourceName: string;
      outputName: string;
    }
  >
> = {
  ZULU_0028: {
    label: "깨진 음절 연구선",
    eyebrow: "ZULU SAMPLE · 0028",
    description: "검비 격리 개체를 장기 관찰해 깨진 음절 생산 공정을 개방합니다.",
    gameplayNote: null,
    sourceName: "ZULU-0028 검비 격리 개체",
    outputName: "깨진 음절",
  },
  ZULU_0040: {
    label: "왕관 균사 연구선",
    eyebrow: "ZULU SAMPLE · 0040",
    description: "왕관 격리 표본의 감염·신경 지배 반응을 통제 연구합니다.",
    gameplayNote:
      "균사편 분리·반복생산은 연구소 v2의 게임 기능 제안이며 정식 canon 절차는 아닙니다.",
    sourceName: "ZULU-0040 왕관 격리 표본",
    outputName: "ZULU-0040 왕관 균사편",
  },
  INVERTED_SOCK: {
    label: "광원화 반응 연구선",
    eyebrow: "CONTAINMENT SAMPLE · SOCK",
    description: "광원화 바이러스와 행동교정물질의 반응축을 연구실에서 재구성합니다.",
    gameplayNote:
      "기존 검은 연기 샘플의 피펫 현장 채취 기록은 유지되며, 양말에서 직접 추출한 것으로 서술하지 않습니다.",
    sourceName: "뒤집어진 양말 격리 개체",
    outputName: "광원화 검은 연기 샘플",
  },
};

interface ViewerResolution {
  eligibilityCode: ResearchViewerEligibilityCode;
  character: AgentCharacter | null;
}

function isMainCharacterIntegrityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("findMainCharacterByOwner") &&
    error.message.includes("1인 1 MAIN")
  );
}

async function resolveViewerCharacter(
  userId: string | null,
): Promise<ViewerResolution> {
  if (!userId) {
    return { eligibilityCode: "NO_MAIN_CHARACTER", character: null };
  }
  try {
    const character = await findMainCharacterByOwner(userId);
    if (!character || character.type !== "AGENT") {
      return { eligibilityCode: "NO_MAIN_CHARACTER", character: null };
    }
    return { eligibilityCode: "ELIGIBLE", character };
  } catch (error) {
    if (isMainCharacterIntegrityError(error)) {
      return { eligibilityCode: "MAIN_CHARACTER_INTEGRITY", character: null };
    }
    throw error;
  }
}

function compareQueue(
  left: OverviewResearchJob,
  right: OverviewResearchJob,
): number {
  const byQueuedAt = left.queuedAt.getTime() - right.queuedAt.getTime();
  if (byQueuedAt !== 0) return byQueuedAt;
  return String(left._id).localeCompare(String(right._id), "en");
}

function toJobView(
  job: OverviewResearchJob,
  userId: string | null,
  characterId: string | null,
  position: number | null,
  now: Date,
): ResearchJobView {
  const isMine =
    userId !== null &&
    characterId !== null &&
    job.requesterUserId === userId &&
    job.characterId === characterId;
  return {
    id: String(job._id),
    recipeId: job.recipeId,
    kind: job.kind,
    status: job.status,
    destination: job.destination,
    characterCodename: job.characterCodename,
    isMine,
    position,
    queuedAt: job.queuedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completesAt: job.completesAt?.toISOString() ?? null,
    claimDeadline: job.claimDeadline?.toISOString() ?? null,
    canCancel: isMine && job.status === "QUEUED",
    canClaim:
      isMine &&
      job.status === "CLAIMABLE" &&
      job.claimDeadline !== undefined &&
      job.claimDeadline > now,
  };
}

function selectDialogueScene(input: {
  lines: readonly ResearchLineView[];
  isScientist: boolean;
}): { sceneId: XenoSceneId; choiceSceneId: XenoChoiceSceneId } {
  if (input.lines.some((line) => line.myJob?.status === "CLAIMABLE")) {
    return { sceneId: "JOB_CLAIMABLE", choiceSceneId: "CLAIM_HANDOFF" };
  }
  if (input.lines.some((line) => line.myJob?.status === "RUNNING")) {
    return { sceneId: "JOB_RUNNING", choiceSceneId: "METHOD_DISPUTE" };
  }
  if (input.lines.some((line) => line.myJob?.status === "QUEUED")) {
    return { sceneId: "JOB_QUEUED", choiceSceneId: "INTRODUCTION" };
  }
  const lockedLines = input.lines.filter((line) => line.status === "LOCKED");
  if (lockedLines.length > 0 && input.isScientist) {
    const hasSource = lockedLines.some(
      (line) => line.recipe.source.sharedQuantity >= line.recipe.source.quantity,
    );
    return {
      sceneId: hasSource ? "INITIAL_ELIGIBLE" : "INITIAL_SOURCE_MISSING",
      choiceSceneId: "INITIAL_RESEARCH_OFFER",
    };
  }
  if (lockedLines.length > 0) {
    return { sceneId: "INITIAL_INELIGIBLE", choiceSceneId: "INTRODUCTION" };
  }
  return { sceneId: "ENTRY_RETURN", choiceSceneId: "INTRODUCTION" };
}

function recipeView(input: {
  recipe: ResearchLabRecipe;
  source: { itemId: string; name: string } | null;
  output: { itemId: string; name: string } | null;
  sharedQuantities: ReadonlyMap<string, number>;
}): ResearchRecipeView {
  const copy = RECIPE_COPY[input.recipe.id];
  return {
    id: input.recipe.id,
    label: copy.label,
    eyebrow: copy.eyebrow,
    description: copy.description,
    gameplayNote: copy.gameplayNote,
    source: {
      slug: input.recipe.source.slug,
      name: input.source?.name ?? copy.sourceName,
      image: input.recipe.source.image,
      category: input.recipe.source.category,
      quantity: input.recipe.source.quantity,
      sharedQuantity: input.source
        ? (input.sharedQuantities.get(input.source.itemId) ?? 0)
        : 0,
      catalogPrice: 0,
      registered: input.source !== null,
    },
    output: {
      slug: input.recipe.output.slug,
      name: input.output?.name ?? copy.outputName,
      image: input.recipe.output.image,
      category: input.recipe.output.category,
      quantity: input.recipe.output.quantity,
      sharedQuantity: input.output
        ? (input.sharedQuantities.get(input.output.itemId) ?? 0)
        : 0,
      catalogPrice: 0,
      registered: input.output !== null,
    },
    initialDurationMs: input.recipe.initialDurationMs,
    repeatDurationMs: input.recipe.repeatDurationMs,
    repeatCreditCost: input.recipe.repeatCreditCost,
  };
}

export async function getResearchLabOverview(input: {
  userId: string | null;
  now?: Date;
}): Promise<ResearchLabOverview> {
  const now = input.now ?? new Date();
  const userId = input.userId;
  const mutationsEnabled = isResearchLabMutationConfigured();
  const productionEnabled = await isResearchLabProductionRuntimeReady();
  const recipes = RESEARCH_RECIPE_IDS.map((id) => RESEARCH_LAB_RECIPES[id]);
  const itemSlugs = recipes.flatMap((recipe) => [
    recipe.source.slug,
    recipe.output.slug,
  ]);
  const [viewer, storedLines, activeJobs, masterItems] = await Promise.all([
    resolveViewerCharacter(input.userId),
    listResearchLabLines(),
    (await researchLabJobsCol())
      .find({
        recipeId: { $in: [...RESEARCH_RECIPE_IDS] },
        status: { $in: [...ACTIVE_JOB_STATUSES] },
      })
      .project<OverviewResearchJob>(OVERVIEW_JOB_PROJECTION)
      .sort({ recipeId: 1, status: 1, queuedAt: 1, _id: 1 })
      .toArray(),
    (await masterItemsCol())
      .find({ slug: { $in: itemSlugs } })
      .project({ _id: 1, slug: 1, name: 1 })
      .toArray(),
  ]);

  const masterBySlug = new Map(
    masterItems.map((item) => [
      item.slug,
      { itemId: String(item._id), name: item.name },
    ]),
  );
  const itemIds = masterItems.flatMap((item) =>
    item._id ? [String(item._id)] : [],
  );
  const sharedRows = itemIds.length
    ? await (await sharedInventoryCol())
        .find({ scope: "GLOBAL", itemId: { $in: itemIds } })
        .project({ itemId: 1, quantity: 1 })
        .toArray()
    : [];
  const sharedQuantities = new Map<string, number>();
  for (const row of sharedRows) {
    sharedQuantities.set(
      row.itemId,
      (sharedQuantities.get(row.itemId) ?? 0) + row.quantity,
    );
  }

  const storedLineById = new Map(storedLines.map((line) => [line._id, line]));
  const activeJobsByRecipe = new Map<
    ResearchRecipeId,
    OverviewResearchJob[]
  >();
  for (const job of activeJobs) {
    const recipeJobs = activeJobsByRecipe.get(job.recipeId) ?? [];
    recipeJobs.push(job);
    activeJobsByRecipe.set(job.recipeId, recipeJobs);
  }
  const characterId = viewer.character?._id
    ? String(viewer.character._id)
    : null;
  const lines: ResearchLineView[] = recipes.map((recipe) => {
    const storedLine = storedLineById.get(recipe.id);
    const jobs = activeJobsByRecipe.get(recipe.id) ?? [];
    const isHalted = jobs.some(
      (job) =>
        job.activeLineKey === recipe.id && job.workerHaltedAt !== undefined,
    );
    const active = jobs.find(
      (job) => job.status === "RUNNING" || job.status === "CLAIMABLE",
    );
    const queued = jobs.filter((job) => job.status === "QUEUED").sort(compareQueue);
    const queueViews = queued.map((job, index) =>
      toJobView(job, userId, characterId, index + 1, now),
    );
    const activeView = active
      ? toJobView(active, userId, characterId, null, now)
      : null;
    const myJob =
      [activeView, ...queueViews].find((job) => job?.isMine === true) ?? null;
    return {
      recipe: recipeView({
        recipe,
        source: masterBySlug.get(recipe.source.slug) ?? null,
        output: masterBySlug.get(recipe.output.slug) ?? null,
        sharedQuantities,
      }),
      status: storedLine?.status ?? "LOCKED",
      isHalted,
      submittedByCharacterCodename:
        storedLine?.submittedByCharacterCodename ?? null,
      startedAt: storedLine?.startedAt?.toISOString() ?? null,
      completesAt: storedLine?.completesAt?.toISOString() ?? null,
      openedAt: storedLine?.openedAt?.toISOString() ?? null,
      activeJob: activeView,
      queue: queueViews,
      myJob,
    };
  });

  if (!viewer.character || !characterId || !userId) {
    return {
      serverNow: now.toISOString(),
      viewer: {
        eligibilityCode: viewer.eligibilityCode,
        character: null,
        isScientist: false,
        balance: null,
        mutationsEnabled,
        productionEnabled,
      },
      lines,
      xeno: null,
    };
  }

  const initialScore = initialXenoRelationshipScore({
    codename: viewer.character.codename,
    className: viewer.character.play.className,
    agentLevel: viewer.character.agentLevel,
  });
  const [balance, relationship, conversation, choiceEvents] = await Promise.all([
    getCharacterBalance(characterId),
    (await npcRelationshipsCol()).findOne({
      _id: `XENO:${userId}:${characterId}`,
      userId,
      characterId,
    }),
    (await npcConversationsCol()).findOne({
      _id: `XENO:${userId}:${characterId}`,
      userId,
      characterId,
    }),
    (await npcRelationshipEventsCol())
      .find({ npcId: "XENO", userId, characterId, kind: "CHOICE" })
      .project({ sceneId: 1 })
      .toArray(),
  ]);
  const relationshipState = relationshipStateForScore(
    relationship?.score ?? initialScore,
  );
  const relationshipPresentation = getXenoRelationshipPresentation(
    relationshipState,
  );
  const scene = selectDialogueScene({
    lines,
    isScientist: viewer.character.play.className === "과학자",
  });
  const dialogue = buildXenoFixedScene(scene.sceneId, {
    codename: viewer.character.codename,
    className: viewer.character.play.className,
    agentLevel: viewer.character.agentLevel,
    relationshipState,
  });
  const consumedChoiceScenes = new Set(
    choiceEvents.flatMap((event) =>
      typeof event.sceneId === "string" ? [event.sceneId] : [],
    ),
  );
  const today = kstDateTag(now);
  const dailyUsage =
    conversation?.dailyUsageDate === today ? conversation.dailyUsageCount : 0;
  const retryAt = conversation?.lastUserMessageAt
    ? new Date(
        conversation.lastUserMessageAt.getTime() + XENO_CHAT_COOLDOWN_MS,
      )
    : null;

  return {
    serverNow: now.toISOString(),
    viewer: {
      eligibilityCode: viewer.eligibilityCode,
      character: {
        id: characterId,
        codename: viewer.character.codename,
        className: viewer.character.play.className,
        agentLevel: viewer.character.agentLevel ?? "—",
      },
      isScientist: viewer.character.play.className === "과학자",
      balance,
      mutationsEnabled,
      productionEnabled,
    },
    lines,
    xeno: {
      relationship: {
        state: relationshipPresentation.state,
        label: relationshipPresentation.label,
        description: relationshipPresentation.description,
        icon: relationshipPresentation.icon,
      },
      dialogue: {
        sceneId: scene.sceneId,
        text: dialogue.text,
        expression: dialogue.expression,
        choices: consumedChoiceScenes.has(scene.choiceSceneId)
          ? []
          : listXenoPublicChoices(scene.choiceSceneId, relationshipState),
      },
      recentMessages: (conversation?.messages ?? []).slice(-20).map((message) => ({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
      chatRemaining: Math.max(0, XENO_CHAT_DAILY_LIMIT - dailyUsage),
      chatRetryAt:
        retryAt && retryAt.getTime() > now.getTime()
          ? retryAt.toISOString()
          : null,
    },
  };
}
