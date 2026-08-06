import {
  charactersCol,
  type AgentCharacter,
  type Character,
} from "@stargate/shared-db";
import { ObjectId, type ClientSession, type Filter } from "mongodb";

/**
 * Resolve a VTT character key against the transaction snapshot used by the
 * inventory mutation. This prevents a preflight AGENT lookup from authorizing
 * a delete/type-change race before the actual decrement.
 */
export async function findTransactionalAgentCharacterByKey(
  key: string,
  session: ClientSession,
): Promise<AgentCharacter | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;

  const filter: Filter<Character> =
    ObjectId.isValid(trimmed) && trimmed.length === 24
      ? { _id: new ObjectId(trimmed), type: "AGENT" }
      : { codename: trimmed, type: "AGENT" };
  const character = await (await charactersCol()).findOne(filter, { session });
  return character?.type === "AGENT" ? character : null;
}
