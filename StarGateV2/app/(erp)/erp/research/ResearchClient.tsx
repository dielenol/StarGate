"use client";

import { useRef, useState } from "react";

import type { ResearchDestination, ResearchRecipeId } from "@stargate/shared-db";

import {
  useCancelResearchJob,
  useClaimResearchJob,
  useQueueResearchJob,
  useStartInitialResearch,
  useXenoChat,
  useXenoChoice,
} from "@/hooks/mutations/useResearchMutation";
import {
  ResearchApiError,
  useResearchLab,
} from "@/hooks/queries/useResearchQuery";
import {
  clearRetainedIdempotencyOperation,
  retainIdempotencyOperation,
  type RetainedIdempotencyOperation,
} from "@/lib/query/idempotency";
import type {
  ResearchActionResponse,
  ResearchLabOverview,
  ResearchLineView,
} from "@/types/research";

import ResearchLabView, {
  type ResearchLabViewData,
} from "./ResearchLabView";
import type {
  ResearchConsoleJob,
  ResearchConsoleLine,
} from "./ResearchConsole";
import type { XenoDialogueMessage } from "./XenoStage";

interface ResearchClientProps {
  initialData: ResearchLabOverview;
}

interface InteractionLog {
  id: string;
  messages: XenoDialogueMessage[];
}

interface OperationRefs {
  initial: RetainedIdempotencyOperation | null;
  queue: RetainedIdempotencyOperation | null;
  cancel: RetainedIdempotencyOperation | null;
  claim: RetainedIdempotencyOperation | null;
}

const UNASSIGNED_RELATIONSHIP = {
  state: "NEUTRAL" as const,
  label: "미등록",
  description: "MAIN AGENT 캐릭터가 없어 관계를 기록하지 않는다",
  icon: "/assets/npcs/xeno/relationship/neutral.webp",
};

function errorMessage(error: unknown): string | null {
  if (error instanceof ResearchApiError) return error.message;
  if (error instanceof Error) return error.message;
  return null;
}

function toConsoleJob(job: ResearchLineView["activeJob"]): ResearchConsoleJob | null {
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    codename: job.characterCodename,
    position: job.position ?? undefined,
    destination: job.destination,
    completesAt: job.completesAt ?? undefined,
    claimDeadline: job.claimDeadline ?? undefined,
    isViewerJob: job.isMine,
    cancellable: job.canCancel,
    claimable: job.canClaim,
  };
}

function initialEligibilityMessage(
  data: ResearchLabOverview,
  line: ResearchLineView,
): string {
  if (!data.viewer.mutationsEnabled) {
    return "라이브 index와 catalog 적재 승인 전이라 연구 접수를 잠가 두었습니다.";
  }
  if (data.viewer.eligibilityCode === "MAIN_CHARACTER_INTEGRITY") {
    return "MAIN AGENT 캐릭터 정합성을 운영자가 확인해야 합니다.";
  }
  if (!data.viewer.character) {
    return "활성 MAIN AGENT 캐릭터가 있어야 최초 연구를 시작할 수 있습니다.";
  }
  if (!data.viewer.isScientist) {
    return "최초 연구는 직군이 과학자인 캐릭터만 시작할 수 있습니다.";
  }
  if (!line.recipe.source.registered || !line.recipe.output.registered) {
    return "필요한 master item이 운영 catalog에 아직 적재되지 않았습니다.";
  }
  if (line.recipe.source.sharedQuantity < line.recipe.source.quantity) {
    return `공용 ${line.recipe.source.name}이(가) ${line.recipe.source.quantity}개 필요합니다.`;
  }
  return `공용 ${line.recipe.source.name} ${line.recipe.source.quantity}개를 제출하면 24시간 최초 연구가 시작됩니다.`;
}

function productionEligibilityMessage(
  data: ResearchLabOverview,
  line: ResearchLineView,
): string {
  if (!data.viewer.mutationsEnabled) {
    return "운영 활성화 전이라 반복생산 요청을 잠가 두었습니다.";
  }
  if (!data.viewer.character) {
    return "활성 MAIN AGENT 캐릭터가 있어야 반복생산을 요청할 수 있습니다.";
  }
  if (!line.recipe.output.registered) {
    return "산출물 master item이 운영 catalog에 아직 적재되지 않았습니다.";
  }
  if (line.myJob) {
    return "이 연구선에 본인의 미완료 요청이 이미 있습니다.";
  }
  if ((data.viewer.balance ?? 0) < line.recipe.repeatCreditCost) {
    return `${line.recipe.repeatCreditCost.toLocaleString()} CR이 필요합니다.`;
  }
  return "등록 즉시 500 CR이 사용되며 선택한 수령처는 바꿀 수 없습니다.";
}

