import { ObjectId } from "mongodb";

import type { MasterItem } from "@stargate/shared-db";

import type { EquipmentWorkshopRequestDoc } from "@/lib/db/equipment-workshop-requests";

export function buildWorkshopResultMasterItem(
  request: EquipmentWorkshopRequestDoc & {
    quote: NonNullable<EquipmentWorkshopRequestDoc["quote"]>;
  },
  now: Date,
): MasterItem {
  return {
    _id: new ObjectId(request.quote.result.itemId),
    slug: request.quote.result.slug,
    name: request.quote.result.name,
    category: request.quote.result.category,
    description: request.quote.result.description,
    price: 0,
    ...(request.quote.result.damage
      ? { damage: request.quote.result.damage }
      : {}),
    ...(request.quote.result.effect
      ? { effect: request.quote.result.effect }
      : {}),
    tags: request.quote.result.tags,
    ...(request.quote.result.previewImage
      ? { previewImage: request.quote.result.previewImage }
      : {}),
    ...(request.quote.result.equipmentAction
      ? { equipmentAction: request.quote.result.equipmentAction }
      : {}),
    ...(request.quote.result.equipmentAbilityOverrides
      ? {
          equipmentAbilityOverrides:
            request.quote.result.equipmentAbilityOverrides,
        }
      : {}),
    isAvailable: false,
    isPublic: false,
    source: "manual",
    workshop: {
      requestId: request._id,
      ownerId: request.userId,
      ...(request.sourceItemId ? { sourceItemId: request.sourceItemId } : {}),
      ...(request.sourceItemId
        ? { sourceItemName: request.equipmentName ?? "장비" }
        : {}),
      characterId: request.characterId,
      characterCodename: request.characterCodename,
      specialistCodename: request.quote.specialistCodename,
      ...(request.quote.specialistWorkflow
        ? { specialistWorkflow: request.quote.specialistWorkflow }
        : {}),
      ...(request.quote.blueprintRef
        ? { blueprintRef: request.quote.blueprintRef }
        : {}),
      generation: request.quote.result.generation,
      lifecycle: "operational",
      balanceStatus: "approved",
    },
    createdAt: now,
    updatedAt: now,
  };
}
