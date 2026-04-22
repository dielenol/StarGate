import type { ObjectId } from "mongodb";

import type { RoleLevel } from "./character.js";
import { ROLE_LEVELS } from "./character.js";

/** 사용자 역할 = 8단 RoleLevel (AgentLevel과 동일 union, Phase 2-A 일체화) */
export type UserRole = RoleLevel;
export const USER_ROLES = ROLE_LEVELS;

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  _id?: ObjectId;
  username: string;
  /** null = Discord-only 유저 (웹 로그인 불가, bot upsert로 자동 생성됨) */
  hashedPassword: string | null;
  displayName: string;
  discordId: string | null;
  discordUsername: string | null;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  role: UserRole;
  status: UserStatus;
  characterIds: string[];
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  role: UserRole;
}

export interface UserPublic {
  _id: string;
  username: string;
  displayName: string;
  discordId: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
}
