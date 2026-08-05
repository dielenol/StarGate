/** 해석되지 않은 명시 링크는 내부 markup 대신 안전한 표시 라벨만 남긴다. */
export function replaceUnresolvedExplicitMarkup(html: string): string {
  return html
    .replace(
      /\[\[[^\]|]+\|\[([^\]]+)\]\([^)]+\)\]\]/gu,
      (_match, label: string) => label.trim(),
    )
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu,
      (_match, rawKey: string, rawLabel: string | undefined) => {
        const unqualifiedKey = rawKey.replace(/^[a-z가-힣]+:/iu, "").trim();
        return (rawLabel ?? unqualifiedKey).trim();
      },
    );
}
