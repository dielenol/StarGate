import "server-only";

import type { User } from "@stargate/shared-db";
import type { ClientSession } from "mongodb";

import {
  countActiveUsersByRole,
  findUserById,
  lockGmMembershipInvariant,
} from "@/lib/db/users";

export class UserAdminInvariantError extends Error {
  constructor(
    readonly code: "ACTOR_CHANGED" | "TARGET_NOT_FOUND" | "LAST_ACTIVE_GM",
  ) {
    super(code);
    this.name = "UserAdminInvariantError";
  }
}

export async function lockAndAssertActiveGmActor(input: {
  actorId: string;
  session: ClientSession;
}): Promise<User> {
  await lockGmMembershipInvariant(input.session);
  const actor = await findUserById(input.actorId, { session: input.session });
  if (actor?.role !== "GM" || actor.status !== "ACTIVE") {
    throw new UserAdminInvariantError("ACTOR_CHANGED");
  }
  return actor;
}

export async function lockAndReadUserAdminMutation(input: {
  actorId: string;
  targetId: string;
  session: ClientSession;
}): Promise<User> {
  await lockAndAssertActiveGmActor({
    actorId: input.actorId,
    session: input.session,
  });
  const target = await findUserById(input.targetId, { session: input.session });
  if (!target) {
    throw new UserAdminInvariantError("TARGET_NOT_FOUND");
  }
  return target;
}

export async function assertCanRemoveActiveGm(
  target: Pick<User, "role" | "status">,
  session: ClientSession,
): Promise<void> {
  if (target.role !== "GM" || target.status !== "ACTIVE") return;
  if (await countActiveUsersByRole("GM", { session }) <= 1) {
    throw new UserAdminInvariantError("LAST_ACTIVE_GM");
  }
}
