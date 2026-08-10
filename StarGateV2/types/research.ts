import type {
  ResearchDestination,
  ResearchJobStatus,
  ResearchLineStatus,
  ResearchRecipeId,
  RelationshipState,
} from "@stargate/shared-db";

import type {
  XenoExpression,
  XenoPublicChoice,
  XenoSceneId,
} from "@/lib/research/xeno-dialogue";

export type ResearchViewerEligibilityCode =
  | "ELIGIBLE"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY";

export interface ResearchViewerCharacter {
  id: string;
  codename: string;
  className: string;
  agentLevel: string;
}

export interface ResearchItemView {
  slug: string;
  name: string;
  image: string;
  category: "SPECIAL" | "MATERIAL";
  quantity: number;
  sharedQuantity: number;
  catalogPrice: 0;
  registered: boolean;
}

export interface ResearchJobView {
  id: string;
  recipeId: ResearchRecipeId;
  kind: "INITIAL" | "REPEAT";
  status: ResearchJobStatus;
  destination: ResearchDestination;
  characterCodename: string;
  isMine: boolean;
  position: number | null;
  queuedAt: string;
  startedAt: string | null;
  completesAt: string | null;
  claimDeadline: string | null;
  canCancel: boolean;
  canClaim: boolean;
}

export interface ResearchRecipeView {
  id: ResearchRecipeId;
  label: string;
  eyebrow: string;
  description: string;
  gameplayNote: string | null;
  source: ResearchItemView;
  output: ResearchItemView;
  initialDurationMs: number;
  repeatDurationMs: number;
  repeatCreditCost: 500;
}

export interface ResearchLineView {
  recipe: ResearchRecipeView;
  status: ResearchLineStatus;
  submittedByCharacterCodename: string | null;
  startedAt: string | null;
  completesAt: string | null;
  openedAt: string | null;
  activeJob: ResearchJobView | null;
  queue: ResearchJobView[];
  myJob: ResearchJobView | null;
}

export interface ResearchRelationshipView {
  state: RelationshipState;
  label: string;
  description: string;
  icon: string;
}

export interface ResearchDialogueView {
  sceneId: XenoSceneId;
  text: string;
  expression: XenoExpression;
  choices: XenoPublicChoice[];
}

export interface ResearchDialogueMessageView {
  text: string;
  expression: XenoExpression;
}

export interface ResearchConversationMessageView {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ResearchXenoView {
  relationship: ResearchRelationshipView;
  dialogue: ResearchDialogueView;
  recentMessages: ResearchConversationMessageView[];
  chatRemaining: number;
  chatRetryAt: string | null;
}

export interface ResearchLabOverview {
  serverNow: string;
  viewer: {
    eligibilityCode: ResearchViewerEligibilityCode;
    character: ResearchViewerCharacter | null;
    isScientist: boolean;
    balance: number | null;
    mutationsEnabled: boolean;
  };
  lines: ResearchLineView[];
  xeno: ResearchXenoView | null;
}

export interface ResearchActionResponse {
  ok: true;
  action:
    | "INITIAL_STARTED"
    | "JOB_QUEUED"
    | "JOB_CANCELLED"
    | "JOB_CLAIMED";
  replayed: boolean;
  dialogue: ResearchDialogueMessageView;
}

export interface ResearchChoiceResponse {
  ok: true;
  applied: boolean;
  relationship: ResearchRelationshipView;
  dialogue: ResearchDialogueMessageView & { playerLine: string };
}

export interface ResearchChatResponse {
  ok: true;
  message: ResearchConversationMessageView;
  source: "OLLAMA" | "FALLBACK";
  expression: XenoExpression;
  remaining: number;
  retryAt: string;
}

export interface ResearchErrorResponse {
  error: string;
  code?: string;
  retryAt?: string;
}
