import type { NextConfig } from "next";

// 서버 기능(API Route)을 사용하는 현재 프로젝트 기준 설정입니다.
// 정적 호스팅(GitHub Pages) 전용 옵션은 제거하고, Vercel/Node 런타임 배포를 기본으로 둡니다.
const nextConfig: NextConfig = {
  // Vercel/Node 환경에서는 Next Image 최적화로 대형 public 이미지를 AVIF/WebP로 변환합니다.
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    qualities: [62, 70, 72, 75],
    localPatterns: [
      {
        pathname: "/assets/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "media.discordapp.net",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/sound/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  // 워크스페이스 내부 패키지(@stargate/shared-db)를 Next.js가 트랜스파일하도록 설정
  transpilePackages: ["@stargate/shared-db"],
  // SVG를 React 컴포넌트로 import 할 수 있도록 SVGR 연결 (Turbopack 경로)
  // 주의: SVGR 기본 svgo는 `removeViewBox` 가 켜져 있어 viewBox가 사라지고,
  // CSS로 축소한 크기에서 path가 잘려 보인다. icon:true 또는 svgoConfig로 유지시킨다.
  turbopack: {
    rules: {
      "*.svg": {
        loaders: [
          {
            loader: "@svgr/webpack",
            options: {
              icon: true, // viewBox 유지 + width/height="1em" (CSS font-size/width로 제어 가능)
              svgoConfig: {
                plugins: [
                  {
                    name: "preset-default",
                    params: {
                      overrides: {
                        removeViewBox: false,
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