function toConsoleLine(
  data: ResearchLabOverview,
  line: ResearchLineView,
): ResearchConsoleLine {
  const initialMessage = initialEligibilityMessage(data, line);
  const productionMessage = productionEligibilityMessage(data, line);
  return {
    id: line.recipe.id,
    code: line.recipe.eyebrow,
    title: line.recipe.label,
    description: line.recipe.description,
    gameplayNote: line.recipe.gameplayNote,
    status: line.status,
    source: {
      name: line.recipe.source.name,
      slug: line.recipe.source.slug,
      image: line.recipe.source.image,
      quantity: line.recipe.source.quantity,
      sharedQuantity: line.recipe.source.sharedQuantity,
      registered: line.recipe.source.registered,
    },
    output: {
      name: line.recipe.output.name,
      slug: line.recipe.output.slug,
      image: line.recipe.output.image,
      quantity: line.recipe.output.quantity,
      sharedQuantity: line.recipe.output.sharedQuantity,
      registered: line.recipe.output.registered,
    },
    initialCompletesAt: line.completesAt ?? undefined,
    currentJob: toConsoleJob(line.activeJob),
    queue: line.queue.flatMap((job) => {
      const mapped = toConsoleJob(job);
      return mapped ? [mapped] : [];
    }),
    repeatCreditCost: line.recipe.repeatCreditCost,
    viewerBalance: data.viewer.balance,
    canStartInitial:
      line.status === "LOCKED" &&
      data.viewer.mutationsEnabled &&
      data.viewer.isScientist &&
      line.recipe.source.registered &&
      line.recipe.output.registered &&
      line.recipe.source.sharedQuantity >= line.recipe.source.quantity,
    initialEligibilityMessage: initialMessage,
    canCreateJob:
      line.status === "OPEN" &&
      data.viewer.mutationsEnabled &&
      data.viewer.character !== null &&
      line.recipe.output.registered &&
      line.myJob === null &&
      (data.viewer.balance ?? 0) >= line.recipe.repeatCreditCost,
    productionEligibilityMessage: productionMessage,
  };
}

function toViewData(
  data: ResearchLabOverview,
  interaction: InteractionLog | null,
): ResearchLabViewData {
  const recentMessages: XenoDialogueMessage[] = (data.xeno?.recentMessages ?? []).map(
    (message, index) => ({
      id: `memory-${message.createdAt}-${index}`,
      speaker: message.role === "assistant" ? "XENO" : "USER",
      text: message.content,
      expression:
        message.role === "assistant"
          ? data.xeno?.dialogue.expression
          : undefined,
    }),
  );
  const currentDialogue = data.xeno?.dialogue;
  const lastAssistant = [...recentMessages]
    .reverse()
    .find((message) => message.speaker === "XENO");
  if (currentDialogue && lastAssistant?.text !== currentDialogue.text) {
    recentMessages.push({
      id: `scene-${currentDialogue.sceneId}`,
      speaker: "XENO",
      text: currentDialogue.text,
      expression: currentDialogue.expression,
    });
  }
  if (!data.xeno) {
    recentMessages.push({
      id: "no-main-character",
      speaker: "XENO",
      text: "MAIN AGENT부터 연결해. 신원도 없는 상대와 관계를 기록할 생각은 없어.",
      expression: "displeased",
    });
  }
  if (interaction) recentMessages.push(...interaction.messages);

  return {
    serverNow: data.serverNow,
    relationship: data.xeno?.relationship ?? UNASSIGNED_RELATIONSHIP,
    messages: recentMessages,
    choices: data.viewer.mutationsEnabled ? data.xeno?.dialogue.choices.map((choice) => ({
      id: choice.choiceId,
      label: choice.label,
    })) : [],
    chatRemaining: data.viewer.mutationsEnabled
      ? (data.xeno?.chatRemaining ?? 0)
      : 0,
    chatRetryAt: data.xeno?.chatRetryAt,
    lines: data.lines.map((line) => toConsoleLine(data, line)),
  };
}

