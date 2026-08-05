import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const extensionCandidates = ["", ".ts", ".tsx", ".js", ".mjs"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of extensionCandidates) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  SESSION_REPORT_REFERENCE_MAX_COUNT,
  SESSION_REPORT_REFERENCE_MAX_LENGTH,
  formatSessionReportReferenceTexts,
  parseSessionReportReferenceTexts,
} = await import("../../session-report-references.ts");
const { validateSessionReportReferences } = await import(
  "../session-report-validators.ts"
);

test("구조화 보고서 링크 텍스트를 trim한 고유 배열로 변환한다", () => {
  const parsed = parseSessionReportReferenceTexts({
    relatedWikiSlugs: " black-pyramid \nsector-7\n",
    relatedPersonnelCodenames: "AGENT_ZULU",
    relatedCatalogSlugs: "camo-kit\n",
  });

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      relatedWikiSlugs: ["black-pyramid", "sector-7"],
      relatedPersonnelCodenames: ["AGENT_ZULU"],
      relatedCatalogSlugs: ["camo-kit"],
    },
  });
  assert.deepEqual(
    formatSessionReportReferenceTexts(parsed.ok ? parsed.value : {}),
    {
      relatedWikiSlugs: "black-pyramid\nsector-7",
      relatedPersonnelCodenames: "AGENT_ZULU",
      relatedCatalogSlugs: "camo-kit",
    },
  );
});

test("구조화 보고서 링크는 중복·빈 값·길이·개수 위반을 거부한다", async (t) => {
  await t.test("trim 후 중복", () => {
    const result = parseSessionReportReferenceTexts({
      relatedWikiSlugs: "sector-7\n sector-7",
      relatedPersonnelCodenames: "",
      relatedCatalogSlugs: "",
    });
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /중복/u);
  });

  await t.test("항목 길이", async () => {
    const result = validateSessionReportReferences({
      relatedWikiSlugs: ["x".repeat(SESSION_REPORT_REFERENCE_MAX_LENGTH + 1)],
    });
    assert.ok("error" in result);
    assert.equal(result.error.status, 400);
    assert.match((await result.error.json()).error, /1~160자/u);
  });

  await t.test("항목 개수", async () => {
    const result = validateSessionReportReferences({
      relatedCatalogSlugs: Array.from(
        { length: SESSION_REPORT_REFERENCE_MAX_COUNT + 1 },
        (_, index) => `item-${index}`,
      ),
    });
    assert.ok("error" in result);
    assert.equal(result.error.status, 400);
    assert.match((await result.error.json()).error, /200개/u);
  });

  await t.test("빈 배열 항목", async () => {
    const result = validateSessionReportReferences({
      relatedPersonnelCodenames: ["   "],
    });
    assert.ok("error" in result);
    assert.equal(result.error.status, 400);
  });
});

test("API 구조화 링크 검증은 선택 필드만 정규화한다", () => {
  const result = validateSessionReportReferences({
    relatedWikiSlugs: [" black-pyramid "],
  });
  assert.deepEqual(result, {
    value: { relatedWikiSlugs: ["black-pyramid"] },
  });
});
