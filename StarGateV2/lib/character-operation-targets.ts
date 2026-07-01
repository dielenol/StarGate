import type {
  AgentCharacter,
  Character,
  CharacterType,
  UserPublic,
} from "@stargate/shared-db";

import {
  listAgentCharacters,
  listCharactersByOwnerIds,
} from "@/lib/db/characters";
import { findUserById, listUsers } from "@/lib/db/users";

export type OperationTargetCharacter = Pick<
  Character,
  | "_id"
  | "codename"
  | "lore"
  | "agentLevel"
  | "ownerId"
  | "type"
  | "tier"
  | "isPublic"
> &
  Partial<Pick<AgentCharacter, "play">>;

export interface OperationMainSelection {
  character: OperationTargetCharacter | null;
  integrity: boolean;
  isNpcFallback: boolean;
}

export interface UserOperationMainSelection extends OperationMainSelection {
  user: UserPublic;
}

function isMainAgent(character: OperationTargetCharacter): boolean {
  return (
    character.type === "AGENT" &&
    (character.tier === undefined || character.tier === "MAIN")
  );
}

function isOwnedNpc(character: OperationTargetCharacter): boolean {
  return character.type === "NPC" && Boolean(character.ownerId);
}

export function selectOperationMainCharacterForUser(
  user: Pick<UserPublic, "_id" | "role" | "status">,
  ownedCharacters: OperationTargetCharacter[],
): OperationMainSelection {
  const mainAgents = ownedCharacters.filter(isMainAgent);
  if (mainAgents.length === 1) {
    return { character: mainAgents[0], integrity: false, isNpcFallback: false };
  }
  if (mainAgents.length > 1) {
    return { character: null, integrity: true, isNpcFallback: false };
  }

  if (user.role !== "GM" || user.status !== "ACTIVE") {
    return { character: null, integrity: false, isNpcFallback: false };
  }

  const fallbackNpcs = ownedCharacters.filter(isOwnedNpc);
  if (fallbackNpcs.length === 1) {
    return { character: fallbackNpcs[0], integrity: false, isNpcFallback: true };
  }
  if (fallbackNpcs.length > 1) {
    return { character: null, integrity: true, isNpcFallback: false };
  }

  return { character: null, integrity: false, isNpcFallback: false };
}

export async function listUsersWithOperationMainCharacters(): Promise<
  UserOperationMainSelection[]
> {
  const users = await listUsers();
  const characters = await listCharactersByOwnerIds(users.map((u) => u._id));
  const charactersByOwner = new Map<string, OperationTargetCharacter[]>();

  for (const character of characters) {
    if (!character.ownerId) continue;
    const list = charactersByOwner.get(character.ownerId);
    if (list) list.push(character);
    else charactersByOwner.set(character.ownerId, [character]);
  }

  return users.map((user) => ({
    user,
    ...selectOperationMainCharacterForUser(
      user,
      charactersByOwner.get(user._id) ?? [],
    ),
  }));
}

export async function listGmNpcFallbackCharacters(): Promise<
  OperationTargetCharacter[]
> {
  const selections = await listUsersWithOperationMainCharacters();
  return selections
    .filter((entry) => entry.isNpcFallback && entry.character !== null)
    .map((entry) => entry.character!);
}

export async function listCreditOperationCharacters(): Promise<
  OperationTargetCharacter[]
> {
  const [mainAgents, npcFallbacks] = await Promise.all([
    listAgentCharacters("MAIN"),
    listGmNpcFallbackCharacters(),
  ]);

  return [...mainAgents, ...npcFallbacks].filter(
    (character) => character.isPublic !== false,
  );
}

export async function listInventoryOperationCharacters(): Promise<
  OperationTargetCharacter[]
> {
  const [agents, npcFallbacks] = await Promise.all([
    listAgentCharacters(null),
    listGmNpcFallbackCharacters(),
  ]);

  return [...agents, ...npcFallbacks].sort((a, b) =>
    a.codename.localeCompare(b.codename),
  );
}

export async function isCreditOperationCharacter(
  character: Pick<Character, "_id" | "ownerId" | "type">,
): Promise<boolean> {
  if (character.type === "AGENT") return true;
  if (!character.ownerId) return false;

  const owner = await findUserById(character.ownerId);
  if (!owner || owner.role !== "GM" || owner.status !== "ACTIVE") {
    return false;
  }

  const ownedCharacters = await listCharactersByOwnerIds([character.ownerId]);
  const selection = selectOperationMainCharacterForUser(
    {
      _id: owner._id!.toString(),
      role: owner.role,
      status: owner.status,
    },
    ownedCharacters,
  );

  return (
    selection.isNpcFallback &&
    String(selection.character?._id) === String(character._id)
  );
}

export function getOperationCharacterPointBalance(
  character: OperationTargetCharacter,
): number {
  if (character.type !== "AGENT" || !("play" in character)) return 0;
  return character.play?.points ?? 0;
}

export function getOperationCharacterType(
  character: OperationTargetCharacter,
): CharacterType {
  return character.type;
}
