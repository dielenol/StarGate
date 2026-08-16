import assert from "node:assert/strict";
import test from "node:test";

import "./module-hooks.mjs";

const {
  extractMarkdownImages,
  normalizeMarkdownImageSrc,
  parseMarkdownImageLine,
} = await import("../../markdown-images.ts");
const { renderMarkdown } = await import("../../wiki-render.ts");

test("standalone 로컬 asset 이미지만 안전하게 추출한다", () => {
  const markdown = [
    "본문 ![inline](/assets/session-reports/ignored.webp)",
    '![상황도](/assets/session-reports/alpha.png "알파 작전")',
    "![상황도](/assets/session-reports/alpha.png)",
    "![외부](https://example.com/image.webp)",
    "![상위](../../secret.webp)",
    "![다른 자산](/assets/catalog/item.webp)",
  ].join("\n");

  assert.deepEqual(
    extractMarkdownImages(markdown, {
      srcPrefix: "/assets/session-reports/",
    }),
    [
      {
        src: "/assets/session-reports/alpha.webp",
        alt: "상황도",
        caption: "알파 작전",
      },
    ],
  );
});

test("Markdown 이미지 파서는 caption fallback과 안전 경로를 유지한다", () => {
  assert.deepEqual(
    parseMarkdownImageLine(" ![ 브리핑 ](/assets/session-reports/map.webp) "),
    {
      src: "/assets/session-reports/map.webp",
      alt: "브리핑",
      caption: "브리핑",
    },
  );
  assert.equal(normalizeMarkdownImageSrc("/assets/a/../b.webp"), null);
  assert.equal(normalizeMarkdownImageSrc("javascript:alert(1)"), null);
});

test("공용 파서와 위키 renderer가 같은 이미지 경로·caption을 사용한다", () => {
  const markdown =
    '![현장 기록](/assets/session-reports/field.png "현장 캡션")';
  const [image] = extractMarkdownImages(markdown);
  const html = renderMarkdown(markdown);

  assert.equal(image.src, "/assets/session-reports/field.webp");
  assert.match(html, /src="\/assets\/session-reports\/field\.webp"/u);
  assert.match(html, /<figcaption>현장 캡션<\/figcaption>/u);
});
