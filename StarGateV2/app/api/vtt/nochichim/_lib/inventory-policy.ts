interface NochichimConsumableCandidate {
  category?: string;
  slug?: string;
}

/**
 * ERP 안에서는 CONSUMABLE로 보관되지만 노치찜 전투에서 직접 사용하면 안 되는 품목.
 * 재료·전용 장비 탄약·ERP 전용 추첨·공용 호출권은 각자의 원장으로만 소비한다.
 */
export const NOCHICHIM_PERSONAL_CONSUMABLE_EXCLUDED_SLUGS = new Set([
  "force_core",
  "zulu-0028-censor-3",
  "mrbeast_lottery",
  "mrbeast_apology_lottery",
  "white-rose-assistant-call",
]);

export function isNochichimPersonalConsumable(
  item: NochichimConsumableCandidate | null | undefined,
): boolean {
  if (item?.category !== "CONSUMABLE") return false;
  const slug = item.slug?.trim().toLowerCase() ?? "";
  return !slug || !NOCHICHIM_PERSONAL_CONSUMABLE_EXCLUDED_SLUGS.has(slug);
}
