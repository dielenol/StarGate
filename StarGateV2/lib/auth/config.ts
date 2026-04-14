/**
 * Auth.js v5 설정
 *
 * Discord OAuth + Credentials (ID/PW) 이중 인증.
 * JWT 전략으로 서버리스 환경 최적화.
 */

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";

import type { UserRole } from "@/types/user";
import {
  findUserByUsername,
  findUserByDiscordId,
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
        const existingUser = await findUserByDiscordId(discordId);

        if (!existingUser) {
          // Discord 계정이 등록되지 않은 경우 로그인 거부
          return "/login?error=NoAccount";
        }

        if (existingUser.status !== "ACTIVE") {
          return "/login?error=AccountSuspended";
        }

        // Discord 정보 갱신
        await linkDiscord(
          existingUser._id!.toString(),
          discordId,
          profile.username as string,
          profile.avatar
            ? `https://cdn.discordapp.com/avatars/${discordId}/${profile.avatar}.png`
            : null,
        );

        await updateLastLogin(existingUser._id!.toString());

        // user 객체에 DB 정보를 매핑
        user.id = existingUser._id!.toString();
        user.username = existingUser.username;
        user.displayName = existingUser.displayName;
        user.role = existingUser.role;
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
        id: token.id,
        username: token.username,
        displayName: token.displayName,
        role: token.role,
        discordId: token.discordId,
      };
      return session;
    },
  },
});
