import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import { findMainCharacterByOwner } from "@/lib/db/characters";
import { getCharacterBalance } from "@/lib/db/credits";
import { listOwnedTowaskiLicenseSlugs } from "@/lib/db/equipment-licenses";
import { findMasterItemsBySlugsOrIds } from "@/lib/db/inventory";
import {
  equipmentShopItemZone,
  toEquipmentPriceNumber,
} from "@/lib/equipment-shop/catalog";
import {
  getEquipmentLicenseRequirement,
  isTowaskiLicenseSlug,
  resolveEquipmentLicenseStatus,
} from "@/lib/equipment-shop/licenses";
import { TOWASKI_BASIC_FIREARM_LICENSE_SLUG } from "@/lib/equipment-shop/license-test";
import { evaluateEquipmentPurchaseEligibility } from "@/lib/equipment-shop/purchase-eligibility";

interface QuoteBody {
  key?: unknown;
  simulatePlayerRules?: unknown;
  basicLicenseOverride?: unknown;
  balanceOverride?: unknown;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session.user.role, "GM")) {
    return NextResponse.json(
      { error: "GM만 구매 드라이런을 실행할 수 있습니다." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as QuoteBody | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "판정할 품목 key가 필요합니다." }, { status: 400 });
  }

  const character = await findMainCharacterByOwner(session.user.id);
  const agent = character?.type === "AGENT" ? character : null;

  const itemCandidates = await findMasterItemsBySlugsOrIds([key]);
  const item =
    itemCandidates.find((candidate) => candidate.slug === key) ??
    itemCandidates.find((candidate) => String(candidate._id) === key) ??
    null;
  const zone = item ? equipmentShopItemZone(item) : null;
  const price = item ? toEquipmentPriceNumber(item.price) : null;
  if (!item?._id || zone !== "towaski" || price === null) {
    return NextResponse.json(
      { error: "토와스키 판매 품목을 찾을 수 없습니다.", code: "ITEM_NOT_AVAILABLE" },
      { status: 400 },
    );
  }

  const characterId = agent?._id ? String(agent._id) : null;
  const [ownedLicenseSlugs, liveBalance] = await Promise.all([
    characterId
      ? listOwnedTowaskiLicenseSlugs(characterId)
      : Promise.resolve(new Set<string>()),
    characterId ? getCharacterBalance(characterId) : Promise.resolve(0),
  ]);
  const balanceOverride =
    typeof body?.balanceOverride === "number" &&
    Number.isFinite(body.balanceOverride) &&
    body.balanceOverride >= 0
      ? Math.floor(body.balanceOverride)
      : null;
  const balance = balanceOverride ?? liveBalance;
  const hasBasicLicense =
    typeof body?.basicLicenseOverride === "boolean"
      ? body.basicLicenseOverride
      : ownedLicenseSlugs.has(TOWASKI_BASIC_FIREARM_LICENSE_SLUG);
  const requirement = getEquipmentLicenseRequirement(item);
  const licenseStatus = requirement
    ? resolveEquipmentLicenseStatus({
        character: agent ?? { codename: "DEBUG AGENT" },
        requirement,
        ownedLicenseSlugs,
      })
    : undefined;
  const simulatePlayerRules = body?.simulatePlayerRules !== false;
  const eligibility = evaluateEquipmentPurchaseEligibility({
    isGM: !simulatePlayerRules,
    hasBasicLicense,
    available: item.isAvailable !== false && item.isPublic !== false,
    price,
    balance,
    licenseOwned:
      isTowaskiLicenseSlug(item.slug) && ownedLicenseSlugs.has(item.slug),
    ...(requirement ? { licenseRequirement: requirement } : {}),
    ...(licenseStatus ? { licenseStatus } : {}),
  });

  return NextResponse.json({
    key,
    name: item.name,
    simulatePlayerRules,
    eligibility,
    balance,
    price,
    balanceAfter: eligibility.eligible ? balance - price : balance,
    source: characterId ? "live_character" : "gm_sandbox",
    licenseStatus: licenseStatus ?? null,
  });
}
