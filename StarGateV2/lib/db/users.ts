/**
 * users 컬렉션 CRUD 리포지토리
 */

import { ObjectId } from "mongodb";
import { hash, compare } from "bcryptjs";

import type { User, CreateUserInput, UserRole, UserPublic } from "@/types/user";

import { usersCollection } from "./collections";

const BCRYPT_ROUNDS = 12;
const RANDOM_PW_LENGTH = 12;

function generateRandomPassword(): string {
  const bytes = new Uint8Array(RANDOM_PW_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, RANDOM_PW_LENGTH);
}

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

export async function findUserByUsername(username: string): Promise<User | null> {
  const col = await usersCollection();
  return col.findOne({ username });
}

export async function findUserByDiscordId(discordId: string): Promise<User | null> {
  const col = await usersCollection();
  return col.findOne({ discordId });
}

export async function findUserById(id: string): Promise<User | null> {
  const col = await usersCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

/**
 * 사용자 생성 (관리자 전용)
 * @returns {{ userId: string; plainPassword: string }} 생성된 사용자 ID와 초기 비밀번호 (평문)
 */
export async function createUser(
  input: CreateUserInput,
): Promise<{ userId: string; plainPassword: string }> {
  const col = await usersCollection();

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
  return compare(password, user.hashedPassword);
}

export async function updatePassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const col = await usersCollection();
  const hashedPassword = await hash(newPassword, BCRYPT_ROUNDS);

  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { hashedPassword, passwordChangedAt: new Date(), updatedAt: new Date() } },
  );
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  const col = await usersCollection();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { role, updatedAt: new Date() } },
  );
}

export async function updateLastLogin(userId: string): Promise<void> {
  const col = await usersCollection();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { lastLoginAt: new Date(), updatedAt: new Date() } },
  );
}

export async function linkDiscord(
  userId: string,
  discordId: string,
  discordUsername: string,
  discordAvatar: string | null,
): Promise<void> {
  const col = await usersCollection();
  await col.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        discordId,
        discordUsername,
        discordAvatar,
        updatedAt: new Date(),
      },
    },
  );
}

export async function countUsers(): Promise<number> {
  const col = await usersCollection();
  return col.countDocuments();
}

export async function listUsers(): Promise<UserPublic[]> {
  const col = await usersCollection();
  const users = await col.find().sort({ createdAt: -1 }).toArray();
  return users.map(toPublic);
}

export async function ensureIndexes(): Promise<void> {
  const col = await usersCollection();
  await col.createIndexes([
    { key: { username: 1 }, name: "users_username_unique", unique: true },
    { key: { discordId: 1 }, name: "users_discordId_unique", unique: true, sparse: true },
  ]);
}
