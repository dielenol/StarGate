import type { NextConfig } from "next";

// 서버 기능(API Route)을 사용하는 현재 프로젝트 기준 설정입니다.
// 정적 호스팅(GitHub Pages) 전용 옵션은 제거하고, Vercel/Node 런타임 배포를 기본으로 둡니다.
const nextConfig: NextConfig = {
  // Vercel/Node 환경에서 Next Image 최적화를 사용하려면 false로 되돌릴 수 있습니다.
  images: {
    unoptimized: true,
  },
  // 워크스페이스 내부 패키지(@stargate/shared-db)를 Next.js가 트랜스파일하도록 설정
  transpilePackages: ["@stargate/shared-db"],
  // SVG를 React 컴포넌트로 import 할 수 있도록 SVGR 연결 (Turbopack 경로)
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
