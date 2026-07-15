import { redirect } from "next/navigation";
import { masterItemsCol } from "@stargate/shared-db";

import PageHead from "@/components/ui/PageHead/PageHead";
import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listEquipmentWorkshopBlueprints,
  serializeEquipmentWorkshopBlueprint,
} from "@/lib/db/equipment-workshop-blueprints";
import {
  listEquipmentWorkshopRequests,
  serializeAdminEquipmentWorkshopRequest,
} from "@/lib/db/equipment-workshop-requests";
import { findShopItemBySlug } from "@/lib/shop/catalog";

import EquipmentWorkshopAdminClient from "./EquipmentWorkshopAdminClient";

export default async function EquipmentWorkshopAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  const [requests, blueprints, itemDocuments] = await Promise.all([
    listEquipmentWorkshopRequests({ limit: 100 }),
    listEquipmentWorkshopBlueprints(),
    (await masterItemsCol())
      .find({}, { projection: { name: 1, category: 1, slug: 1, price: 1, isPublic: 1 } })
      .sort({ name: 1 })
      .toArray(),
  ]);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "관리 (ADMIN)", href: "/erp/admin" },
          { label: "공방 운영 (EQUIPMENT WORKSHOP)" },
        ]}
        title="공방 제작·강화 운영"
      />
      <EquipmentWorkshopAdminClient
        initialRequests={{ requests: requests.map(serializeAdminEquipmentWorkshopRequest) }}
        initialBlueprints={{
          blueprints: blueprints.map(serializeEquipmentWorkshopBlueprint),
        }}
        items={itemDocuments.map((item) => ({
          id: String(item._id),
          slug: item.slug ?? "",
          name: item.name,
          category: item.category,
          isPublic: item.isPublic !== false,
          unitPrice: item.slug
            ? (Number(findShopItemBySlug(item.slug)?.price ?? item.price) || 0)
            : (Number(item.price) || 0),
        }))}
        blobUploadEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
      />
    </>
  );
}
