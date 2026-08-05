import { createHash } from "node:crypto";
import { relative } from "node:path";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function seedManifestHash(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

export function seedPayloadSourceId(
  file: string,
  manifestHash: string,
  cwd = process.cwd(),
): string {
  const sourcePath = relative(cwd, file);
  return `seed-payload:${createHash("sha256")
    .update(`${sourcePath}\0${manifestHash}`)
    .digest("hex")
    .slice(0, 32)}`;
}

/** 한 seed 파일이 기여하는 historical report identity를 추출한다. */
export function historicalReportSessionIds(sourceText: string): string[] {
  const parsed = JSON.parse(sourceText) as unknown;
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  const sessionIds = new Set<string>();
  for (const envelope of envelopes) {
    if (!isRecord(envelope) || envelope.collection !== "session_reports") {
      continue;
    }
    const payload = isRecord(envelope.payload) ? envelope.payload : null;
    const filter = isRecord(envelope.filter) ? envelope.filter : null;
    const sessionId = payload?.sessionId ?? filter?.sessionId;
    if (
      typeof sessionId === "string" &&
      sessionId.trim() &&
      !/^[a-f0-9]{24}$/iu.test(sessionId)
    ) {
      sessionIds.add(sessionId.trim());
    }
  }
  return [...sessionIds].sort();
}
