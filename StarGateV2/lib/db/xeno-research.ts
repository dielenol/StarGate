import "./init";

import {
  appendNpcConversationMessages,
  applyNpcRelationshipChoice,
  findMainCharacterByOwner,
  getOrCreateNpcRelationship,
  npcRelationshipId,
  npcRelationshipsCol,
  reserveNpcConversationTurn,
  updateNpcConversationSummary,
  type AgentLevel,
  type NpcConversation,
  type NpcConversationMessage,
  type RelationshipState,
} from "@stargate/shared-db";

import type { ResearchRelationshipView } from "@/types/research";

import { ResearchLabError } from "../research/research-lab";
import {
  getXenoRelationshipPresentation,
  initialXenoRelationshipScore,
  relationshipStateForScore,
} from "../research/xeno-dialogue";

export interface XenoResearchActor {
  userId: string;
  characterId: string;
  codename: string;
  className: string;
  agentLevel?: AgentLevel;
  publicPersonalityTags: string[];
}

export async function requireXenoResearchActor(
  userId: string,
): Promise<XenoResearchActor> {
  let character;
  try {
    character = await findMainCharacterByOwner(userId);
  } catch {
    throw new ResearchLabError(
      "MAIN_CHARACTER_INTEGRITY",
      409,
      "MAIN AGENT 캐릭터 정합성을 확인할 수 없습니다.",
    );
  }
  if (!character?._id || character.type !== "AGENT") {
    throw new ResearchLabError(
      "NO_MAIN_CHARACTER",
      409,
      "ACTIVE 사용자의 MAIN AGENT 캐릭터가 필요합니다.",
    );
  }
  return {
    userId,
    characterId: String(character._id),
    codename: character.codename,
    className: character.play.className,
    agentLevel: character.agentLevel,
    publicPersonalityTags:
      character.isPublic === true
        ? (character.lore.loreTags ?? [])
            .filter((tag): tag is string => typeof tag === "string")
            .slice(0, 12)
        : [],
  };
}

function relationshipView(state: RelationshipState): ResearchRelationshipView {
  const presentation = getXenoRelationshipPresentation(state);
  return {
    state: presentation.state,
    label: presentation.label,
    description: presentation.description,
    icon: presentation.icon,
  };
}

export async function ensureXenoRelationship(
  actor: XenoResearchActor,
): Promise<{ state: RelationshipState; view: ResearchRelationshipView }> {
  const relationship = await getOrCreateNpcRelationship({
    userId: actor.userId,
    characterId: actor.characterId,
    initialScore: initialXenoRelationshipScore(actor),
  });
  const state = relationshipStateForScore(relationship.score);
  return { state, view: relationshipView(state) };
}

export async function readXenoRelationshipState(
  actor: XenoResearchActor,
): Promise<RelationshipState> {
  const relationship = await (await npcRelationshipsCol()).findOne({
    _id: npcRelationshipId(actor.userId, actor.characterId),
    userId: actor.userId,
    characterId: actor.characterId,
  });
  return relationshipStateForScore(
    relationship?.score ?? initialXenoRelationshipScore(actor),
  );
}

export async function applyXenoResearchChoice(input: {
  actor: XenoResearchActor;
  sceneId: string;
  choiceId: string;
  delta: number;
}): Promise<{
  applied: boolean;
  choiceId: string;
  state: RelationshipState;
  view: ResearchRelationshipView;
}> {
  await ensureXenoRelationship(input.actor);
  const result = await applyNpcRelationshipChoice({
    userId: input.actor.userId,
    characterId: input.actor.characterId,
    sceneId: input.sceneId,
    choiceId: input.choiceId,
    delta: input.delta,
  });
  const state = relationshipStateForScore(result.relationship.score);
  return {
    applied: result.applied,
    choiceId: result.choiceId,
    state,
    view: relationshipView(state),
  };
}

export async function reserveXenoConversationTurn(input: {
  actor: XenoResearchActor;
  dailyUsageDate: string;
  now: Date;
  dailyLimit: number;
  cooldownMs: number;
}) {
  return reserveNpcConversationTurn({
    userId: input.actor.userId,
    characterId: input.actor.characterId,
    dailyUsageDate: input.dailyUsageDate,
    now: input.now,
    dailyLimit: input.dailyLimit,
    cooldownMs: input.cooldownMs,
  });
}

export async function appendXenoConversationMessages(input: {
  actor: XenoResearchActor;
  messages: NpcConversationMessage[];
  dailyUsageDate: string;
  turnLeaseToken: string;
  now: Date;
}): Promise<NpcConversation> {
  return appendNpcConversationMessages({
    userId: input.actor.userId,
    characterId: input.actor.characterId,
    messages: input.messages,
    dailyUsageDate: input.dailyUsageDate,
    turnLeaseToken: input.turnLeaseToken,
    now: input.now,
  });
}

export async function saveXenoConversationSummary(input: {
  actor: XenoResearchActor;
  summary: string;
  summaryLeaseToken: string;
  summaryGeneration: number;
  now?: Date;
}): Promise<boolean> {
  return updateNpcConversationSummary({
    userId: input.actor.userId,
    characterId: input.actor.characterId,
    summary: input.summary,
    summaryLeaseToken: input.summaryLeaseToken,
    summaryGeneration: input.summaryGeneration,
    now: input.now,
  });
}
