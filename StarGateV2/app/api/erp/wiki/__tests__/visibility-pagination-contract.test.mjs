import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { replaceUnresolvedExplicitMarkup } from "../../../../(erp)/erp/wiki/explicit-link-fallback.ts";

const ROOT = new URL("../../../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("wiki 목록 API는 V+만 private을 포함하고 cursor 요약 조회를 사용한다", async () => {
  const route = await source("app/api/erp/wiki/route.ts");
  assert.match(route, /listWikiPageSummaries\s*\(\s*\{/u);
  assert.match(route, /includePrivate:\s*hasRole\(session\.user\.role,\s*"V"\)/u);
  assert.match(route, /cursor:\s*cursor\s*\?\?\s*undefined/u);
  assert.match(route, /limit은 1 이상 50 이하/u);
  assert.match(route, /검색어는 120자 이하여야/u);
  assert.match(route, /cursor가 너무 깁니다/u);
  assert.doesNotMatch(route, /listWikiPages\(/u);
});

test("wiki 상세 API와 RSC는 동일한 visibility-aware 조회를 사용한다", async () => {
  const [api, page] = await Promise.all([
    source("app/api/erp/wiki/[id]/route.ts"),
    source("app/(erp)/erp/wiki/[id]/page.tsx"),
  ]);
  for (const code of [api, page]) {
    assert.match(code, /findVisibleWikiPageById/u);
    assert.match(code, /includePrivate:/u);
  }
  assert.match(api, /status:\s*404/u);
});

test("wiki 클라이언트는 본문 전체 필터 대신 infinite server query를 사용한다", async () => {
  const [client, hook] = await Promise.all([
    source("app/(erp)/erp/wiki/WikiClient.tsx"),
    source("hooks/queries/useWikiQuery.ts"),
  ]);
  assert.match(hook, /useInfiniteQuery/u);
  assert.match(hook, /getNextPageParam/u);
  assert.match(client, /fetchNextPage/u);
  assert.match(client, /page\.excerpt/u);
  assert.doesNotMatch(client, /page\.content/u);
  assert.doesNotMatch(client, /searchHaystack|filterWikiPages/u);
});

test("Lore Explorer는 index와 기존 컬렉션 fallback을 함께 제공한다", async () => {
  const [search, hook, client, searchBar] = await Promise.all([
    source("lib/db/lore-search.ts"),
    source("hooks/queries/useLoreSearchQuery.ts"),
    source("app/(erp)/erp/wiki/WikiClient.tsx"),
    source("app/(erp)/erp/wiki/WikiSearchBar.tsx"),
  ]);
  assert.match(search, /searchLoreDocuments/u);
  for (const collection of [
    "wiki_pages",
    "session_reports",
    "characters",
    "master_items",
    "factions",
    "institutions",
  ]) {
    assert.match(search, new RegExp(`collection\\(\\"${collection}\\"\\)`));
  }
  assert.match(search, /sourceMode:/u);
  assert.match(search, /"hybrid"/u);
  assert.match(search, /statuses:\s*INDEX_SEARCH_STATUSES/u);
  assert.match(search, /asDate\(doc\.sourceUpdatedAt\).*live\.updatedAt/su);
  assert.match(search, /viewer\.role === "GM" \? \{\} : \{ isPublic: true \}/u);
  assert.match(search, /filterCharacterForList/u);
  assert.match(search, /getEffectivePersonnelClearance/u);
  assert.match(search, /maskedDisplayName/u);
  assert.match(search, /"lore\.name": \{ \$regex: regex \}/u);
  assert.match(search, /visibleSearchText\.includes/u);
  assert.match(search, /degradedSources/u);
  assert.match(search, /"index" \| LoreSearchKind/u);
  assert.match(search, /findPersonnelCandidates\(characterBaseSearchFields/u);
  assert.match(search, /findPersonnelCandidates\(characterIdentitySearchFields/u);
  assert.match(search, /findPersonnelCandidates\(characterRealNameSearchFields/u);
  assert.match(search, /for \(const result of \[\.\.\.indexed, \.\.\.fallback\]\)/u);
  assert.match(search, /merged\.set\(result\.href, result\)/u);
  assert.match(hook, /INITIAL_LORE_SEARCH_STALE_TIME_MS/u);
  assert.match(
    hook,
    /staleTime:\s*options\?\.initialData\s*\?\s*INITIAL_LORE_SEARCH_STALE_TIME_MS\s*:\s*0/u,
  );
  assert.doesNotMatch(hook, /refetchOnMount:\s*"always"/u);
  assert.match(client, /nextQuery\.trim\(\)\.slice\(0, 120\)/u);
  assert.match(searchBar, /maxLength=\{120\}/u);
});

test("미해결 explicit link는 raw bracket 대신 label fallback을 거친다", async () => {
  const detail = await source(
    "app/(erp)/erp/wiki/[id]/WikiDetailContent.tsx",
  );
  const display = await source("app/(erp)/erp/wiki/wiki-display.ts");
  assert.match(detail, /replaceUnresolvedExplicitMarkup/u);
  assert.match(detail, /renderMarkdown/u);
  assert.match(display, /replaceUnresolvedExplicitMarkup\(value\)/u);
  assert.equal(
    replaceUnresolvedExplicitMarkup(
      "<p>[[wiki:missing|표시명]] · [[catalog:unknown]]</p>",
    ),
    "<p>표시명 · unknown</p>",
  );
  assert.equal(
    replaceUnresolvedExplicitMarkup(
      "<p>[[wiki:missing|[표시명](/erp/wiki)]]</p>",
    ),
    "<p>표시명</p>",
  );
});
