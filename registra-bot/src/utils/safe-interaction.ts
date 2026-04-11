/**
 * Discord 인터랙션/이벤트 안전 실행 래퍼
 *
 * 최상위 이벤트 핸들러에서 예외가 새어 나가지 않도록 잡고,
 * 가능한 경우 사용자에게 fallback 응답을 보냅니다.
 *
 * @module utils/safe-interaction
 */

import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { D, L } from "../constants/registrar-voice.js";

type SupportedInteraction =
  | AutocompleteInteraction
  | ChatInputCommandInteraction
  | ButtonInteraction;

async function sendInteractionFallback(
  kind: string,
  interaction: SupportedInteraction
): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      if (!interaction.responded) {
        await interaction.respond([]);
      }
      return;
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: D.interactionUnexpected,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: D.interactionUnexpected,
      flags: MessageFlags.Ephemeral,
    });
  } catch (fallbackErr) {
    console.error(L.interactionFallback(kind), fallbackErr);
  }
}

export async function safeHandleInteraction<T extends SupportedInteraction>(
  kind: string,
  interaction: T,
  handler: (interaction: T) => Promise<void>
): Promise<void> {
  try {
    await handler(interaction);
  } catch (err) {
    console.error(L.interactionUnhandled(kind), err);
    await sendInteractionFallback(kind, interaction);
  }
}

export async function runSafely(
  errorLabel: string,
  handler: () => Promise<void>
): Promise<void> {
  try {
    await handler();
  } catch (err) {
    console.error(errorLabel, err);
  }
}
