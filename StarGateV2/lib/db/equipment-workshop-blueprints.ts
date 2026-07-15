import "server-only";
import "./init";

import { getDb } from "@stargate/shared-db";
import { ObjectId } from "mongodb";

import type {
  EquipmentWorkshopBlueprintInput,
  EquipmentWorkshopBlueprintStatus,
  SerializedEquipmentWorkshopBlueprint,
} from "@/lib/equipment-shop/workshop-blueprint";

export interface EquipmentWorkshopBlueprintDoc
  extends EquipmentWorkshopBlueprintInput {
  _id: ObjectId;
  version: number;
  status: EquipmentWorkshopBlueprintStatus;
  sourceClass: "design-proposal";
  balanceStatus: "balance-candidate";
  createdById: string;
  createdByName: string;
  updatedById: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function equipmentWorkshopBlueprintsCol() {
  const db = await getDb();
  return db.collection<EquipmentWorkshopBlueprintDoc>(
    "equipment_workshop_blueprints",
  );
}

export function serializeEquipmentWorkshopBlueprint(
  blueprint: EquipmentWorkshopBlueprintDoc,
): SerializedEquipmentWorkshopBlueprint {
  return {
    ...blueprint,
    _id: String(blueprint._id),
    createdAt: blueprint.createdAt.toISOString(),
    updatedAt: blueprint.updatedAt.toISOString(),
  };
}

export async function listEquipmentWorkshopBlueprints(options: {
  includeArchived?: boolean;
} = {}): Promise<EquipmentWorkshopBlueprintDoc[]> {
  const filter = options.includeArchived ? {} : { status: "DRAFT" as const };
  return (await equipmentWorkshopBlueprintsCol())
    .find(filter)
    .sort({ status: 1, updatedAt: -1, displayName: 1 })
    .toArray();
}

export async function findEquipmentWorkshopBlueprintById(
  id: string,
): Promise<EquipmentWorkshopBlueprintDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  return (await equipmentWorkshopBlueprintsCol()).findOne({
    _id: new ObjectId(id),
  });
}

export async function createEquipmentWorkshopBlueprint(input: {
  blueprint: EquipmentWorkshopBlueprintInput;
  actorId: string;
  actorName: string;
}): Promise<EquipmentWorkshopBlueprintDoc> {
  const now = new Date();
  const doc: EquipmentWorkshopBlueprintDoc = {
    _id: new ObjectId(),
    ...input.blueprint,
    version: 1,
    status: "DRAFT",
    sourceClass: "design-proposal",
    balanceStatus: "balance-candidate",
    createdById: input.actorId,
    createdByName: input.actorName,
    updatedById: input.actorId,
    updatedByName: input.actorName,
    createdAt: now,
    updatedAt: now,
  };
  await (await equipmentWorkshopBlueprintsCol()).insertOne(doc);
  return doc;
}

export async function updateEquipmentWorkshopBlueprint(input: {
  id: string;
  expectedVersion: number;
  blueprint: EquipmentWorkshopBlueprintInput;
  actorId: string;
  actorName: string;
}): Promise<EquipmentWorkshopBlueprintDoc | null> {
  if (!ObjectId.isValid(input.id)) return null;
  const { slug, ...mutableBlueprint } = input.blueprint;
  return (await equipmentWorkshopBlueprintsCol()).findOneAndUpdate(
    {
      _id: new ObjectId(input.id),
      slug,
      version: input.expectedVersion,
      status: "DRAFT",
    },
    {
      $set: {
        ...mutableBlueprint,
        updatedById: input.actorId,
        updatedByName: input.actorName,
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
}

export async function archiveEquipmentWorkshopBlueprint(input: {
  id: string;
  expectedVersion: number;
  actorId: string;
  actorName: string;
}): Promise<EquipmentWorkshopBlueprintDoc | null> {
  if (!ObjectId.isValid(input.id)) return null;
  return (await equipmentWorkshopBlueprintsCol()).findOneAndUpdate(
    {
      _id: new ObjectId(input.id),
      version: input.expectedVersion,
      status: "DRAFT",
    },
    {
      $set: {
        status: "ARCHIVED",
        updatedById: input.actorId,
        updatedByName: input.actorName,
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
}
