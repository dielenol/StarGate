import type { Metadata } from "next";

import { JetBrains_Mono, Noto_Sans_KR } from "next/font/google";

import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
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
    : new URL("http://localhost:3000");

export const metadata: Metadata = {
  title: "NOVUS ORDO",
  description: "노부스 오르도에 오신 것을 환영합니다.",
  metadataBase,
  // 공유 미리보기에서 페이지 본문 이미지를 임의로 집어오지 않도록
  // OG/Twitter 이미지를 로고로 명시적으로 고정합니다.
  openGraph: {
    title: "NOVUS ORDO",
    description: "노부스 오르도에 오신 것을 환영합니다.",
    images: [
      {
        url: "/assets/StarGate_logo.png",
        width: 1200,
        height: 1200,
        alt: "StarGate 로고",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NOVUS ORDO",
    description: "노부스 오르도에 오신 것을 환영합니다.",
    images: ["/assets/StarGate_logo.png"],
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
      <body>{children}</body>
    </html>
  );
}
