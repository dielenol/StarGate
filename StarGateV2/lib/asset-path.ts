// public/ 하위 정적 자산 경로를 환경별로 안전하게 생성합니다.
// - 로컬/Vercel 루트 배포: NEXT_PUBLIC_APP_BASE_PATH 미설정(기본값 "")
// - 서브패스 배포: NEXT_PUBLIC_APP_BASE_PATH="/StarGate" 등으로 설정
const PUBLIC_IMAGE_EXT_RE = /\.(png|jpe?g)$/i;
const CACHE_BUSTED_PUBLIC_IMAGES = new Map([
  ["/assets/npcs/Casey-Racer-Valkyrie-profile.webp", "20260611-cutout"],
  ["/assets/npcs/David-O-Callahan-Sandman-profile.webp", "20260611-cutout"],
  ["/assets/npcs/Igrit-profile.webp", "20260611-cutout"],
  ["/assets/npcs/ORSIS-201-DonaDona-profile.webp", "20260611-cutout"],
  ["/assets/npcs/Puck-Asshole-profile.webp", "20260611-cutout"],
  ["/assets/npcs/Zulu-269-Punk-Cat-profile.webp", "20260611-cutout"],
  ["/assets/peoples/Siyu-pixel-character.webp", "20260708-sd"],
  ["/assets/peoples/Valeria-pixel-profile.webp", "20260702-profile"],
]);

function applyPublicImageVersion(assetPath: string): string {
  const version = CACHE_BUSTED_PUBLIC_IMAGES.get(assetPath);
  if (!version) return assetPath;
  return `${assetPath}?v=${version}`;
}

export function preferOptimizedPublicImagePath(assetPath: string): string {
  if (!assetPath.startsWith("/assets/")) return assetPath;
  if (!PUBLIC_IMAGE_EXT_RE.test(assetPath)) {
    return applyPublicImageVersion(assetPath);
  }
  return applyPublicImageVersion(assetPath.replace(PUBLIC_IMAGE_EXT_RE, ".webp"));
}

export function resolvePublicAssetPath(assetPath: string): string {
  const normalizedAssetPath = preferOptimizedPublicImagePath(
    assetPath.startsWith("/") ? assetPath : `/${assetPath}`,
  );
  const rawBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH?.trim() ?? "";

  if (!rawBasePath || rawBasePath === "/") {
    return normalizedAssetPath;
  }

  const prefixedBasePath = rawBasePath.startsWith("/") ? rawBasePath : `/${rawBasePath}`;
  const normalizedBasePath = prefixedBasePath.replace(/\/+$/, "");

  return `${normalizedBasePath}${normalizedAssetPath}`;
}
