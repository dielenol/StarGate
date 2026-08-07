import { z } from "zod";

import { factionRelationshipSchema, factionScopeSchema } from "./faction.schema.js";
import { institutionSubUnitSchema } from "./institution.schema.js";
import { catalogSlugSchema, codeSchema, slugSchema } from "./common.js";
import {
  characterLifeStatusSchema,
  hasCompleteCharacterLifeStatusEvidence,
  loreSheetSchema,
  playSheetSchema,
} from "./npc.schema.js";

export const SEED_PAYLOAD_COLLECTIONS = [
  "characters",
  "wiki_pages",
  "master_items",
  "factions",
  "institutions",
  "session_reports",
  "equipment_workshop_blueprints",
] as const;

export const seedPayloadCollectionSchema = z.enum(SEED_PAYLOAD_COLLECTIONS);
export type SeedPayloadCollection = z.infer<typeof seedPayloadCollectionSchema>;

const dateLikeSchema = z.union([
  z.date(),
  z.iso.datetime({ offset: true }),
]);
const stringArraySchema = z.array(z.string());
const reportReferenceArraySchema = z
  .array(z.string().trim().min(1).max(160))
  .max(200)
  .refine((values) => new Set(values).size === values.length, {
    message: "related reference는 중복될 수 없습니다.",
  });
const unknownObjectSchema = z.record(z.string(), z.unknown());
const finiteMoneySchema = z
  .number()
  .finite()
  .nonnegative()
  .refine((value) => Number(value.toFixed(2)) === value, {
    message: "금액은 소수점 둘째 자리까지만 허용됩니다.",
  });
const uniqueStrings = (schema: z.ZodType<string>, max: number) =>
  z.array(schema).max(max).refine((values) => new Set(values).size === values.length, {
    message: "배열 값은 중복될 수 없습니다.",
  });

const shopMetaSchema = z
  .object({
    stockMin: z.number().int().min(0).max(999),
    stockMax: z.number().int().min(0).max(999),
    appearRate: z.number().finite().min(0).max(1),
    icon: z.string().trim().min(1).max(16).optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    pageGroup: z.enum(["BASIC", "RECOVERY", "LUXURY", "RARE"]).optional(),
  })
  .strict()
  .refine((value) => value.stockMin <= value.stockMax, {
    path: ["stockMax"],
    message: "stockMax는 stockMin 이상이어야 합니다.",
  });

