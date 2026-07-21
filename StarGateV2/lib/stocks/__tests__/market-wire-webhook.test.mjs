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

const {
  createScheduledStockMarketWireMessage,
  deleteScheduledStockMarketWireMessage,
} = await import("../market-wire.ts");

const ENV_KEY = "DISCORD_WEBHOOK_STOCK_URL";

function payload() {
  return {
    username: "Market Wire",
    allowed_mentions: { parse: [] },
    embeds: [],
  };
}

test("scheduled wire uses wait=true and returns the Discord message id", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  const calls = [];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ id: "wire-123" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  const messageId = await createScheduledStockMarketWireMessage(payload());

  assert.equal(messageId, "wire-123");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(new URL(calls[0].url).searchParams.get("wait"), "true");
});

test("scheduled wire deletes a stored webhook message id", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  const calls = [];
  process.env[ENV_KEY] =
    "https://discord.test/api/webhooks/hook/token?wait=true";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await deleteScheduledStockMarketWireMessage("wire 123");

  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(
    calls[0].url,
    "https://discord.test/api/webhooks/hook/token/messages/wire%20123",
  );
});

test("a missing old scheduled wire is treated as already deleted", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token";
  globalThis.fetch = async () => new Response(null, { status: 404 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await assert.doesNotReject(
    deleteScheduledStockMarketWireMessage("missing-wire"),
  );
});

test("a non-404 delete error is surfaced to the batch synchronizer", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = "https://discord.test/api/webhooks/hook/token";
  globalThis.fetch = async () =>
    new Response("Missing Access", { status: 403 });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  await assert.rejects(
    deleteScheduledStockMarketWireMessage("forbidden-wire"),
    /주식 공시 삭제 실패 \(403\)/,
  );
});
