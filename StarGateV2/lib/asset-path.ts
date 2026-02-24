// public/ 하위 정적 자산 경로를 환경별로 안전하게 생성합니다.
// - 로컬/Vercel 루트 배포: NEXT_PUBLIC_APP_BASE_PATH 미설정(기본값 "")
// - 서브패스 배포: NEXT_PUBLIC_APP_BASE_PATH="/StarGate" 등으로 설정
export function resolvePublicAssetPath(assetPath: string): string {
  const normalizedAssetPath = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  const rawBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH?.trim() ?? "";

  if (!rawBasePath || rawBasePath === "/") {
    return normalizedAssetPath;
  }

  const prefixedBasePath = rawBasePath.startsWith("/") ? rawBasePath : `/${rawBasePath}`;
  const normalizedBasePath = prefixedBasePath.replace(/\/+$/, "");

  return `${normalizedBasePath}${normalizedAssetPath}`;
}