const masterItemLoreSchema = z
  .object({
    background: z.string().optional(),
    acquisition: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

const workshopSpecialistSchema = z.enum([
  "VERNIER",
  "TEMPER",
  "TOWASKI",
  "SUTURE",
  "RATCHET",
]);
const workshopModificationDomainSchema = z.enum([
  "GENERAL",
  "ENERGY_EXPLOSIVE_OUTPUT",
  "BIO_REGEN_REPAIR",
]);
const workshopEquipmentDamageSchema = z
  .object({
    type: z.enum(["PHYSICAL", "FIRE", "PSYCHIC", "SOUND"]),
    amount: z.number().int().min(1).max(999),
    ignoresDefense: z.boolean().optional(),
    scaling: z.literal("NONE"),
  })
  .strict();
const workshopEquipmentActionSchema = z
  .object({
    code: z.string().regex(/^U[1-9][0-9]?$/),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
    effect: z.string().trim().min(1).max(1_000),
    kind: z.enum(["CHARGED", "STANCE", "CONSUMABLE"]).optional(),
    actionCost: z.literal(1),
    chargeCost: z.number().int().min(0).max(99),
    maxCharges: z.number().int().min(0).max(99),
    reloadCreditCost: finiteMoneySchema,
    reloadApproval: z.literal("GM"),
    reloadable: z.boolean().optional(),
    requiresMounted: z.boolean().optional(),
    consumesRegularAmmo: z.number().int().min(0).max(99).optional(),
    rangeMinCells: z.number().int().min(0).max(99).optional(),
    rangeMaxCells: z.number().int().min(0).max(99).optional(),
    damage: workshopEquipmentDamageSchema.optional(),
    usesWeaponAttack: z.boolean().optional(),
    additionalDamage: workshopEquipmentDamageSchema.optional(),
    consumableCost: z
      .object({
        slug: catalogSlugSchema,
        quantity: z.number().int().min(1).max(99),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const kind = value.kind ?? "CHARGED";
    if ((value.rangeMinCells === undefined) !== (value.rangeMaxCells === undefined)) {
      ctx.addIssue({ code: "custom", path: ["rangeMaxCells"], message: "사거리 최소/최대는 함께 지정해야 합니다." });
    }
    if (
      value.rangeMinCells !== undefined &&
      value.rangeMaxCells !== undefined &&
      value.rangeMaxCells < value.rangeMinCells
    ) {
      ctx.addIssue({ code: "custom", path: ["rangeMaxCells"], message: "최대 사거리는 최소 사거리 이상이어야 합니다." });
    }
    if (kind === "CHARGED" && (value.chargeCost < 1 || value.maxCharges < value.chargeCost)) {
      ctx.addIssue({ code: "custom", path: ["maxCharges"], message: "충전 액션의 최대 충전은 충전 비용 이상이어야 합니다." });
    }
    if (
      (kind === "STANCE" || kind === "CONSUMABLE") &&
      (value.chargeCost !== 0 ||
        value.maxCharges !== 0 ||
        value.reloadCreditCost !== 0 ||
        value.reloadable !== false)
    ) {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "STANCE/CONSUMABLE 액션은 충전·재장전 값을 0/false로 고정해야 합니다." });
    }
    if ((kind === "CONSUMABLE") !== Boolean(value.consumableCost)) {
      ctx.addIssue({ code: "custom", path: ["consumableCost"], message: "CONSUMABLE 액션만 실제 소모품 비용을 가져야 합니다." });
    }
    if (value.additionalDamage && value.usesWeaponAttack !== true) {
      ctx.addIssue({ code: "custom", path: ["additionalDamage"], message: "추가 피해는 구조화 무기 사격과 함께 사용해야 합니다." });
    }
    if (value.usesWeaponAttack === true && value.rangeMinCells === undefined) {
      ctx.addIssue({ code: "custom", path: ["rangeMinCells"], message: "구조화 무기 사격 액션에는 사거리가 필요합니다." });
    }
  });

const workshopCombatProfileSchema = z
  .object({
    ammoCapacity: z.number().int().min(1).max(999).optional(),
    mount: z
      .object({
        mountActionCost: z.literal(1),
        unmountActionCost: z.literal(1),
        blocksMovement: z.boolean(),
        allowsDiagonalFire: z.boolean(),
        diagonalFireRequiresMounted: z.boolean().optional(),
        mountedRangeShape: z.literal("DIAMOND").optional(),
        bonusDamage: z.number().int().min(0).max(999),
      })
      .strict()
      .optional(),
    weaponAttack: z
      .object({
        weaponCategory: z.string().trim().min(1).max(40),
        rangeMinCells: z.number().int().min(0).max(99),
        rangeMaxCells: z.number().int().min(0).max(99),
        usesCharacterAttack: z.literal(false),
        consumesRegularAmmo: z.number().int().min(1).max(99),
        damageByRange: z
          .array(
            z
              .object({
                minCells: z.number().int().min(0).max(99),
                maxCells: z.number().int().min(0).max(99),
                damage: workshopEquipmentDamageSchema,
              })
              .strict(),
          )
          .min(1)
          .max(10),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.ammoCapacity === undefined &&
      value.mount === undefined &&
      value.weaponAttack === undefined
    ) {
      ctx.addIssue({ code: "custom", message: "combatProfile에는 ammoCapacity, mount 또는 weaponAttack이 필요합니다." });
    }
    const attack = value.weaponAttack;
    if (!attack) return;
    if (attack.rangeMaxCells < attack.rangeMinCells) {
      ctx.addIssue({ code: "custom", path: ["weaponAttack", "rangeMaxCells"], message: "최대 사거리는 최소 사거리 이상이어야 합니다." });
      return;
    }
    if (
      value.ammoCapacity === undefined ||
      attack.consumesRegularAmmo > value.ammoCapacity
    ) {
      ctx.addIssue({ code: "custom", path: ["weaponAttack", "consumesRegularAmmo"], message: "구조화 총기 사격은 탄창 용량 이내의 일반 탄약을 소비해야 합니다." });
    }
    let nextCell = attack.rangeMinCells;
    for (const [index, band] of attack.damageByRange.entries()) {
      if (
        band.minCells !== nextCell ||
        band.maxCells < band.minCells ||
        band.maxCells > attack.rangeMaxCells
      ) {
        ctx.addIssue({ code: "custom", path: ["weaponAttack", "damageByRange", index], message: "사거리 피해 구간은 최소부터 최대까지 빈틈없이 이어져야 합니다." });
        return;
      }
      nextCell = band.maxCells + 1;
    }
    if (nextCell !== attack.rangeMaxCells + 1) {
      ctx.addIssue({ code: "custom", path: ["weaponAttack", "damageByRange"], message: "사거리 피해 구간이 최대 사거리까지 이어져야 합니다." });
    }
  });

const workshopResultSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
    damage: z.string().trim().min(1).max(80).optional(),
    effect: z.string().trim().min(1).max(120).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    previewImage: z
      .string()
      .trim()
      .max(500)
      .refine((value) => value.startsWith("/assets/") || /^https:\/\//i.test(value), {
        message: "previewImage는 /assets/ 또는 HTTPS 경로여야 합니다.",
      })
      .optional(),
    equipmentAction: workshopEquipmentActionSchema.optional(),
    equipmentActions: z
      .array(workshopEquipmentActionSchema)
      .min(1)
      .max(5)
      .refine((actions) => new Set(actions.map((action) => action.code)).size === actions.length, {
        message: "equipmentActions code는 중복될 수 없습니다.",
      })
      .refine(
        (actions) => actions.every((action) => (action.kind ?? "CHARGED") === "STANCE" || action.reloadable === false),
        { message: "복수 CHARGED 액션은 reloadable=false여야 합니다." },
      )
      .optional(),
    combatProfile: workshopCombatProfileSchema.optional(),
    equipmentAbilityOverrides: z
      .array(
        z
          .object({
            targetCode: z.string().trim().min(1).max(40),
            effect: z.string().trim().min(1).max(1_000),
          })
          .strict(),
      )
      .max(11)
      .refine((values) => new Set(values.map((value) => value.targetCode)).size === values.length, {
        message: "equipmentAbilityOverrides targetCode는 중복될 수 없습니다.",
      })
      .optional(),
  })
  .strict()
  .refine((value) => !(value.equipmentAction && value.equipmentActions), {
    message: "equipmentAction과 equipmentActions는 함께 지정할 수 없습니다.",
  });

