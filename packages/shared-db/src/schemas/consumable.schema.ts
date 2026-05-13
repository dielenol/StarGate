import { z } from "zod";

import {
  catalogDocBaseFields,
  catalogFrontmatterBaseFields,
  catalogLoreSchema,
  dateSchema,
} from "./common.js";

/* ── 공통 필드 ──
   master_items 컬렉션의 mirror (category = "CONSUMABLE" 고정).
   spec MD (단일 진실원) → 어댑터(toDbConsumable) → MasterItem 적재.

   previewImage 정책: 카탈로그 미지정 케이스는 undefined 로 보존
   (NPC 와 다른 정책 — NPC 는 mainImage required, 카탈로그는 optional).

   공통 base 는 common.ts 의 catalog{Doc,Frontmatter}BaseFields 에서 가져온다. */

const consumableCategorySchema = z.literal("CONSUMABLE");

/** Consumable lore — common 의 catalogLoreSchema 별칭 (Equipment 와 공유). */
export const consumableLoreSchema = catalogLoreSchema;

/* ── DB 문서 ── */

export const consumableDocSchema = z.object({
  ...catalogDocBaseFields(consumableCategorySchema),
  effect: z.string().max(120).optional(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

/* ── MD frontmatter ──
   긴 서술(설명/배경/획득/비고)은 body 섹션으로 분리.
   description 은 frontmatter 또는 body "## 설명" 둘 중 하나에 반드시 있어야 함.
   가격은 숫자 coerce. */

export const consumableFrontmatterSchema = z.object({
  ...catalogFrontmatterBaseFields(consumableCategorySchema),
  effect: z.string().max(120).optional(),
});

export type ConsumableDoc = z.infer<typeof consumableDocSchema>;
export type ConsumableFrontmatter = z.infer<typeof consumableFrontmatterSchema>;
export type ConsumableLore = z.infer<typeof consumableLoreSchema>;
