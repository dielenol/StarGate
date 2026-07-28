import { createHash } from "node:crypto";

import { buildAmeriWorkshopDiscordDmContent } from "@stargate/core/domain/discord-dm-dialogue";
import {
  JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE,
  resolveDiscordDmRecipients,
  type DiscordDmRecipientKind,
} from "@stargate/shared-db";

import type {
  EquipmentWorkshopRequestKind,
  EquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";
import type { EquipmentWorkshopDiscordDmEvent } from "@/lib/equipment-shop/workshop-discord-dm-outbox";
import {
  sendDiscordDirectMessage,
  type DiscordDirectMessageInput,
  type DiscordDirectMessageOptions,
  type DiscordDirectMessageResult,
} from "@/lib/discord/direct-message";

export interface EquipmentWorkshopDiscordDmInput {
  requestId: string;
  event: EquipmentWorkshopDiscordDmEvent;
  userId: string;
  kind: EquipmentWorkshopRequestKind;
  characterCodename: string;
  equipmentName?: string;
  quoteVersion?: number;
  totalCost?: number;
  durationMinutes?: number;
  readyAt?: Date | string;
  specialistWorkflow?: readonly {
    specialistCodename: EquipmentWorkshopSpecialist;
    task: string;
  }[];
  note?: string;
}

export type EquipmentWorkshopDiscordDmResult =
  | "sent"
  | "skipped_unconfigured"
  | "skipped_unlinked"
  | "skipped_inactive"
  | "skipped_unreachable";

interface EquipmentWorkshopDiscordDmDependencies {
  botToken?: string | null;
  siteBaseUrl?: string;
  resolveRecipients?: typeof resolveDiscordDmRecipients;
  sendDirectMessage?: (
    input: DiscordDirectMessageInput,
    options?: DiscordDirectMessageOptions,
  ) => Promise<DiscordDirectMessageResult>;
}

const DEFAULT_SITE_BASE_URL = "https://www.ordonet.co.kr";

function getSiteBaseUrl(override?: string): string {
  const candidate =
    override ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    DEFAULT_SITE_BASE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_SITE_BASE_URL;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_BASE_URL;
  }
}

function buildNonce(
  input: EquipmentWorkshopDiscordDmInput,
  recipientKind: DiscordDmRecipientKind = "primary",
): string {
  return createHash("sha256")
    .update(
      [
        "equipment-workshop",
        input.requestId,
        input.event,
        input.quoteVersion ?? 0,
        ...(recipientKind === "mirror" ? ["mirror"] : []),
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 25);
}

export function buildEquipmentWorkshopDiscordDmContent(
  input: EquipmentWorkshopDiscordDmInput,
  siteBaseUrl?: string,
): string {
  const workshopUrl = `${getSiteBaseUrl(siteBaseUrl)}/erp/equipment-shop/custom`;
  return buildAmeriWorkshopDiscordDmContent({
    ...input,
    workshopUrl,
  });
}

export async function notifyEquipmentWorkshopDiscordDm(
  input: EquipmentWorkshopDiscordDmInput,
  dependencies: EquipmentWorkshopDiscordDmDependencies = {},
): Promise<EquipmentWorkshopDiscordDmResult> {
  const botToken =
    dependencies.botToken === undefined
      ? process.env.AMERI_DISCORD_BOT_TOKEN
      : dependencies.botToken;
  const normalizedBotToken = botToken?.trim();
  if (!normalizedBotToken) return "skipped_unconfigured";

  const resolution = await (
    dependencies.resolveRecipients ?? resolveDiscordDmRecipients
  )(
    input.userId,
    { mirror: JTEST_WORKSHOP_DISCORD_DM_MIRROR_RULE },
  );
  if (resolution.sourceState === "inactive") {
    return "skipped_inactive";
  }
  if (resolution.recipients.length === 0) return "skipped_unlinked";

  const content = buildEquipmentWorkshopDiscordDmContent(
    input,
    dependencies.siteBaseUrl,
  );
  const send = dependencies.sendDirectMessage ?? sendDiscordDirectMessage;
  const errors: unknown[] = [];
  let sentCount = 0;
  for (const recipient of resolution.recipients) {
    try {
      await send(
        {
          recipientId: recipient.discordId,
          content,
          nonce: buildNonce(input, recipient.kind),
        },
        { botToken: normalizedBotToken },
      );
      sentCount += 1;
    } catch (error) {
      errors.push(error);
    }
  }

  const retryableError = errors.find(
    (error) =>
      !(
        error instanceof Error &&
        /Discord .* 실패 \(403\)/.test(error.message)
      ),
  );
  if (retryableError) throw retryableError;
  if (sentCount > 0) return "sent";
  if (errors.length > 0) throw errors[0];
  return "sent";
}
