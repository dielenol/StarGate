import "./globals.css";

import type { Metadata } from "next";

import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { auth } from "@/lib/auth/config";

export const metadata: Metadata = {
  title: "TRPG 세션 캘린더",
  description: "StarGate TRPG 세션 일정 관리",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 서버에서 세션을 한 번 읽어 클라이언트 SessionProvider 의 초기값으로 전달.
  const session = await auth();

  return (
    <html lang="ko">
      <body>
        <AuthSessionProvider session={session}>
          <QueryProvider>{children}</QueryProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
