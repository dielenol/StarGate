export function buildShopReorderRequestId(
  today: string,
  userId: string,
  slug: string,
  sequence?: number,
): string {
  const base = `shop-reorder:${today}:${userId}:${slug}`;
  return sequence && sequence > 1 ? `${base}:${sequence}` : base;
}