export default function ResearchClient({ initialData }: ResearchClientProps) {
  const operations = useRef<OperationRefs>({
    initial: null,
    queue: null,
    cancel: null,
    claim: null,
  });
  const [interaction, setInteraction] = useState<InteractionLog | null>(null);
  const overview = useResearchLab({ initialData });
  const initial = useStartInitialResearch();
  const queue = useQueueResearchJob();
  const cancel = useCancelResearchJob();
  const claim = useClaimResearchJob();
  const choice = useXenoChoice();
  const chat = useXenoChat();

  const resetEconomicErrors = () => {
    initial.reset();
    queue.reset();
    cancel.reset();
    claim.reset();
  };
  const showActionDialogue = (response: ResearchActionResponse) => {
    setInteraction({
      id: crypto.randomUUID(),
      messages: [
        {
          id: `action-${crypto.randomUUID()}`,
          speaker: "XENO",
          text: response.dialogue.text,
          expression: response.dialogue.expression,
        },
      ],
    });
  };
  const completeOperation = (
    slot: keyof OperationRefs,
    operationId: string,
  ) => {
    operations.current[slot] = clearRetainedIdempotencyOperation(
      operations.current[slot],
      operationId,
    );
  };

  const handleInitial = (recipeId: string) => {
    const line = overview.data?.lines.find(
      (candidate) => candidate.recipe.id === recipeId,
    );
    if (!line || !window.confirm(`공용 ${line.recipe.source.name} ${line.recipe.source.quantity}개를 제출하고 24시간 최초 연구를 시작하시겠습니까?`)) return;
    resetEconomicErrors();
    const operation = retainIdempotencyOperation(
      operations.current.initial,
      "research-lab-initial",
      recipeId,
    );
    operations.current.initial = operation;
    initial.mutate(
      { recipeId: recipeId as ResearchRecipeId, operationId: operation.key },
      { onSuccess: (response) => { completeOperation("initial", operation.key); showActionDialogue(response); } },
    );
  };

  const handleQueue = (recipeId: string, destination: ResearchDestination) => {
    const line = overview.data?.lines.find(
      (candidate) => candidate.recipe.id === recipeId,
    );
    if (!line || !window.confirm(`${line.recipe.repeatCreditCost.toLocaleString()} CR을 즉시 사용해 ${destination === "SHARED" ? "공용 인벤토리" : "내 캐릭터 수령함"} 수령으로 생산 요청을 등록하시겠습니까?`)) return;
    resetEconomicErrors();
    const fingerprint = JSON.stringify([recipeId, destination]);
    const operation = retainIdempotencyOperation(
      operations.current.queue,
      "research-lab-job",
      fingerprint,
    );
    operations.current.queue = operation;
    queue.mutate(
      { recipeId: recipeId as ResearchRecipeId, destination, operationId: operation.key },
      { onSuccess: (response) => { completeOperation("queue", operation.key); showActionDialogue(response); } },
    );
  };

  const handleCancel = (jobId: string) => {
    if (!window.confirm("대기 중인 생산 요청을 취소하고 500 CR을 전액 환불받으시겠습니까?")) return;
    resetEconomicErrors();
    const operation = retainIdempotencyOperation(
      operations.current.cancel,
      "research-lab-job-cancel",
      jobId,
    );
    operations.current.cancel = operation;
    cancel.mutate(
      { jobId, operationId: operation.key },
      { onSuccess: (response) => { completeOperation("cancel", operation.key); showActionDialogue(response); } },
    );
  };

  const handleClaim = (jobId: string) => {
    if (!window.confirm("개인 수령함의 연구 산출물을 지금 수령하시겠습니까?")) return;
    resetEconomicErrors();
    const operation = retainIdempotencyOperation(
      operations.current.claim,
      "research-lab-job-claim",
      jobId,
    );
    operations.current.claim = operation;
    claim.mutate(
      { jobId, operationId: operation.key },
      { onSuccess: (response) => { completeOperation("claim", operation.key); showActionDialogue(response); } },
    );
  };

  const pendingAction = initial.isPending
    ? "initial"
    : queue.isPending
      ? "job"
      : cancel.isPending
        ? "cancel"
        : claim.isPending
          ? "claim"
          : chat.isPending
            ? "chat"
            : choice.isPending
              ? "choice"
              : null;
  const actionError =
    errorMessage(initial.error) ??
    errorMessage(queue.error) ??
    errorMessage(cancel.error) ??
    errorMessage(claim.error);
  const chatError = errorMessage(chat.error) ?? errorMessage(choice.error);

  return (
    <ResearchLabView
      data={overview.data ? toViewData(overview.data, interaction) : null}
      isLoading={overview.isPending}
      error={errorMessage(overview.error) ?? actionError}
      pendingAction={pendingAction}
      chatError={chatError}
      onRefresh={() => { setInteraction(null); void overview.refetch(); }}
      onChatSubmit={(message) => {
        chat.reset();
        choice.reset();
        setInteraction(null);
        chat.mutate({ message });
      }}
      onChoiceSelect={(choiceId) => {
        chat.reset();
        choice.reset();
        choice.mutate(
          { choiceId },
          {
            onSuccess: (response) => {
              setInteraction({
                id: crypto.randomUUID(),
                messages: [
                  {
                    id: `choice-user-${crypto.randomUUID()}`,
                    speaker: "USER",
                    text: response.dialogue.playerLine,
                  },
                  {
                    id: `choice-xeno-${crypto.randomUUID()}`,
                    speaker: "XENO",
                    text: response.dialogue.text,
                    expression: response.dialogue.expression,
                  },
                ],
              });
            },
          },
        );
      }}
      onStartInitial={handleInitial}
      onCreateJob={handleQueue}
      onCancelJob={handleCancel}
      onClaimJob={handleClaim}
    />
  );
}
