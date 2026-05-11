/* eslint-disable @typescript-eslint/no-unused-vars */
import type { DefaultSession } from "next-auth";
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      // signIn 콜백 통과 후 jwt -> session 콜백에서 채워지지만,
      // 타입 시스템상 항상 존재한다고 단언할 수 없으므로 optional.
      // 사용처는 명시적 guard 후 사용해야 한다.
      discordUserId?: string;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    discordUserId?: string;
  }
}
