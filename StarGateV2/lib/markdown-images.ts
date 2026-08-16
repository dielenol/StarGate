import { preferOptimizedPublicImagePath } from "@/lib/asset-path";

export interface MarkdownImageReference {
  src: string;
  alt: string;
  caption: string;
}

const MARKDOWN_IMAGE_PATTERN =
  /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/u;
const SAFE_LOCAL_IMAGE_PATTERN =
  /^\/assets\/[A-Za-z0-9/_ .%()-]+\.(webp|png|jpe?g|gif|avif)$/iu;

export function normalizeMarkdownImageSrc(src: string): string | null {
  const trimmed = src.trim();
  if (trimmed.includes("..") || !SAFE_LOCAL_IMAGE_PATTERN.test(trimmed)) {
    return null;
  }
  return preferOptimizedPublicImagePath(trimmed);
}

export function parseMarkdownImageLine(
  line: string,
): MarkdownImageReference | null {
  const match = line.trim().match(MARKDOWN_IMAGE_PATTERN);
  if (!match) return null;

  const src = normalizeMarkdownImageSrc(match[2]);
  if (!src) return null;

  const alt = match[1].trim();
  return {
    src,
    alt,
    caption: (match[3] ?? alt).trim(),
  };
}

export function extractMarkdownImages(
  markdown: string,
  options: { srcPrefix?: string } = {},
): MarkdownImageReference[] {
  const seen = new Set<string>();
  const images: MarkdownImageReference[] = [];

  for (const line of markdown.split(/\r?\n/u)) {
    const image = parseMarkdownImageLine(line);
    if (!image || seen.has(image.src)) continue;
    if (options.srcPrefix && !image.src.startsWith(options.srcPrefix)) {
      continue;
    }
    seen.add(image.src);
    images.push(image);
  }

  return images;
}
