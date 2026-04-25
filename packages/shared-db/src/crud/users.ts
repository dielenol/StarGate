/**
 * users 컬렉션 CRUD 리포지토리 (bcrypt 의존 함수 제외)
 *
 * 비밀번호 해싱/검증 함수는 StarGateV2에 유지됩니다 (bcryptjs 의존).
 */

import { MongoServerError, ObjectId } from "mongodb";

import type { User, UserRole, UserStatus, UserPublic } from "../types/index.js";
import { usersCol } from "../collections.js";

function toPublic(user: User): UserPublic {
  return {
    _id: user._id!.toString(),
    username: user.username,
    displayName: user.displayName,
    discordId: user.discordId,
    discordUsername: user.discordUsername,
    discordAvatar: user.discordAvatar,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export async function findUserByUsername(
  username: string
): Promise<User | null> {
  const col = await usersCol();
  return col.findOne({ username });
}

export async function findUserByDiscordId(
  discordId: string
): Promise<User | null> {
  const col = await usersCol();
  return col.findOne({ discordId });
}

/**
 * 여러 discordId를 한 번에 조회한다. 빈 배열은 즉시 short-circuit.
 *
 * `users_discordId_partial_unique` 인덱스(string 타입 한정)를 활용한 $in 쿼리.
 */
export async function findUsersByDiscordIds(
  discordIds: string[]
): Promise<User[]> {
  if (discordIds.length === 0) return [];
  const col = await usersCol();
  return col.find({ discordId: { $in: discordIds } }).toArray();
}

export async function findUserById(id: string): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await usersCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { role, updatedAt: new Date() } }
  );
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus
): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { status, updatedAt: new Date() } }
  );
}

export async function unlinkDiscord(userId: string): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        discordId: null,
        discordUsername: null,
        discordGlobalName: null,
        discordAvatar: null,
        updatedAt: new Date(),
      },
    }
  );
}

export async function deleteUser(
  userId: string
): Promise<{ deletedCount: number }> {
  const col = await usersCol();
  const result = await col.deleteOne({ _id: new ObjectId(userId) });
  return { deletedCount: result.deletedCount };
}

export async function updateLastLogin(userId: string): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { lastLoginAt: new Date(), updatedAt: new Date() } }
  );
}

export async function linkDiscord(
  userId: string,
  discordId: string,
  discordUsername: string,
  discordGlobalName: string | null,
  discordAvatar: string | null
): Promise<void> {
  const col = await usersCol();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        discordId,
        discordUsername,
        discordGlobalName,
        discordAvatar,
        updatedAt: new Date(),
      },
    }
  );
}

export async function countUsers(): Promise<number> {
  const col = await usersCol();
  return col.countDocuments();
}

export async function countUsersByRole(role: UserRole): Promise<number> {
  const col = await usersCol();
  return col.countDocuments({ role });
}

export async function listUsers(): Promise<UserPublic[]> {
  const col = await usersCol();
  const users = await col.find().sort({ createdAt: -1 }).toArray();
  return users.map(toPublic);
}

/* ── Discord 유저 upsert ── */

export interface UpsertDiscordUserInput {
  discordId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  discordAvatar: string | null;
}

/**
 * Discord 인터랙션 기반 유저 upsert.
 * - 기존 유저(discordId 일치): Discord 정보만 갱신
 * - 미등록 유저: GUEST role, hashedPassword=null로 자동 생성
 *
 * 동시성: findOneAndUpdate + upsert는 원자적이지만, discordId unique index와
 * 동시 요청이 겹치면 E11000이 드물게 발생할 수 있음 → 재조회로 복구.
 */
export async function upsertDiscordUser(
  input: UpsertDiscordUserInput
): Promise<User> {
  const col = await usersCol();
  const now = new Date();

  // username 접두사 "_discord_"는 외부 노출/추측을 줄이기 위해 언더스코어로 시작
  const generatedUsername = `_discord_${input.discordId}`;

  try {
    const result = await col.findOneAndUpdate(
      { discordId: input.discordId },
      {
        $set: {
          discordUsername: input.discordUsername,
          discordGlobalName: input.discordGlobalName,
          discordAvatar: input.discordAvatar,
          updatedAt: now,
        },
        $setOnInsert: {
          username: generatedUsername,
          hashedPassword: null,
          displayName: input.discordGlobalName ?? input.discordUsername,
          discordId: input.discordId,
          role: "U",
          status: "ACTIVE",
          characterIds: [],
          lastLoginAt: null,
          passwordChangedAt: null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    if (result) return result;
  } catch (err) {
    // E11000: 동시 upsert 경합 또는 username/discordId 충돌 → 재조회
    if (!(err instanceof MongoServerError) || err.code !== 11_000) {
      throw err;
    }
  }

  // Fallback: 이미 다른 트랜잭션이 생성했을 가능성 → discordId로 재조회
  const existing = await col.findOne({ discordId: input.discordId });
  if (existing) return existing;

  throw new Error(
    `Failed to upsert Discord user (discordId=${input.discordId})`
  );
}
