import "server-only";

import { listCreditTransactions } from "@/lib/db/credits";
import {
  findMasterItemsBySlugsOrIds,
  listCharacterInventory,
} from "@/lib/db/inventory";
import type { EquipmentShopActivityEntry } from "@/lib/equipment-shop/activity";
import { isTowaskiLicenseSlug } from "@/lib/equipment-shop/licenses";

export async function listRecentEquipmentShopActivity(
  characterId: string,
  limit = 5,
): Promise<EquipmentShopActivityEntry[]> {
  const [transactions, inventory] = await Promise.all([
    listCreditTransactions(characterId, 30),
    listCharacterInventory(characterId),
  ]);
  const masters = await findMasterItemsBySlugsOrIds(
    inventory.map((entry) => entry.itemId),
  );
  const masterById = new Map(
    masters.flatMap((item) =>
      item._id ? [[String(item._id), item] as const] : [],
    ),
  );

  const purchases: EquipmentShopActivityEntry[] = transactions
    .filter(
      (transaction) =>
        transaction.metadata?.source === "equipment_shop_checkout",
    )
    .map((transaction) => ({
      id: `purchase:${String(transaction._id ?? transaction.requestId ?? transaction.createdAt)}`,
      kind: "purchase",
      title: transaction.description.replace(/^병기부 구매\s*[—-]\s*/, ""),
      detail: `결제 후 잔액 ${transaction.balance.toLocaleString()} CR`,
      amount: transaction.amount,
      createdAt: transaction.createdAt.toISOString(),
    }));
  const licenses: EquipmentShopActivityEntry[] = inventory.flatMap((entry) => {
    const master = masterById.get(entry.itemId);
    if (!master || !isTowaskiLicenseSlug(master.slug)) return [];
    return [
      {
        id: `license:${String(entry._id ?? `${entry.itemId}:${entry.acquiredAt.toISOString()}`)}`,
        kind: "license" as const,
        title: master.name,
        detail: "토와스키 반출 자격 등록",
        amount: null,
        createdAt: entry.acquiredAt.toISOString(),
      },
    ];
  });

  return [...purchases, ...licenses]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}
