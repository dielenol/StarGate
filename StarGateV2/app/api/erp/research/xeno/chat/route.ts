import { after, NextResponse } from "next/server";

import { kstDateTag } from "@stargate/core/domain/kst-time";

import { auth } from "@/lib/auth/config";
import {
  appendXenoConversationMessages,
  ensureXenoRelationship,
  requireXenoResearchActor,
  reserveXenoConversationTurn,
  saveXenoConversationSummary,
} from "@/lib/db/xeno-research";
import {
  getXenoRelationshipPresentation,
  sanitizeXenoChatInput,
} from "@/lib/research/xeno-dialogue";
import {
  generateXenoChat,
  summarizeXenoConversation,
  XENO_CHAT_COOLDOWN_MS,
  XENO_CHAT_DAILY_LIMIT,
} from "@/lib/research/xeno-ollama";
import type { ResearchChatResponse } from "@/types/research";

import {
  guestReadOnlyResponse,
  isResearchLabMutationEnabled,
  researchLabNotActivatedResponse,
  researchLabErrorResponse,
  unauthorizedResearchResponse,
} from "../../_response";

export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return unauthorizedResearchResponse();
  if (session.user.isGuest) return guestReadOnlyResponse();
  if (!(await isResearchLabMutationEnabled())) return researchLabNotActivatedResponse();
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const message = sanitizeXenoChatInput(body?.message);
  if (!message) {
    return NextResponse.json(
      { error: "대화는 1자 이상 300자 이하의 일반 텍스트여야 합니다.", code: "INVALID_MESSAGE" },
      { status: 400 },
    );
  }

  try {
    const actor = await requireXenoResearchActor(session.user.id);
    const relationship = await ensureXenoRelationship(actor);
    const now = new Date();
    const dailyUsageDate = kstDateTag(now);
    const reservation = await reserveXenoConversationTurn({
      actor,
      dailyUsageDate,
      now,
      dailyLimit: XENO_CHAT_DAILY_LIMIT,
      cooldownMs: XENO_CHAT_COOLDOWN_MS,
    });
    if (!reservation.ok) {
      return NextResponse.json(
        {
          error:
            reservation.reason === "DAILY_LIMIT"
              ? "오늘 제노와 나눌 수 있는 대화를 모두 사용했습니다."
              : "제노가 방금 응답했습니다. 잠시 후 다시 시도하세요.",
          code: reservation.reason,
          retryAt: reservation.retryAt?.toISOString(),
        },
        { status: 429 },
      );
    }

    const generation = await generateXenoChat({
      apiKey: process.env.OLLAMA_API_KEY,
      model: process.env.OLLAMA_NPC_MODEL,
      message,
      context: {
        codename: actor.codename,
        className: actor.className,
        agentLevel: actor.agentLevel ?? "—",
        relationshipState: relationship.state,
        publicPersonalityTags: actor.publicPersonalityTags,
        summary: reservation.conversation.summary,
        recentMessages: reservation.conversation.messages.slice(-20),
      },
    });
    const assistantCreatedAt = new Date();
    const conversation = await appendXenoConversationMessages({
      actor,
      dailyUsageDate,
      turnLeaseToken: reservation.turnLease.token,
      now: assistantCreatedAt,
      messages: [
        { role: "user", content: message, createdAt: now },
        {
          role: "assistant",
          content: generation.text,
          createdAt: assistantCreatedAt,
        },
      ],
    });

    if (reservation.summaryLease) {
      const currentSummary = conversation.summary;
      const messages = conversation.messages.map(({ role, content }) => ({
        role,
        content,
      }));
      const summaryLease = reservation.summaryLease;
      after(async () => {
        try {
          const summary = await summarizeXenoConversation({
            apiKey: process.env.OLLAMA_API_KEY,
            model: process.env.OLLAMA_NPC_MODEL,
            currentSummary,
            messages,
          });
          if (summary) {
            await saveXenoConversationSummary({
              actor,
              summary,
              summaryLeaseToken: summaryLease.token,
              summaryGeneration: summaryLease.generation,
            });
          }
        } catch (error) {
          console.error("[research-lab/xeno] summary failed", error);
        }
      });
    }

    const response: ResearchChatResponse = {
      ok: true,
      message: {
        role: "assistant",
        content: generation.text,
        createdAt: assistantCreatedAt.toISOString(),
      },
      source: generation.source,
      expression: getXenoRelationshipPresentation(relationship.state).expression,
      remaining: Math.max(
        0,
        XENO_CHAT_DAILY_LIMIT - reservation.conversation.dailyUsageCount,
      ),
      retryAt: new Date(
        assistantCreatedAt.getTime() + XENO_CHAT_COOLDOWN_MS,
      ).toISOString(),
    };
    return NextResponse.json(response);
  } catch (error) {
    return researchLabErrorResponse(error, "제노와 대화하지 못했습니다.");
  }
}
