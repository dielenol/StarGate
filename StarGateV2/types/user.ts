import type { ObjectId } from "mongodb";

export const USER_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "GM",
  "PLAYER",
  "GUEST",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  _id?: ObjectId;
  username: string;
  hashedPassword: string;
  displayName: string;
  discordId: string | null;
  discordUsername: string | null;
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
