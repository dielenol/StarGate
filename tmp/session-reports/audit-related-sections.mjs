import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/package.json`);
const { MongoClient } = require("mongodb");

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

function sections(content) {
  const text = String(content ?? "");
  const headings = [...text.matchAll(/^## .+$/gm)].map((match) => ({
    heading: match[0],
    index: match.index ?? 0,
  }));
  return headings.map((heading, index) => {
    const next = headings[index + 1];
    return {
      heading: heading.heading,
      body: text.slice(heading.index, next?.index ?? text.length),
    };
  });
}

function isRelatedHeading(heading) {
  return /관련\s*(문서|위키|항목|인물|보고서|자료|서사|카탈로그)/u.test(heading);
}

function listItems(sectionBody) {
  return sectionBody
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/u)?.[1])
    .filter(Boolean);
}

loadEnv();

const client = new MongoClient(process.env.MONGODB_URI, {
  maxPoolSize: 1,
  serverSelectionTimeoutMS: 5000,
});

await client.connect();

try {
  const db = client.db(process.env.DB_NAME ?? "stargate");
  const wikiPages = await db.collection("wiki_pages").find({}).sort({ slug: 1 }).toArray();
  const reports = await db.collection("session_reports").find({}).sort({ sessionId: 1 }).toArray();

  const wiki = wikiPages.flatMap((page) =>
    sections(page.content)
      .filter((section) => isRelatedHeading(section.heading))
      .map((section) => ({
        surface: "wiki_pages",
        key: page.slug,
        title: page.title,
        heading: section.heading,
        items: listItems(section.body),
        body: section.body,
      })),
  );

  const sessionReports = reports.flatMap((report) =>
    sections(report.summary)
      .filter((section) => isRelatedHeading(section.heading))
      .map((section) => ({
        surface: "session_reports",
        key: report.sessionId,
        title: report.sessionTitle,
        heading: section.heading,
        items: listItems(section.body),
        body: section.body,
      })),
  );

  console.log(JSON.stringify({ wiki, sessionReports }, null, 2));
} finally {
  await client.close();
}
