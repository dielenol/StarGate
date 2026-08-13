import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("대형 목록은 DOM 순서를 유지한 채 화면 밖 카드 렌더만 지연한다", async () => {
  const [catalogClient, catalogStyles, characterClient, characterStyles, personnelClient, personnelStyles] =
    await Promise.all([
      source("app/(erp)/erp/wiki/catalog/[category]/CatalogClient.tsx"),
      source("app/(erp)/erp/wiki/catalog/[category]/CatalogClient.module.css"),
      source("app/(erp)/erp/characters/CharactersClient.tsx"),
      source("app/(erp)/erp/characters/page.module.css"),
      source("app/(erp)/erp/personnel/PersonnelClient.tsx"),
      source("app/(erp)/erp/personnel/_components/PersonnelCard.module.css"),
    ]);

  for (const client of [catalogClient, characterClient, personnelClient]) {
    assert.match(client, /data-render-strategy="defer-offscreen"/);
  }
  assert.match(catalogClient, /filtered\.map\(\(item\)/);
  assert.match(characterClient, /displayedAgents\.map\(\(c\)/);
  assert.match(personnelClient, /members\.map\(\(c\)/);

  for (const styles of [catalogStyles, characterStyles, personnelStyles]) {
    assert.match(styles, /@supports \(content-visibility: auto\)/);
    assert.match(styles, /content-visibility: auto/);
    assert.match(styles, /contain-intrinsic-block-size: auto \d+px/);
  }
});
