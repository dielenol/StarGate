/* eslint-disable @typescript-eslint/no-unused-vars */
import type { UserRole } from "./user";
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      displayName: string;
      role: UserRole;
      discordId: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    discordId: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
    discordId: string | null;
  }
}
