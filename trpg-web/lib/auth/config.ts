/**
 * Auth.js v5 설정 — Discord OAuth 단일 프로바이더.
 *
 * - TRPG_GUILD_ID 길드 멤버만 로그인 허용 (탈퇴자 차단)
 * - JWT 전략 (서버리스 최적화)
 * - discordUserId 를 세션·JWT 에 박아 둠 (API/UI 가 직접 사용)
 */

import "@/lib/db/init";

import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

import { findTrpgGuildMember } from "@stargate/shared-db";

import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  TRPG_GUILD_ID,
} from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Discord({
      clientId: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: "identify" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== "discord") return false;
      const discordId = account.providerAccountId;

      const member = await findTrpgGuildMember(TRPG_GUILD_ID, discordId);

      // 미가입자 또는 이탈자(leftAt 존재) 차단.
      if (!member || member.leftAt) return false;
      return true;
    },

    async jwt({ token, account }) {
      if (account?.provider === "discord") {
        token.discordUserId = account.providerAccountId;
      }
      return token;
    },

    async session({ session, token }) {
      if (typeof token.discordUserId === "string") {
        session.user = {
          ...session.user,
          discordUserId: token.discordUserId,
        };
      }
      return session;
    },
  },
});
