/**
 * 팀 연구별 Discord 현황 카드를 점검하고 다시 게시한다.
 *
 * 기본은 DB를 읽어 대상과 현재 동기화 상태만 출력하는 dry-run이다.
 * 라이브 Discord 변경은 --execute --yes를 함께 지정한 경우에만 수행한다.
 * 이 도구는 DB에 저장된 기존 messageId를 웹훅으로 삭제한 뒤 현재 카드를
 * 다시 게시한다. messageId가 없는 구형 중복 메시지는 별도로 정리해야 한다.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === `"` || quote === `'`) &&
    trimmed.endsWith(quote) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string): void {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator);
      if (process.env[key] !== undefined) continue;
      process.env[key] = normalizeEnvValue(trimmed.slice(separator + 1));
    }
  } catch {
    // 파일이 없으면 기존 process.env만 사용한다.
  }
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(resolve(projectRoot, ".env.local"));
loadEnvFile(resolve(projectRoot, ".env"));

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const confirmed = process.argv.includes("--yes");

  if (execute && !confirmed) {
    throw new Error("--execute에는 --yes 확인이 필요합니다.");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI가 필요합니다.");
  }
  if (execute && !process.env.DISCORD_WEBHOOK_RESEARCH_URL) {
    throw new Error(
      "실행 모드에는 DISCORD_WEBHOOK_RESEARCH_URL이 필요합니다.",
    );
  }
  const {
    findEquipmentResearchDiscordCard,
    listEquipmentResearchDiscordProjectKeys,
    requestEquipmentResearchDiscordCardSync,
  } = await import("../lib/db/equipment-research.ts");
  const {
    buildCurrentResearchDiscordPayload,
    syncEquipmentResearchDiscordCard,
  } = await import(
    "../lib/notifications/equipment-research-discord.ts"
  );
  const { getClient } = await import("@stargate/shared-db");

  let failed = false;
  try {
    const projectKeys = await listEquipmentResearchDiscordProjectKeys();
    console.log(
      `[research-discord] mode=${execute ? "execute" : "dry-run"} targets=${projectKeys.length}`,
    );

    const preflightErrors: string[] = [];
    for (const projectKey of projectKeys) {
      const before = await findEquipmentResearchDiscordCard(projectKey);
      try {
        await buildCurrentResearchDiscordPayload(projectKey);
        console.log(
          [
            projectKey,
            "payload=valid",
            `message=${before?.messageId ? "known" : "none"}`,
            `revision=${before?.syncedRevision ?? 0}/${before?.requestedRevision ?? 0}`,
            before?.lastError ? "error=pending" : "error=none",
          ].join(" · "),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        preflightErrors.push(`${projectKey}: ${message}`);
        console.error(`[research-discord] ${projectKey} · payload=invalid · ${message}`);
      }
    }
    if (preflightErrors.length > 0) {
      throw new Error(
        `payload preflight 실패 ${preflightErrors.length}건: ${preflightErrors.join(" | ")}`,
      );
    }
    if (!execute) return;

    for (const projectKey of projectKeys) {
      await requestEquipmentResearchDiscordCardSync(projectKey);
      const result = await syncEquipmentResearchDiscordCard(projectKey);
      console.log(`[research-discord] ${projectKey} -> ${result}`);
      if (result === "failed" || result === "pass_limit") failed = true;
    }
  } finally {
    await (await getClient()).close();
  }

  if (failed) process.exitCode = 1;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[research-discord] ${message}`);
  process.exitCode = 1;
});
