const ASSISTANT_GM_DISPLAY_NAME_MARKERS = ["레놀", "흑우", "마귀"] as const;

export const ASSISTANT_GM_LABEL = "부 GM";

export function getParticipantCodenameOverride(
  displayName: string | undefined,
): string | undefined {
  if (!displayName) return undefined;

  const normalized = displayName.toLowerCase().replace(/\s+/g, "");
  if (!normalized) return undefined;

  return ASSISTANT_GM_DISPLAY_NAME_MARKERS.some((marker) =>
    normalized.includes(marker),
  )
    ? ASSISTANT_GM_LABEL
    : undefined;
}
