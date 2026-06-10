import "./init";

import { getDb } from "@stargate/shared-db";

const COLLECTION = "faction_favorability";

export interface FactionFavorabilityDoc {
  code: string;
  value: number;
  updatedAt: Date;
  updatedById: string;
  updatedByName: string;
}

async function factionFavorabilityCol() {
  const db = await getDb();
  return db.collection<FactionFavorabilityDoc>(COLLECTION);
}

export async function listFactionFavorabilityOverrides(): Promise<
  Record<string, number>
> {
  const col = await factionFavorabilityCol();
  const docs = await col
    .find({}, { projection: { _id: 0, code: 1, value: 1 } })
    .toArray();

  return Object.fromEntries(docs.map((doc) => [doc.code, doc.value]));
}

export async function setFactionFavorability(input: {
  code: string;
  value: number;
  updatedById: string;
  updatedByName: string;
}) {
  const col = await factionFavorabilityCol();
  const updatedAt = new Date();

  await col.updateOne(
    { code: input.code },
    {
      $set: {
        code: input.code,
        value: input.value,
        updatedAt,
        updatedById: input.updatedById,
        updatedByName: input.updatedByName,
      },
    },
    { upsert: true },
  );

  return {
    code: input.code,
    value: input.value,
    updatedAt,
  };
}
