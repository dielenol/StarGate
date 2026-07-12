import { createHmac, timingSafeEqual } from "node:crypto";

import type { EquipmentShopCatalogItem } from "./catalog";

export const ARMOR_REFERRAL_COOKIE_NAME = "novus_armor_referral";
export const ARMOR_REFERRAL_DISCOUNT_PERCENT = 10;
export const ARMOR_REFERRAL_TTL_MS = 30 * 60 * 1000;

const ARMOR_REFERRAL_VERSION = 1;
const MAX_REFERRAL_ITEMS = 12;

interface ArmorReferralPayload {
  version: typeof ARMOR_REFERRAL_VERSION;
  userId: string;
  characterId: string;
  items: Record<string, number>;
}

interface ArmorReferralContext {
  userId: string;
  characterId: string;
  secret: string;
  nowMs?: number;
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function decodeArmorReferralToken(
  token: string | null | undefined,
  context: ArmorReferralContext,
): ArmorReferralPayload | null {
  if (!token || !context.secret) return null;
  const [encodedPayload, signature, ...rest] = token.split(".");
  if (!encodedPayload || !signature || rest.length > 0) return null;
  const expectedSignature = signPayload(encodedPayload, context.secret);
  if (!signaturesMatch(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ArmorReferralPayload>;
    if (
      payload.version !== ARMOR_REFERRAL_VERSION ||
      payload.userId !== context.userId ||
      payload.characterId !== context.characterId ||
      !payload.items ||
      typeof payload.items !== "object"
    ) {
      return null;
    }

    const nowMs = context.nowMs ?? Date.now();
    const items = Object.fromEntries(
      Object.entries(payload.items).filter(
        ([key, expiresAt]) =>
          key.length > 0 &&
          typeof expiresAt === "number" &&
          Number.isFinite(expiresAt) &&
          expiresAt > nowMs,
      ),
    );
    return {
      version: ARMOR_REFERRAL_VERSION,
      userId: context.userId,
      characterId: context.characterId,
      items,
    };
  } catch {
    return null;
  }
}

export function issueArmorReferralToken(args: ArmorReferralContext & {
  itemKey: string;
  existingToken?: string | null;
}): { token: string; expiresAt: number } {
  const nowMs = args.nowMs ?? Date.now();
  const current = decodeArmorReferralToken(args.existingToken, {
    ...args,
    nowMs,
  });
  const expiresAt = nowMs + ARMOR_REFERRAL_TTL_MS;
  const entries = Object.entries({
    ...(current?.items ?? {}),
    [args.itemKey]: expiresAt,
  })
    .sort(([, left], [, right]) => right - left)
    .slice(0, MAX_REFERRAL_ITEMS);
  const payload: ArmorReferralPayload = {
    version: ARMOR_REFERRAL_VERSION,
    userId: args.userId,
    characterId: args.characterId,
    items: Object.fromEntries(entries),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    token: `${encodedPayload}.${signPayload(encodedPayload, args.secret)}`,
    expiresAt,
  };
}

export function quoteAcheronArmorReferral(args: ArmorReferralContext & {
  itemKey: string;
  listPrice: number;
  token?: string | null;
}): {
  price: number;
  listPrice: number;
  discount: EquipmentShopCatalogItem["discount"] | null;
} {
  const listPrice = Math.max(0, Math.floor(args.listPrice));
  const payload = decodeArmorReferralToken(args.token, args);
  const expiresAt = payload?.items[args.itemKey];
  if (!expiresAt) {
    return { price: listPrice, listPrice, discount: null };
  }

  const price = Math.floor(
    (listPrice * (100 - ARMOR_REFERRAL_DISCOUNT_PERCENT)) / 100,
  );
  return {
    price,
    listPrice,
    discount: {
      type: "towaski-armor-referral",
      percent: ARMOR_REFERRAL_DISCOUNT_PERCENT,
      amount: listPrice - price,
      expiresAt: new Date(expiresAt).toISOString(),
    },
  };
}

export function applyAcheronArmorReferrals(
  items: EquipmentShopCatalogItem[],
  context: ArmorReferralContext & { token?: string | null },
): EquipmentShopCatalogItem[] {
  return items.map((item) => {
    if (
      item.zone !== "acheron" ||
      item.sourceZone !== "towaski" ||
      item.category !== "ARMOR"
    ) {
      return item;
    }
    const quote = quoteAcheronArmorReferral({
      ...context,
      itemKey: item.key,
      listPrice: item.price,
    });
    return quote.discount
      ? {
          ...item,
          price: quote.price,
          listPrice: quote.listPrice,
          discount: quote.discount,
        }
      : item;
  });
}
