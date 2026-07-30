import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FORM = new URL(
  "../../../app/(erp)/erp/admin/catalog/CatalogCreateForm.tsx",
  import.meta.url,
);
const CSS = new URL(
  "../../../app/(erp)/erp/admin/catalog/page.module.css",
  import.meta.url,
);

test("운영 카탈로그는 편의점과 병기부 공용 프리셋 라이브러리를 제공한다", async () => {
  const source = await readFile(FORM, "utf8");
  assert.match(source, /CATALOG_ITEM_PRESETS/);
  assert.match(source, /카탈로그 프리셋 라이브러리/);
  assert.match(source, /편의점 프리셋/);
  assert.match(source, /병기부 프리셋/);
  assert.match(source, /setForm\(\{ \.\.\.preset\.form \}\)/);
  assert.match(
    source,
    /등록 버튼을 누르기 전에는 품목·재고·웹훅이 생성되지 않습니다/,
  );
});

test("프리셋 설명은 ERP 최소 글자 크기와 내부 패널 스타일을 지킨다", async () => {
  const css = await readFile(CSS, "utf8");
  const presetBlock = css.slice(
    css.indexOf(".presetCard"),
    css.indexOf(".messageError"),
  );
  assert.match(presetBlock, /font-size: 14px/);
  assert.doesNotMatch(presetBlock, /font-size:\s*(?:[0-9]|1[0-3])px/);
  assert.match(presetBlock, /border-left: 3px solid var\(--gold-dim\)/);
});
