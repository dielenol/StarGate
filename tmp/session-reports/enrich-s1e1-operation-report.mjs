import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { MongoClient } = require("mongodb");

const SESSION_ID = "NOSB-S1E1-ORDER";
const RECORD_DATE = new Date("2026-03-15T15:00:00.000Z");
const IMPORT_EDIT_DATE = new Date();

function loadEnv() {
  const envText = fs.readFileSync(".env", "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeOperationTerms(text) {
  return text
    .replaceAll("작전기록", "작전 보고서")
    .replaceAll("작전 기록", "작전 보고서")
    .replaceAll("세션 리포트", "작전 보고서");
}

function insertBeforeSection(text, marker, section) {
  if (text.includes(section.heading)) return text;
  const index = text.indexOf(marker);
  if (index === -1) return `${text.trim()}\n\n${section.body}`;
  return `${text.slice(0, index).trimEnd()}\n\n${section.body}\n\n${text.slice(index).trimStart()}`;
}

function enrichReportSummary(summary) {
  let content = normalizeOperationTerms(summary);

  const archiveSection = {
    heading: "## 격리 아카이브 반영",
    body: `## 격리 아카이브 반영
격리 개체 아카이브는 검열된 비명을 ZULU-0028로 등록한다. 공개 가능 등급 표기는 CLEARANCE: DANGEROUS이며, 2026.03 개정본 기준 격리율은 50%다. 현재 격리 위치는 격리구역 지하 방음시설로, 백색소음이 지속되는 단독 격리 환경이 요구된다.

아카이브는 개체의 외형을 검은 노이즈로 뒤덮인 인간형 형체로 기록한다. 주변 문자와 화면 글씨가 깨지고 뒤섞이는 현상, 높은 고주파 공격, 난치성 정신병 유발 가능성, 드론 소음에 대한 민감 반응이 병기되어 있다. 기대 샘플은 깨진 음절과 아직 식별되지 않은 추가 샘플이다.`,
  };

  content = insertBeforeSection(content, "## 결과", archiveSection);
  return content;
}

function enrichOperationWiki(content) {
  let next = normalizeOperationTerms(content);
  const archiveSection = {
    heading: "## 격리 아카이브 반영",
    body: `## 격리 아카이브 반영
격리 개체 아카이브는 검열된 비명을 ZULU-0028로 등록한다. 공개 가능 기록에는 CLEARANCE: DANGEROUS, 격리율 50%, 격리구역 지하 방음시설, 백색소음 단독 격리 조건이 기재되어 있다.

해당 아카이브의 기대 샘플은 깨진 음절과 식별되지 않은 추가 샘플이다. 이는 S1E1에서 관찰된 문자 왜곡, 금지어·자음·깨진 음절 기반 전투 패턴과 연결된다.`,
  };

  next = insertBeforeSection(next, "## 기록 말소와 후속 쟁점", archiveSection);
  return next;
}

function enrichCensoredScream(content) {
  let next = normalizeOperationTerms(content);

  if (!next.includes("영문 표기: Censored Scream")) {
    next = next.replace(
      "격리 번호: ZULU-0028",
      "격리 번호: ZULU-0028\n영문 표기: Censored Scream (아카이브 원문 표기: Ceonsored Scream)",
    );
  }

  if (!next.includes("DOCUMENT REVISION 2026.03")) {
    next = next.replace(
      "격리율: 50%",
      "격리율: 50%\n아카이브 개정: DOCUMENT REVISION 2026.03 / CLEARANCE LEVEL G+",
    );
  }

  return next;
}

async function main() {
  loadEnv();

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(process.env.DB_NAME ?? "stargate");
    const reports = db.collection("session_reports");
    const wikiPages = db.collection("wiki_pages");

    const report = await reports.findOne({ sessionId: SESSION_ID });
    if (!report) throw new Error(`Missing report: ${SESSION_ID}`);

    const summary = enrichReportSummary(report.summary ?? "");
    const reportResult = await reports.updateOne(
      { sessionId: SESSION_ID },
      {
        $set: {
          sessionTitle: "작전 보고서 S1E1: 질서",
          summary,
          locationLabel: "한반도 남부",
          mapX: 81.55,
          mapY: 42,
          mapPrecision: "confirmed",
          gmId: "novus-ordo-record-control",
          gmName: "NOVUS ORDO 사무국 기록통제실 연구원 N. Voss",
          createdAt: RECORD_DATE,
          updatedAt: RECORD_DATE,
        },
      },
    );

    const s1e1Pages = await wikiPages.find({ tags: "S1E1" }).toArray();
    const wikiResults = [];

    for (const page of s1e1Pages) {
      let title = normalizeOperationTerms(page.title);
      let category = normalizeOperationTerms(page.category);
      let content = normalizeOperationTerms(page.content ?? "");

      if (page.slug === "s1e1-order") {
        title = "작전 보고서 S1E1: 질서";
        category = "작전 보고서";
        content = enrichOperationWiki(content);
      } else if (page.slug === "censored-scream") {
        content = enrichCensoredScream(content);
      }

      const result = await wikiPages.updateOne(
        { _id: page._id },
        {
          $set: {
            title,
            category,
            content,
            updatedAt: IMPORT_EDIT_DATE,
          },
        },
      );

      wikiResults.push({
        slug: page.slug,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        title,
        category,
      });
    }

    console.log(
      JSON.stringify(
        {
          report: {
            matched: reportResult.matchedCount,
            modified: reportResult.modifiedCount,
            summaryLength: summary.length,
          },
          wiki: wikiResults,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

await main();
