import "../db/init";

import { getDb } from "@stargate/shared-db";

export type ShopStockAuditAction =
  | "ADMIN_SET"
  | "PURCHASE_REDUCE"
  | "CHECKOUT_REDUCE"
  | "STOCK_RESTORE"
  | "REORDER_FULFILL";

export interface ShopStockAuditLogInput {
  action: ShopStockAuditAction;
  itemSlug: string;
  itemName?: string;
  delta: number;
  stockBefore?: number | null;
  stockAfter?: number | null;
  actorId: string;
  actorName: string;
  actorType: "USER" | "GM" | "SYSTEM";
  source: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

interface ShopStockAuditLogDoc extends ShopStockAuditLogInput {
  kind: "shop-stock-audit";
  createdAt: Date;
}

async function auditCol() {
  const db = await getDb();
  return db.collection<ShopStockAuditLogDoc>("shop_stock_audit_logs");
}

function getAuditErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function recordShopStockAuditLog(
  input: ShopStockAuditLogInput,
): Promise<void> {
  try {
    await (await auditCol()).insertOne({
      ...input,
      kind: "shop-stock-audit",
      createdAt: input.createdAt ?? new Date(),
    });
  } catch (error) {
    console.warn("[shop stock audit] record failed", {
      action: input.action,
      itemSlug: input.itemSlug,
      error: getAuditErrorMessage(error),
    });
  }
}
