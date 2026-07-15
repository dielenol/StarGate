import type { EquipmentSlot } from "@stargate/shared-db/types";

import {
  parseEquipmentWorkshopQuote,
  type EquipmentWorkshopModificationDomain,
  type EquipmentWorkshopQuoteInput,
  type EquipmentWorkshopSpecialist,
} from "@/lib/equipment-shop/workshop-request";

export const EQUIPMENT_WORKSHOP_BLUEPRINT_STATUSES = [
  "DRAFT",
  "ARCHIVED",
] as const;

export type EquipmentWorkshopBlueprintStatus =
  (typeof EQUIPMENT_WORKSHOP_BLUEPRINT_STATUSES)[number];

export interface EquipmentWorkshopBlueprintApplicability {
  kinds: Array<"upgrade" | "custom">;
  sourceSlugs: string[];
  sourceCategories: EquipmentSlot[];
  resultCategory: EquipmentSlot;
}

export interface EquipmentWorkshopBlueprintDefaults {
  creditCost: number;
  durationMinutes: number;
  specialistCodename: EquipmentWorkshopSpecialist;
  specialistNote?: string;
  modificationDomain: EquipmentWorkshopModificationDomain;
  materials: Array<{ slug: string; quantity: number }>;
  result: Omit<EquipmentWorkshopQuoteInput["result"], "category">;
}

export interface SerializedEquipmentWorkshopBlueprint {
  _id: string;
  slug: string;
  displayName: string;
  version: number;
  status: EquipmentWorkshopBlueprintStatus;
  applicability: EquipmentWorkshopBlueprintApplicability;
  defaults: EquipmentWorkshopBlueprintDefaults;
  sourceClass: "design-proposal";
  balanceStatus: "balance-candidate";
  createdById: string;
  createdByName: string;
  updatedById: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentWorkshopBlueprintInput {
  slug: string;
  displayName: string;
  applicability: EquipmentWorkshopBlueprintApplicability;
  defaults: EquipmentWorkshopBlueprintDefaults;
}

export type EquipmentWorkshopBlueprintValidation =
  | { ok: true; input: EquipmentWorkshopBlueprintInput }
  | { ok: false; error: string };

function uniqueStrings(value: unknown, pattern: RegExp, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parsed.length !== value.length || parsed.some((entry) => !pattern.test(entry))) {
    return null;
  }
  return [...new Set(parsed)];
}

export function parseEquipmentWorkshopBlueprint(
  body: unknown,
): EquipmentWorkshopBlueprintValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "설계안 형식이 올바르지 않습니다." };
  }
  const source = body as Record<string, unknown>;
  const slug = typeof source.slug === "string" ? source.slug.trim() : "";
  const displayName =
    typeof source.displayName === "string" ? source.displayName.trim() : "";
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug)) {
    return { ok: false, error: "설계안 slug는 영문 소문자·숫자·하이픈·밑줄 2~80자로 입력해 주세요." };
  }
  if (!displayName || displayName.length > 80) {
    return { ok: false, error: "설계안 이름은 1~80자여야 합니다." };
  }

  const rawApplicability = source.applicability;
  const rawDefaults = source.defaults;
  if (
    !rawApplicability ||
    typeof rawApplicability !== "object" ||
    Array.isArray(rawApplicability) ||
    !rawDefaults ||
    typeof rawDefaults !== "object" ||
    Array.isArray(rawDefaults)
  ) {
    return { ok: false, error: "설계안 적용 범위와 기본값이 필요합니다." };
  }

  const applicability = rawApplicability as Record<string, unknown>;
  const kinds = uniqueStrings(applicability.kinds, /^(upgrade|custom)$/, 2);
  const sourceSlugs = uniqueStrings(
    applicability.sourceSlugs ?? [],
    /^[a-z0-9][a-z0-9_-]{1,79}$/,
    30,
  );
  const sourceCategories = uniqueStrings(
    applicability.sourceCategories ?? [],
    /^(WEAPON|ARMOR)$/,
    2,
  ) as EquipmentSlot[] | null;
  const resultCategory = applicability.resultCategory;
  if (
    !kinds ||
    kinds.length === 0 ||
    !sourceSlugs ||
    !sourceCategories ||
    (resultCategory !== "WEAPON" && resultCategory !== "ARMOR")
  ) {
    return { ok: false, error: "설계안 적용 요청·원본·결과 분류를 확인해 주세요." };
  }

  const defaults = rawDefaults as Record<string, unknown>;
  if (!Array.isArray(defaults.materials)) {
    return { ok: false, error: "설계안 재료 목록이 올바르지 않습니다." };
  }
  const materials: Array<{ slug: string; quantity: number }> = [];
  const seen = new Set<string>();
  for (const raw of defaults.materials) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "설계안 재료 항목이 올바르지 않습니다." };
    }
    const material = raw as Record<string, unknown>;
    const materialSlug =
      typeof material.slug === "string" ? material.slug.trim() : "";
    const quantity = material.quantity;
    if (
      !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(materialSlug) ||
      !Number.isInteger(quantity) ||
      Number(quantity) < 1 ||
      Number(quantity) > 999 ||
      seen.has(materialSlug)
    ) {
      return { ok: false, error: "설계안 재료 slug·수량 또는 중복 항목을 확인해 주세요." };
    }
    seen.add(materialSlug);
    materials.push({ slug: materialSlug, quantity: Number(quantity) });
  }

  const quoteValidation = parseEquipmentWorkshopQuote({
    expectedVersion: 0,
    creditCost: defaults.creditCost,
    durationMinutes: defaults.durationMinutes,
    specialistCodename: defaults.specialistCodename,
    specialistNote: defaults.specialistNote,
    modificationDomain: defaults.modificationDomain,
    materials,
    result: {
      ...((defaults.result as Record<string, unknown> | undefined) ?? {}),
      category: resultCategory,
    },
  });
  if (!quoteValidation.ok) return quoteValidation;
  if (!quoteValidation.input.specialistCodename) {
    return { ok: false, error: "설계안 주 담당자를 지정해 주세요." };
  }

  const { category: _category, ...result } = quoteValidation.input.result;
  void _category;
  return {
    ok: true,
    input: {
      slug,
      displayName,
      applicability: {
        kinds: kinds as Array<"upgrade" | "custom">,
        sourceSlugs,
        sourceCategories,
        resultCategory,
      },
      defaults: {
        creditCost: quoteValidation.input.creditCost,
        durationMinutes: quoteValidation.input.durationMinutes,
        specialistCodename: quoteValidation.input.specialistCodename,
        ...(quoteValidation.input.specialistNote
          ? { specialistNote: quoteValidation.input.specialistNote }
          : {}),
        modificationDomain: quoteValidation.input.modificationDomain,
        materials,
        result,
      },
    },
  };
}
