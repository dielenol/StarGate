/**
 * Auth.js v5 설정
 *
 * Discord OAuth + Credentials (ID/PW) 이중 인증.
 * JWT 전략으로 서버리스 환경 최적화.
 */

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";

import {
  findUserByUsername,
  findUserByDiscordId,
  upsertDiscordUser,
  verifyPassword,
  updateLastLogin,
  linkDiscord,
} from "@/lib/db/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!username || !password) return null;

        const user = await findUserByUsername(username);
        if (!user || user.status !== "ACTIVE") return null;

        const valid = await verifyPassword(user, password);
        if (!valid) return null;

        await updateLastLogin(user._id!.toString());

        return {
          id: user._id!.toString(),
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          discordId: user.discordId,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "discord" && profile) {
        const discordId = profile.id as string;
        const discordUsername = profile.username as string;
        const discordGlobalName =
          (profile.global_name as string | undefined) ?? null;
        const discordAvatar = profile.avatar
          ? `https://cdn.discordapp.com/avatars/${discordId}/${profile.avatar}.png`
          : null;

        // 미등록 유저도 GUEST로 자동 생성 (봇 쪽 upsert와 동일 정책)
        let dbUser = await findUserByDiscordId(discordId);
        if (!dbUser) {
          dbUser = await upsertDiscordUser({
            discordId,
            discordUsername,
            discordGlobalName,
            discordAvatar,
          });
        }

        if (dbUser.status !== "ACTIVE") {
          return "/login?error=AccountSuspended";
        }

        const userId = dbUser._id?.toString();
        if (!userId) {
          return "/login?error=Default";
        }

        // 기존 유저는 Discord 정보 갱신
        await linkDiscord(
          userId,
          discordId,
          discordUsername,
          discordGlobalName,
          discordAvatar,
        );

        await updateLastLogin(userId);

        // user 객체에 DB 정보를 매핑
        user.id = userId;
        user.username = dbUser.username;
        user.displayName = dbUser.displayName;
        user.role = dbUser.role;
        user.discordId = discordId;
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.displayName = user.displayName;
        token.role = user.role;
        token.discordId = user.discordId;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id as string,
        username: token.username as string,
        displayName: token.displayName as string,
        role: token.role as "SUPER_ADMIN" | "ADMIN" | "GM" | "PLAYER" | "GUEST",
        discordId: token.discordId as string | null,
      };
      return session;
    },
  },
});
