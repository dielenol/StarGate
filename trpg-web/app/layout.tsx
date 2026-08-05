import "./globals.css";

import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { auth } from "@/lib/auth/config";
import {
  parseThemePreference,
  THEME_COOKIE_NAME,
} from "@/lib/theme/preference";

export const metadata: Metadata = {
  title: "TRPG 세션 캘린더",
  description: "StarGate TRPG 세션 일정 관리",
  icons: {
    icon: "/assets/favicon.ico",
    shortcut: "/assets/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 서버에서 세션을 한 번 읽어 클라이언트 SessionProvider 의 초기값으로 전달.
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const theme = parseThemePreference(
    cookieStore.get(THEME_COOKIE_NAME)?.value,
  );

  return (
    <html lang="ko" data-theme={theme ?? undefined}>
      <body>
        <AuthSessionProvider session={session}>
          <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
