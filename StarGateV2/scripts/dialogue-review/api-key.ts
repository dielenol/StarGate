import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    let closingIndex = -1;
    let escaped = false;
    for (let index = 1; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (quote === '"' && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }
      if (character === quote && !escaped) {
        closingIndex = index;
        break;
      }
      escaped = false;
    }
    if (closingIndex < 0) return "";
    const inner = trimmed.slice(1, closingIndex);
    return quote === '"'
      ? inner
          .replace(/\\n/gu, "\n")
          .replace(/\\"/gu, '"')
          .replace(/\\\\/gu, "\\")
      : inner;
  }
  return trimmed.replace(/\s+#.*$/u, "").trim();
}

export function parseOllamaApiKeyFromEnvFile(source: string): string | null {
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(
      /^\s*(?:export\s+)?OLLAMA_API_KEY\s*=\s*(.*)$/u,
    );
    if (!match) continue;
    const value = unquoteEnvValue(match[1] ?? "").trim();
    return value || null;
  }
  return null;
}

export async function resolveOllamaApiKey(options: {
  env?: NodeJS.ProcessEnv;
  projectRoot: string;
}): Promise<string | null> {
  const processValue = (options.env ?? process.env).OLLAMA_API_KEY?.trim();
  if (processValue) return processValue;

  try {
    const source = await readFile(resolve(options.projectRoot, ".env.local"), "utf8");
    return parseOllamaApiKeyFromEnvFile(source);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : null;
    if (code === "ENOENT") return null;
    throw new Error(".env.local에서 OLLAMA_API_KEY를 읽지 못했습니다.");
  }
}
