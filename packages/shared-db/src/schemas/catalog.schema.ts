import { z } from "zod";

import { ITEM_CATEGORIES } from "../types/inventory.js";

import {
  catalogDocBaseFields,
  catalogFrontmatterBaseFields,
  catalogLoreSchema,
  dateSchema,
} from "./common.js";

/* ── Generic catalog item ──
   master_items 컬렉션 전체 mirror.
   Equipment/Consumable 의 엄격한 하위 도메인은 유지하되, MATERIAL/SPECIAL 처럼
   장비나 소모품으로 환원되지 않는 항목은 이 스키마를 통해 검증한다. */

export const catalogItemCategorySchema = z.enum(ITEM_CATEGORIES);

export const catalogItemLoreSchema = catalogLoreSchema;

export const catalogItemDocSchema = z.object({
  ...catalogDocBaseFields(catalogItemCategorySchema),
  damage: z.string().max(80).optional(),
  effect: z.string().max(120).optional(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  authorId: z.string().optional(),
  authorName: z.string().optional(),
});

export const catalogItemFrontmatterSchema = z.object({
  ...catalogFrontmatterBaseFields(catalogItemCategorySchema),
  damage: z.string().max(80).optional(),
  effect: z.string().max(120).optional(),
});

export type CatalogItemDoc = z.infer<typeof catalogItemDocSchema>;
export type CatalogItemFrontmatter = z.infer<
  typeof catalogItemFrontmatterSchema
>;
export type CatalogItemLore = z.infer<typeof catalogItemLoreSchema>;