const workshopApplicabilitySchema = z
  .object({
    kinds: uniqueStrings(z.enum(["upgrade", "custom"]), 2).min(1),
    sourceSlugs: uniqueStrings(slugSchema, 30),
    sourceCategories: uniqueStrings(z.enum(["WEAPON", "ARMOR"]), 2),
    resultCategory: z.enum(["WEAPON", "ARMOR"]),
  })
  .strict();

const workshopMaterialReferenceSchema = z
  .object({
    slug: catalogSlugSchema,
    scope: z.enum(["CHARACTER", "SHARED"]).optional(),
    quantity: z.number().int().min(1).max(999),
  })
  .strict();

const workshopApprovalGateSchema = z
  .object({
    mode: z.literal("BUREAUCRAT_VOTE"),
    presetKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,119}$/).optional(),
    title: z.string().trim().min(1).max(100),
    content: z.string().trim().min(1).max(3_500),
    conditionalMaterials: z
      .array(workshopMaterialReferenceSchema)
      .max(200)
      .refine(
        (values) =>
          new Set(
            values.map((value) => `${value.scope ?? "CHARACTER"}:${value.slug}`),
          ).size === values.length,
        { message: "동일 scope/conditional material은 중복될 수 없습니다." },
      ),
    approvedOutputs: z
      .array(workshopMaterialReferenceSchema)
      .min(1)
      .max(50)
      .refine(
        (values) =>
          new Set(
            values.map((value) => `${value.scope ?? "CHARACTER"}:${value.slug}`),
          ).size === values.length,
        { message: "동일 scope/approved output은 중복될 수 없습니다." },
      ),
  })
  .strict();

