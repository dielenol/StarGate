import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    const basePath = specifier.startsWith("@/")
      ? resolve(rootDir, specifier.slice(2))
      : specifier.startsWith(".")
        ? resolve(dirname(fileURLToPath(context.parentURL)), specifier)
        : null;
    if (basePath) {
      for (const extension of ["", ".ts", ".tsx", ".js", ".mjs"]) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { wikiArticleContent, wikiFirstImage } = await import(
  "../../app/(erp)/erp/wiki/wiki-display.ts"
);

const title = "빈 창고의 자장가";
const imageLines = [
  '![빈 창고 외부](/assets/session-reports/lullaby-part1/warehouse-exterior.webp "창고에 도착한 일행")',
  '![자장가 레코드](/assets/session-reports/lullaby-part1/lullaby-record.webp "남겨진 자장가의 기록")',
  '![시유의 이름](/assets/session-reports/lullaby-part1/siyu-naming-room.webp "아이에게 이름을 붙이는 장면")',
];
const content = [
  `# ${title}`,
  "",
  "기억을 따라가는 일행의 기록이다.",
  "",
  "## 창고",
  imageLines[0],
  "창고를 조사했다.",
  "",
  "## 레코드",
  imageLines[1],
  "레코드를 재생했다.",
  "",
  "## 기억",
  imageLines[2],
  "시유의 이름을 확인했다.",
].join("\n");

function imagesInOrder(article) {
  return article.split("\n").filter((line) => line.startsWith("!["));
}

test("작전 보고서 위키는 첫 장면을 포함한 이미지 경로·순서·대체문구·캡션을 본문에 보존한다", () => {
  const article = wikiArticleContent(content, title, "작전 보고서");

  assert.deepEqual(imagesInOrder(article), imageLines);
  assert.ok(article.indexOf(imageLines[0]) < article.indexOf("창고를 조사했다."));
  assert.ok(article.indexOf(imageLines[1]) < article.indexOf("레코드를 재생했다."));
  assert.ok(article.indexOf(imageLines[2]) < article.indexOf("시유의 이름을 확인했다."));
});

test("일반 위키와 분류 미지정 호출은 첫 이미지를 인포박스로 추출하는 동작을 유지한다", () => {
  assert.deepEqual(wikiFirstImage(content), {
    src: "/assets/session-reports/lullaby-part1/warehouse-exterior.webp",
    alt: "빈 창고 외부",
    caption: "창고에 도착한 일행",
  });
  for (const category of ["사건", undefined]) {
    const article = wikiArticleContent(content, title, category);
    assert.deepEqual(imagesInOrder(article), imageLines.slice(1));
  }
});
