import { redirect } from "next/navigation";
import { masterItemsCol } from "@stargate/shared-db";

import PageHead from "@/components/ui/PageHead/PageHead";
import { auth } from "@/lib/auth/config";
import { hasRole } from "@/lib/auth/rbac";
import {
  listEquipmentWorkshopRequests,
  serializeAdminEquipmentWorkshopRequest,
} from "@/lib/db/equipment-workshop-requests";

import EquipmentWorkshopAdminClient from "./EquipmentWorkshopAdminClient";

export default async function EquipmentWorkshopAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, "GM")) redirect("/erp");

  const [requests, itemDocuments] = await Promise.all([
    listEquipmentWorkshopRequests({ limit: 100 }),
    (await masterItemsCol())
      .find({}, { projection: { name: 1, category: 1 } })
      .sort({ name: 1 })
      .toArray(),
  ]);

  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "ADMIN", href: "/erp/admin" },
          { label: "EQUIPMENT WORKSHOP" },
        ]}
        title="공방 강화 운영"
      />
      <EquipmentWorkshopAdminClient
        initialRequests={{ requests: requests.map(serializeAdminEquipmentWorkshopRequest) }}
        items={itemDocuments.map((item) => ({
          id: String(item._id),
          name: item.name,
          category: item.category,
        }))}
        blobUploadEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
      />
    </>
  );
}
