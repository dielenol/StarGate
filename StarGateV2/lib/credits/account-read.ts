import "server-only";

import { MainCharacterIntegrityError } from "@stargate/shared-db";
import type { Session } from "next-auth";

import { getOwnedDataViewerId } from "@/lib/auth/guest";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";

export type OwnedCreditCharacterResult =
  | { status: "ok"; characterId: string; codename: string }
  | { status: "missing" }
  | { status: "integrity-error" }
  | { status: "lookup-error" };

/**
 * 잔액·주식 원장 read API가 세션 소유자의 메인 캐릭터만 조회하도록 고정한다.
 * query/body로 characterId를 받지 않으므로 GM을 포함한 어떤 사용자도 이 경로로
 * 타인의 경제 데이터를 조회할 수 없다.
 */
export async function resolveOwnedCreditCharacter(
  user: Session["user"],
  logContext: string,
): Promise<OwnedCreditCharacterResult> {
  const ownerId = getOwnedDataViewerId(user);
  if (ownerId === null) return { status: "missing" };

  try {
    const character = await findMainCharacterByOwner(ownerId);
    if (!character) return { status: "missing" };
    return {
      status: "ok",
      characterId: String(character._id),
      codename: character.codename,
    };
  } catch (error) {
    console.error(
      `[${logContext}] findMainCharacterByOwner failed (userId=${ownerId}): `,
      error,
    );
    return error instanceof MainCharacterIntegrityError
      ? { status: "integrity-error" }
      : { status: "lookup-error" };
  }
}
