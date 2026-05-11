import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 워크스페이스 내부 패키지(@stargate/shared-db)를 Next.js가 트랜스파일하도록 설정
  transpilePackages: ["@stargate/shared-db"],
};

export default nextConfig;
