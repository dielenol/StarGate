import { z } from "zod";

import { ITEM_CATEGORIES, type ItemCategory } from "../types/inventory.js";

import {
  catalogDocBaseFields,
  catalogFrontmatterBaseFields,
  catalogLoreSchema,
  dateSchema,
} from "./common.js";

/* ── 공통 필드 ──
   master_items 컬렉션의 mirror.
   spec MD (단일 진실원) → 어댑터(toDbEquipment) → MasterItem 적재.

   previewImage 정책: 카탈로그 미지정 케이스는 undefined 로 보존
   (NPC 와 다른 정책 — NPC 는 mainImage required, 카탈로그는 optional).

   공통 base 는 common.ts 의 catalog{Doc,Frontmatter}BaseFields 에서 가져온다. */

/** Equipment 카테고리 — ItemCategory SSOT 의 부분집합 */
const equipmentCategorySchema = z.enum(
  ["WEAPON", "ARMOR"] satisfies readonly Extract<
    ItemCategory,
    (typeof ITEM_CATEGORIES)[number]
  >[],
);

/** Equipment lore — common 의 catalogLoreSchema 별칭 (Consumable 과 공유). */
export const equipmentLoreSchema = catalogLoreSchema;

/* ── DB 문서 ── */

export const equipmentDocSchema = z.object({
  ...catalogDocBaseFields(equipmentCategorySchema),
  damage: z.string().max(80).optional(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

/* ── MD frontmatter ──
   긴 서술(설명/배경/획득/비고)은 body 섹션으로 분리되므로 frontmatter 에서는
   description 만 유지 (한 줄 카탈로그 설명, optional → body "## 설명" 폴백).
   가격은 숫자 coerce. */

export const equipmentFrontmatterSchema = z.object({
  ...catalogFrontmatterBaseFields(equipmentCategorySchema),
  damage: z.string().max(80).optional(),
});

export type EquipmentDoc = z.infer<typeof equipmentDocSchema>;
export type EquipmentFrontmatter = z.infer<typeof equipmentFrontmatterSchema>;
export type EquipmentLore = z.infer<typeof equipmentLoreSchema>;
