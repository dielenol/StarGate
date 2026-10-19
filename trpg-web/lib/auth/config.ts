/**
 * Auth.js v5 설정 — Discord OAuth 단일 프로바이더.
 *
 * - TRPG_GUILD_ID 길드 멤버만 로그인 허용 (지정 계정 1개 예외, 그 외 탈퇴자 차단)
 * - 마지막 확인 뒤 1시간이 지나면 jwt 콜백에서 멤버 여부를 다시 확인해 탈퇴자 세션을 거부한다
 * - JWT 전략 (서버리스 최적화)
 * - discordUserId 를 세션·JWT 에 박아 둠 (API/UI 가 직접 사용)
 */

import "@/lib/db/init";

import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

import { findTrpgGuildMember } from "@stargate/shared-db";

import { DEV_AUTH_COOKIES, USE_DEV_COOKIE_NAMES } from "@/lib/auth/cookies";
import {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  TRPG_GUILD_ID,
} from "@/lib/env";

// 일시 탈퇴 중인 본인 계정 1개만 Discord ID로 길드 가입 검증을 면제한다.
const GUILD_MEMBERSHIP_EXEMPT_DISCORD_ID = "376610453696020482";

// 로그인 뒤 탈퇴가 세션에 반영되는 간격. 서버 컴포넌트/라우트의 auth()는 갱신된 토큰을 쿠키에 쓰지 않으므로,
// 간격이 지난 뒤에는 `/api/auth/session` 응답이 새 클레임을 심기 전까지 요청마다 다시 조회한다.
export const MEMBERSHIP_RECHECK_INTERVAL_MS = 60 * 60 * 1000;

async function isActiveGuildMember(discordId: string): Promise<boolean> {
  if (discordId === GUILD_MEMBERSHIP_EXEMPT_DISCORD_ID) return true;

  const member = await findTrpgGuildMember(TRPG_GUILD_ID, discordId);

  // 미가입자 또는 이탈자(leftAt 존재) 차단.
  return Boolean(member && !member.leftAt);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // 개발 환경에서 같은 호스트의 StarGateV2와 쿠키가 겹치지 않도록 앱 전용 이름 사용 (lib/auth/cookies.ts)
  cookies: USE_DEV_COOKIE_NAMES ? DEV_AUTH_COOKIES : undefined,
  providers: [
    Discord({
      clientId: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      // Discord의 iss 응답을 Auth.js 기본값(authjs.dev) 대신 실제 발급자로 검증한다.
      issuer: "https://discord.com",
      authorization: { params: { scope: "identify" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider !== "discord") return false;
      return isActiveGuildMember(account.providerAccountId);
    },

    async jwt({ token, account }) {
      if (account?.provider === "discord") {
        token.discordUserId = account.providerAccountId;
        // signIn 콜백이 방금 확인했다.
        token.membershipCheckedAt = Date.now();
        return token;
      }

      // 멤버 확인이 불가능한 토큰은 세션으로 인정하지 않는다.
      if (typeof token.discordUserId !== "string") return null;

      if (
        typeof token.membershipCheckedAt === "number" &&
        Date.now() - token.membershipCheckedAt < MEMBERSHIP_RECHECK_INTERVAL_MS
      ) {
        return token;
      }

      let active: boolean;
      try {
        active = await isActiveGuildMember(token.discordUserId);
      } catch (error) {
        // throw 를 내보내면 Auth.js 가 세션 쿠키를 지워 DB 순단에 활동 멤버가 로그아웃된다 — 유지하고 다음 요청에서 재시도.
        console.error("[trpg-web] 길드 멤버 재검사 실패", error);
        return token;
      }
      if (!active) return null;

      token.membershipCheckedAt = Date.now();
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
