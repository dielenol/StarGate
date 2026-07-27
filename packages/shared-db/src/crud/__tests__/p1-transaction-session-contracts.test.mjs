import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const INVENTORY_CRUD = new URL("../inventory.ts", import.meta.url);
const STOCKS_CRUD = new URL("../stocks.ts", import.meta.url);
const WORKSHOP_CRUD = new URL(
  "../../../../../StarGateV2/lib/db/equipment-workshop-requests.ts",
  import.meta.url,
);

test("shared inventory upsert accepts and forwards a Mongo transaction session", async () => {
  const source = await readFile(INVENTORY_CRUD, "utf8");
  const functionIndex = source.indexOf(
    "export async function addToSharedInventory(",
  );
  const nextFunctionIndex = source.indexOf(
    "export async function removeFromSharedInventory(",
    functionIndex,
  );
  const body = source.slice(functionIndex, nextFunctionIndex);

  assert.match(body, /options: \{ session\?: ClientSession \} = \{\}/);
  assert.match(body, /session: options\.session/);
});

test("manual stock price CRUD forwards one session to read, write and history append", async () => {
  const source = await readFile(STOCKS_CRUD, "utf8");

  for (const name of [
    "getStockPrice",
    "ensureStockPrice",
    "updateStockPrice",
    "recordStockPriceHistory",
  ]) {
    const functionIndex = source.indexOf(`export async function ${name}(`);
    assert.notEqual(functionIndex, -1, `${name} 누락`);
    const nextFunctionIndex = source.indexOf(
      "export async function ",
      functionIndex + 1,
    );
    const body = source.slice(
      functionIndex,
      nextFunctionIndex === -1 ? undefined : nextFunctionIndex,
    );
    assert.match(body, /session: options\.session/, `${name} session 전달 누락`);
  }
  assert.match(
    source,
    /recordStockPriceHistory\([\s\S]*options: \{ session\?: ClientSession; createdAt\?: Date \} = \{\}/,
  );
});

test("workshop request insert forwards the transaction session", async () => {
  const source = await readFile(WORKSHOP_CRUD, "utf8");
  const functionIndex = source.indexOf(
    "export async function insertEquipmentWorkshopRequest(",
  );
  const nextFunctionIndex = source.indexOf(
    "export async function findEquipmentWorkshopRequestById(",
    functionIndex,
  );
  const body = source.slice(functionIndex, nextFunctionIndex);

  assert.match(body, /options: \{ session\?: ClientSession \} = \{\}/);
  assert.match(body, /session: options\.session/);
});
