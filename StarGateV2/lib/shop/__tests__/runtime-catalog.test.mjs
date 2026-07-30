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

const originalMongoUri = process.env.MONGODB_URI;
process.env.MONGODB_URI =
  originalMongoUri ?? "mongodb://127.0.0.1:27017/stargate-test";
const {
  mergeRuntimeShopCatalog,
  toRuntimeShopCatalogItem,
} = await import("../runtime-catalog.ts");
if (originalMongoUri === undefined) delete process.env.MONGODB_URI;

function master(overrides = {}) {
  return {
    slug: "dynamic-ration",
    name: "동적 전투식량",
    category: "CONSUMABLE",
    description: "운영 등록 품목",
    price: 25,
    effect: "HP 3 회복",
    shopMeta: {
      stockMin: 2,
      stockMax: 6,
      appearRate: 0.75,
      icon: "🥫",
      color: "#445566",
      pageGroup: "RECOVERY",
    },
    isAvailable: true,
    isPublic: true,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    ...overrides,
  };
}

test("runtime catalog keeps a static slug authoritative and appends a valid dynamic item", () => {
  const staticItem = {
    slug: "static-ration",
    name: "정적 전투식량",
    icon: "S",
    price: 10,
    effect: "정적 효과",
    description: "정적 설명",
    stockMin: 1,
    stockMax: 2,
    appearRate: 1,
    color: "#112233",
    pageGroup: "BASIC",
  };
  const merged = mergeRuntimeShopCatalog(
    [staticItem],
    [
      master({
        slug: "static-ration",
        name: "DB가 덮어쓰면 안 됨",
      }),
      master(),
    ],
  );

  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], staticItem);
  assert.equal(merged[1].slug, "dynamic-ration");
  assert.equal(merged[1].icon, "🥫");
  assert.equal(merged[1].pageGroup, "RECOVERY");
});

test("runtime catalog rejects rows that cannot safely enter every shop flow", () => {
  const invalidRows = [
    master({ slug: undefined }),
    master({ slug: "Invalid Slug" }),
    master({ name: "  " }),
    master({ category: "WEAPON" }),
    master({ price: "협의" }),
    master({ isAvailable: false }),
    master({ isPublic: false }),
    master({ shopMeta: undefined }),
    master({
      shopMeta: { stockMin: 0, stockMax: 5, appearRate: 1 },
    }),
    master({
      shopMeta: { stockMin: 5, stockMax: 4, appearRate: 1 },
    }),
    master({
      shopMeta: { stockMin: 1, stockMax: 5, appearRate: 1.1 },
    }),
    master({
      shopMeta: {
        stockMin: 1,
        stockMax: 5,
        appearRate: 1,
        color: "red",
      },
    }),
    master({
      shopMeta: {
        stockMin: 1,
        stockMax: 5,
        appearRate: 1,
        icon: "x".repeat(17),
      },
    }),
    master({ isAvailable: "yes" }),
    master({ isPublic: 1 }),
    master({ name: 42 }),
  ];

  for (const row of invalidRows) {
    assert.equal(toRuntimeShopCatalogItem(row), null);
  }
});

test("runtime catalog hides a static item without an eligible master row", () => {
  const staticItem = {
    slug: "static-ration",
    name: "정적 전투식량",
    icon: "S",
    price: 10,
    effect: "정적 효과",
    description: "정적 설명",
    stockMin: 1,
    stockMax: 2,
    appearRate: 1,
    color: "#112233",
    pageGroup: "BASIC",
  };

  assert.deepEqual(mergeRuntimeShopCatalog([staticItem], []), []);
  assert.deepEqual(
    mergeRuntimeShopCatalog(
      [staticItem],
      [master({ slug: "static-ration", isAvailable: false })],
    ),
    [],
  );
});

test("runtime catalog ignores unsafe preview paths without dropping the item", () => {
  const item = toRuntimeShopCatalogItem(
    master({ previewImage: "/assets/../api/erp/users" }),
  );

  assert.ok(item);
  assert.equal(item.previewImage, undefined);
});

test("runtime catalog normalizes safe defaults and preserves local preview image", () => {
  const item = toRuntimeShopCatalogItem(
    master({
      description: "",
      effect: "",
      previewImage: "/assets/shop/items/dynamic-ration.png",
      shopMeta: {
        stockMin: 1,
        stockMax: 3,
        appearRate: 0.5,
      },
    }),
  );

  assert.ok(item);
  assert.equal(item.icon, "◈");
  assert.equal(item.color, "#d1b25c");
  assert.equal(item.pageGroup, "BASIC");
  assert.equal(
    item.previewImage,
    "/assets/shop/items/dynamic-ration.png",
  );
});
