/**
 * users 컬렉션 CRUD
 *
 * 비밀번호 해싱/검증 함수만 여기서 유지 (bcryptjs 의존).
 * 그 외 조회/수정 함수는 shared-db에서 re-export.
 */

import "./init";

import { ObjectId } from "mongodb";
import { hash, compare } from "bcryptjs";

import type { User, CreateUserInput } from "@stargate/shared-db";
import { usersCol } from "@stargate/shared-db";

/* ── shared-db에서 re-export ── */

export {
  findUserByUsername,
  findUserByDiscordId,
  findUserById,
  updateUserRole,
  updateUserStatus,
  updateLastLogin,
  linkDiscord,
  unlinkDiscord,
  deleteUser,
  countUsers,
  countUsersByRole,
  listUsers,
  upsertDiscordUser,
} from "@stargate/shared-db";

/* ── bcrypt 의존 함수 (StarGateV2 전용) ── */

const BCRYPT_ROUNDS = 12;
const RANDOM_PW_BYTES = 9; // Uint8Array 길이 (엔트로피 소스)
const RANDOM_PW_CHAR_LENGTH = 12; // base36 인코딩 후 절단 길이

function generateRandomPassword(): string {
  const bytes = new Uint8Array(RANDOM_PW_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, RANDOM_PW_CHAR_LENGTH);
}

/**
 * 사용자 생성 (관리자 전용)
 * @returns {{ userId: string; plainPassword: string }} 생성된 사용자 ID와 초기 비밀번호 (평문)
 */
export async function createUser(
  input: CreateUserInput,
): Promise<{ userId: string; plainPassword: string }> {
  const col = await usersCol();

  const existing = await col.findOne({ username: input.username });
  if (existing) {
    throw new Error(`이미 존재하는 username: ${input.username}`);
  }

  const plainPassword = generateRandomPassword();
  const hashedPassword = await hash(plainPassword, BCRYPT_ROUNDS);
  const now = new Date();

  const doc: User = {
    username: input.username,
    hashedPassword,
    displayName: input.displayName,
    discordId: null,
    discordUsername: null,
    discordGlobalName: null,
    discordAvatar: null,
    role: input.role,
    status: "ACTIVE",
    characterIds: [],
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const result = await col.insertOne(doc);
  return { userId: result.insertedId.toString(), plainPassword };
}

export async function verifyPassword(
  user: User,
  password: string,
): Promise<boolean> {
  // Discord-only 유저는 hashedPassword가 null → 웹 로그인 불가
  if (!user.hashedPassword) return false;
  return compare(password, user.hashedPassword);
}

export async function updatePassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const col = await usersCol();
  const hashedPassword = await hash(newPassword, BCRYPT_ROUNDS);

  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { hashedPassword, passwordChangedAt: new Date(), updatedAt: new Date() } },
  );
}

/**
 * 관리자용 비밀번호 초기화. 신규 평문 비밀번호를 생성해 저장하고 반환한다.
 * @returns {{ plainPassword: string }} 새로 생성된 평문 비밀번호
 */
export async function resetUserPassword(
  userId: string,
): Promise<{ plainPassword: string }> {
  const plainPassword = generateRandomPassword();
  await updatePassword(userId, plainPassword);
  return { plainPassword };
}

