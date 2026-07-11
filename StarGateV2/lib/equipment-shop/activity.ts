export interface EquipmentShopActivityEntry {
  id: string;
  kind: "purchase" | "license";
  title: string;
  detail: string;
  amount: number | null;
  createdAt: string;
}
