import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StarGate | Novus Ordo",
  description:
    "Stargate TRPG 공식 랜딩 웹앱",
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
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
