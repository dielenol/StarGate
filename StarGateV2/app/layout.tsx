import type { Metadata } from "next";

import { JetBrains_Mono, Noto_Sans_KR } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { STRIP_INJECTED_USER_SELECT_SCRIPT } from "@/lib/runtime/strip-injected-user-select";

import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// metadataBase 경고를 제거하고 환경별 절대 URL 기준을 고정합니다.
// 우선순위:
// 1) NEXT_PUBLIC_SITE_URL (수동 지정)
// 2) VERCEL_PROJECT_PRODUCTION_URL (Vercel 제공)
// 3) 로컬 개발 기본값
const metadataBase = process.env.NEXT_PUBLIC_SITE_URL
  ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    : new URL("http://localhost:43849");

export const metadata: Metadata = {
  title: "NOVUS ORDO",
  description: "노부스 오르도에 오신 것을 환영합니다.",
  metadataBase,
  // 공유 미리보기에서 페이지 본문 이미지를 임의로 집어오지 않도록
  // OG/Twitter 이미지를 전용 1200×630 jpg(48KB)로 명시적으로 고정합니다.
  // (기존 928KB StarGate_logo.png 직접 참조 제거 — 원본 파일은 유지)
  openGraph: {
    title: "NOVUS ORDO",
    description: "노부스 오르도에 오신 것을 환영합니다.",
    images: [
      {
        url: "/assets/og/novus-ordo-og.jpg",
        width: 1200,
        height: 630,
        alt: "StarGate 로고",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NOVUS ORDO",
    description: "노부스 오르도에 오신 것을 환영합니다.",
    images: ["/assets/og/novus-ordo-og.jpg"],
  },
  icons: {
    icon: "/assets/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${jetbrainsMono.variable} ${notoSansKr.variable}`}
    >
      <head>
        {/* 확장 프로그램이 주입한 인라인 user-select로 인한 hydration mismatch 방지 */}
        <script
          id="strip-injected-user-select"
          dangerouslySetInnerHTML={{ __html: STRIP_INJECTED_USER_SELECT_SCRIPT }}
        />
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
