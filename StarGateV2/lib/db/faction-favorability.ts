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

/**
 * 단일 세력 보정값 조회 — 전체 override fetch 없이 findOne.
 * 미설정(문서 없음) 시 null — 호출자가 기본값 폴백.
 */
export async function getFactionFavorabilityOverride(
  code: string,
): Promise<number | null> {
  const col = await factionFavorabilityCol();
  const doc = await col.findOne(
    { code },
    { projection: { _id: 0, value: 1 } },
  );
  return doc ? doc.value : null;
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