const workshopDefaultsSchema = z
  .object({
    creditCost: finiteMoneySchema,
    durationMinutes: z.number().int().min(1_440).max(43_200),
    specialistCodename: workshopSpecialistSchema,
    specialistWorkflow: z
      .array(
        z
          .object({
            specialistCodename: workshopSpecialistSchema,
            task: z.string().trim().min(1).max(120),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .refine(
        (steps) => new Set(steps.map((step) => step.specialistCodename)).size === steps.length,
        { message: "specialistWorkflow 담당자는 중복될 수 없습니다." },
      )
      .optional(),
    specialistNote: z.string().trim().min(1).max(200).optional(),
    modificationDomain: workshopModificationDomainSchema,
    materials: z
      .array(workshopMaterialReferenceSchema)
      .max(200)
      .refine(
        (values) =>
          new Set(values.map((value) => `${value.scope ?? "CHARACTER"}:${value.slug}`)).size ===
          values.length,
        { message: "동일 scope/material은 중복될 수 없습니다." },
      ),
    approvalGate: workshopApprovalGateSchema.optional(),
    result: workshopResultSchema,
  })
  .strict()
  .refine(
    (value) =>
      !value.specialistWorkflow ||
      value.specialistWorkflow[0]?.specialistCodename === value.specialistCodename,
    { path: ["specialistWorkflow"], message: "주 담당자는 workflow 첫 담당자와 같아야 합니다." },
  )
  .refine(
    (value) => {
      if (!value.approvalGate) return true;
      const base = new Set(
        value.materials.map(
          (material) => `${material.scope ?? "CHARACTER"}:${material.slug}`,
        ),
      );
      return value.approvalGate.conditionalMaterials.every(
        (material) =>
          !base.has(`${material.scope ?? "CHARACTER"}:${material.slug}`),
      );
    },
    {
      path: ["approvalGate", "conditionalMaterials"],
      message: "기본 재료와 조건부 재료는 중복될 수 없습니다.",
    },
  );

/**
 * Seed payload는 신규 문서 전체뿐 아니라 기존 문서 patch에도 쓰인다.
 * 따라서 collection별 허용 필드와 필드 타입을 엄격히 검사하되 필수 필드는
 * `buildFilter`/DB 재조회에서 별도로 보장한다.
 */
const characterPatchSchema = z
  .object({
    codename: z.string().min(1),
    type: z.enum(["AGENT", "NPC"]),
    tier: z.enum(["MAIN", "MINI"]),
    role: z.string(),
    agentLevel: z.enum(["GM", "V", "A", "M", "H", "G", "J", "U"]),
    department: z.string(),
    factionCode: z.string(),
    institutionCode: z.string(),
    lifeStatus: characterLifeStatusSchema,
    lifeStatusAt: dateLikeSchema,
    lifeStatusEventId: z.string().min(1).max(80),
    ownerId: z.string().nullable(),
    isPublic: z.boolean(),
    lore: unknownObjectSchema,
    play: unknownObjectSchema,
    loreMd: z.string(),
    rawText: z.string(),
    source: z.string(),
    previewImage: z.string(),
    pixelCharacterImage: z.string(),
    warningVideo: z.string(),
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
    bulkUpdatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const wikiPagePatchSchema = z
  .object({
    slug: slugSchema,
    title: z.string().min(1),
    content: z.string(),
    summary: z.string(),
    category: z.string().min(1),
    tags: stringArraySchema,
    isPublic: z.boolean(),
    authorId: z.string().min(1),
    authorName: z.string().min(1),
    imageUrl: z.string(),
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const masterItemPatchSchema = z
  .object({
    slug: z.string().min(1),
    code: z.string().min(1),
    name: z.string().min(1),
    nameEn: z.string(),
    category: z.enum(["WEAPON", "ARMOR", "CONSUMABLE", "MATERIAL", "SPECIAL"]),
    description: z.string(),
    price: z.union([z.number().nonnegative(), z.string()]),
    damage: z.string(),
    effect: z.string(),
    shopMeta: shopMetaSchema,
    isAvailable: z.boolean(),
    tags: stringArraySchema,
    previewImage: z.string(),
    isPublic: z.boolean(),
    lore: masterItemLoreSchema,
    "lore.acquisition": z.string(),
    loreMd: z.string(),
    source: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const factionPatchSchema = z
  .object({
    code: codeSchema,
    slug: slugSchema,
    label: z.string().min(1).max(40),
    labelEn: z.string().max(60),
    scope: factionScopeSchema,
    summary: z.string().min(1).max(500),
    ideology: z.string().max(4_000),
    relationships: z.array(factionRelationshipSchema),
    notableMembers: z.array(codeSchema),
    tags: z.array(z.string().max(40)),
    isPublic: z.boolean(),
    loreMd: z.string(),
    source: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const institutionPatchSchema = z
  .object({
    code: codeSchema,
    slug: slugSchema,
    label: z.string().min(1).max(40),
    labelEn: z.string().max(60),
    parentFactionCode: codeSchema,
    subUnits: z.array(institutionSubUnitSchema),
    summary: z.string().min(1).max(500),
    mission: z.string().max(4_000),
    headquartersLocation: z.string().max(120),
    leaderCodename: codeSchema,
    relationships: z.array(factionRelationshipSchema),
    tags: z.array(z.string().max(40)),
    isPublic: z.boolean(),
    loreMd: z.string(),
    source: z.string(),
    authorId: z.string(),
    authorName: z.string(),
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const sessionReportPatchSchema = z
  .object({
    sessionId: z.string().min(1),
    provenanceSourceIds: uniqueStrings(z.string().min(1).max(200), 200),
    sessionTitle: z.string().min(1),
    reportNumber: z.string(),
    summary: z.string(),
    highlights: stringArraySchema,
    participants: stringArraySchema,
    locationLabel: z.string(),
    mapX: z.number().min(0).max(100),
    mapY: z.number().min(0).max(100),
    mapPrecision: z.enum(["confirmed", "estimated"]),
    gmId: z.string(),
    gmName: z.string(),
    relatedCatalogSlugs: reportReferenceArraySchema,
    relatedPersonnelCodenames: reportReferenceArraySchema,
    relatedWikiSlugs: reportReferenceArraySchema,
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const workshopBlueprintPatchSchema = z
  .object({
    slug: z.string().min(1),
    displayName: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(["DRAFT", "ARCHIVED"]),
    applicability: workshopApplicabilitySchema,
    defaults: workshopDefaultsSchema,
    sourceClass: z.literal("design-proposal"),
    balanceStatus: z.literal("balance-candidate"),
    createdById: z.string().min(1),
    createdByName: z.string().min(1),
    updatedById: z.string().min(1),
    updatedByName: z.string().min(1),
    createdAt: dateLikeSchema,
    updatedAt: dateLikeSchema,
  })
  .partial()
  .strict();

const PATCH_SCHEMAS = {
  characters: characterPatchSchema,
  wiki_pages: wikiPagePatchSchema,
  master_items: masterItemPatchSchema,
  factions: factionPatchSchema,
  institutions: institutionPatchSchema,
  session_reports: sessionReportPatchSchema,
  equipment_workshop_blueprints: workshopBlueprintPatchSchema,
} satisfies Record<SeedPayloadCollection, z.ZodType<Record<string, unknown>>>;

const REQUIRED_INSERT_FIELDS: Record<SeedPayloadCollection, readonly string[]> = {
  characters: [
    "codename",
    "type",
    "role",
    "previewImage",
    "ownerId",
    "isPublic",
    "lore",
    "createdAt",
    "updatedAt",
  ],
  wiki_pages: [
    "slug",
    "title",
    "content",
    "category",
    "tags",
    "isPublic",
    "authorId",
    "authorName",
    "createdAt",
    "updatedAt",
  ],
  master_items: [
    "slug",
    "name",
    "category",
    "description",
    "price",
    "isAvailable",
    "isPublic",
    "createdAt",
    "updatedAt",
  ],
  factions: ["code", "slug", "label", "summary", "isPublic", "createdAt", "updatedAt"],
  institutions: [
    "code",
    "slug",
    "label",
    "summary",
    "isPublic",
    "createdAt",
    "updatedAt",
  ],
  session_reports: [
    "sessionId",
    "sessionTitle",
    "summary",
    "highlights",
    "participants",
    "gmId",
    "gmName",
    "createdAt",
    "updatedAt",
  ],
  equipment_workshop_blueprints: [
    "slug",
    "displayName",
    "version",
    "status",
    "applicability",
    "defaults",
    "sourceClass",
    "balanceStatus",
    "createdById",
    "createdByName",
    "updatedById",
    "updatedByName",
    "createdAt",
    "updatedAt",
  ],
};

const ALLOWED_UPDATE_OPERATORS = new Set([
  "$set",
  "$setOnInsert",
  "$unset",
  "$addToSet",
  "$currentDate",
]);
const ALLOWED_PIPELINE_STAGES = new Set(["$set", "$unset"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
    .join(", ");
}

export function validateSeedPayloadPatch(
  collection: SeedPayloadCollection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const result = PATCH_SCHEMAS[collection].safeParse(payload);
  if (!result.success) {
    throw new Error(
      `[seed-payload] ${collection} payload schema 오류: ${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

/** 신규 insert/upsert 결과가 partial patch가 아닌 최소 완전 문서인지 검증한다. */
function assertRequiredStoredFields(
  collection: SeedPayloadCollection,
  parsed: Record<string, unknown>,
): void {
  const required = [...REQUIRED_INSERT_FIELDS[collection]];
  if (collection === "characters" && parsed.type === "AGENT") {
    required.push("play");
  }
  const missing = required.filter((field) => parsed[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[seed-payload] ${collection} 신규 문서 필수 필드 누락: ${missing.join(", ")}`,
    );
  }
  if (collection === "characters") {
    if (!hasCompleteCharacterLifeStatusEvidence(parsed)) {
      throw new Error(
        "[seed-payload] characters 저장 문서의 lifeStatus, lifeStatusAt, lifeStatusEventId는 모두 함께 존재하거나 모두 없어야 합니다.",
      );
    }
    loreSheetSchema.parse(parsed.lore);
    if (parsed.type === "AGENT") playSheetSchema.parse(parsed.play);
  }
}

/** 신규 insert/upsert payload는 알 수 없는 root까지 fail-closed로 거부한다. */
export function validateSeedInsertCandidate(
  collection: SeedPayloadCollection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = validateSeedPayloadPatch(collection, payload);
  assertRequiredStoredFields(collection, parsed);
  return parsed;
}

/**
 * 기존 row의 runner 관리 필드 전체와 필수 필드를 재검증한다. 다른 도메인이
 * 소유한 legacy/runtime root는 보존하되, managed field 누락·타입 drift는 숨기지 않는다.
 */
export function validateSeedStoredDocument(
  collection: SeedPayloadCollection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const managedRoots = allowedRootFields(collection);
  const managedPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => managedRoots.has(key)),
  );
  const parsed = validateSeedPayloadPatch(collection, managedPayload);
  assertRequiredStoredFields(collection, parsed);
  return parsed;
}

/** write 후 character consumer가 의존하는 전체 sheet 계약을 다시 검증한다. */
export function validateSeedCharacterSheets(payload: Record<string, unknown>): void {
  loreSheetSchema.parse(payload.lore);
  if (payload.type === "AGENT") playSheetSchema.parse(payload.play);
}

function allowedRootFields(collection: SeedPayloadCollection): Set<string> {
  return new Set(Object.keys(PATCH_SCHEMAS[collection].shape));
}

function assertAllowedUpdateFields(
  collection: SeedPayloadCollection,
  operand: unknown,
  operator: string,
): void {
  if (operator === "$unset" && Array.isArray(operand)) {
    for (const path of operand) {
      if (typeof path !== "string") {
        throw new Error(`[seed-payload] ${collection} $unset 경로는 문자열이어야 합니다.`);
      }
      assertAllowedPath(collection, path, operator);
    }
    return;
  }
  if (!isRecord(operand)) {
    throw new Error(`[seed-payload] ${collection} ${operator} 피연산자는 객체여야 합니다.`);
  }
  for (const path of Object.keys(operand)) {
    assertAllowedPath(collection, path, operator);
    if (collection === "characters") {
      validateCharacterSheetUpdatePath(path, (operand as Record<string, unknown>)[path], operator);
    }
  }
}

function getUpdateOperandPaths(operand: unknown, operator: string): string[] {
  if (operator === "$unset" && Array.isArray(operand)) {
    return operand.filter((path): path is string => typeof path === "string");
  }
  return isRecord(operand) ? Object.keys(operand) : [];
}

function updatePathsConflict(left: string, right: string): boolean {
  return (
    left === right ||
    left.startsWith(`${right}.`) ||
    right.startsWith(`${left}.`)
  );
}

/** MongoDB classic update가 거부하는 동일/부모-자식 경로 충돌을 실행 전에 차단한다. */
function assertNoConflictingUpdatePaths(
  collection: SeedPayloadCollection,
  entries: [string, unknown][],
): void {
  const visited: { operator: string; path: string }[] = [];
  for (const [operator, operand] of entries) {
    for (const path of getUpdateOperandPaths(operand, operator)) {
      const conflict = visited.find((candidate) =>
        updatePathsConflict(candidate.path, path),
      );
      if (conflict) {
        throw new Error(
          `[seed-payload] ${collection} update 경로 충돌: ${conflict.operator} ${conflict.path} / ${operator} ${path}`,
        );
      }
      visited.push({ operator, path });
    }
  }
}

function validateCharacterSheetUpdatePath(
  path: string,
  value: unknown,
  operator: string,
): void {
  const [root, field, ...nested] = path.split(".");
  const schema = root === "lore" ? loreSheetSchema : root === "play" ? playSheetSchema : null;
  if (!schema) return;
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  if (operator === "$unset") {
    if (!field || !shape[field] || !shape[field].isOptional()) {
      throw new Error(`[seed-payload] characters ${path} 필수 sheet 필드는 제거할 수 없습니다.`);
    }
    return;
  }
  // Mongo expression은 DB에서 평가한 뒤 runner의 full-document 재검증이 담당한다.
  if (isRecord(value) && Object.keys(value).some((key) => key.startsWith("$"))) return;
  if (!field) {
    schema.parse(value);
    return;
  }
  const fieldSchema = shape[field];
  if (!fieldSchema) {
    throw new Error(`[seed-payload] characters 허용되지 않은 sheet 필드: ${path}`);
  }
  // $addToSet operand is an array element (or $each expression), not the full
  // sheet field. The complete saved sheet validation below is authoritative.
  if (operator === "$addToSet") return;
  // Deep array/object paths are validated against the complete saved sheet after
  // Mongo applies the update. Parsing only the leaf here against the root field
  // schema would reject valid paths such as play.equipment.0.name.
  if (nested.length > 0) return;
  fieldSchema.parse(value);
}

function assertAllowedPath(
  collection: SeedPayloadCollection,
  path: string,
  operator: string,
): void {
  if (!path || path.startsWith("$") || path.includes("\0")) {
    throw new Error(`[seed-payload] ${collection} ${operator} 필드 경로가 유효하지 않습니다: ${path}`);
  }
  const root = path.split(".", 1)[0];
  if (!allowedRootFields(collection).has(root)) {
    throw new Error(
      `[seed-payload] ${collection} ${operator}가 허용되지 않은 필드를 변경합니다: ${path}`,
    );
  }
  if (
    operator === "$unset" &&
    path === root &&
    REQUIRED_INSERT_FIELDS[collection].includes(root)
  ) {
    throw new Error(
      `[seed-payload] ${collection} 필수 필드는 제거할 수 없습니다: ${path}`,
    );
  }
}

/** 허용 연산자와 collection별 root field 경계를 검증한다. */
export function validateSeedUpdate(
  collection: SeedPayloadCollection,
  update: Record<string, unknown> | Record<string, unknown>[],
): void {
  if (Array.isArray(update)) {
    if (update.length === 0) {
      throw new Error(`[seed-payload] ${collection} update pipeline이 비어 있습니다.`);
    }
    for (const stage of update) {
      const entries = Object.entries(stage);
      if (entries.length !== 1 || !ALLOWED_PIPELINE_STAGES.has(entries[0][0])) {
        throw new Error(
          `[seed-payload] ${collection} 허용되지 않은 pipeline stage: ${entries.map(([key]) => key).join(",")}`,
        );
      }
      assertAllowedUpdateFields(collection, entries[0][1], entries[0][0]);
    }
    return;
  }

  const entries = Object.entries(update);
  if (entries.length === 0) {
    throw new Error(`[seed-payload] ${collection} update가 비어 있습니다.`);
  }
  for (const [operator, operand] of entries) {
    if (!ALLOWED_UPDATE_OPERATORS.has(operator)) {
      throw new Error(`[seed-payload] ${collection} 허용되지 않은 update 연산자: ${operator}`);
    }
    assertAllowedUpdateFields(collection, operand, operator);
  }
  assertNoConflictingUpdatePaths(collection, entries);
}
