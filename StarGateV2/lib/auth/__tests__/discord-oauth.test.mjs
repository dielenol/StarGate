import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";

// Exercise the same Auth.js version that the installed NextAuth package uses.
const require = createRequire(import.meta.url);
const nextAuthRequire = createRequire(require.resolve("next-auth"));
const { Auth, customFetch } = await import(
  pathToFileURL(nextAuthRequire.resolve("@auth/core")).href
);
const origin = "http://localhost:43849";
const user = {
  _id: "synthetic-user-id",
  username: "oauth-test-user",
  displayName: "OAuth Test User",
  role: "U",
  status: "ACTIVE",
  discordId: "123456789012345678",
};

function createHarness() {
  const dbCalls = [];
  const fetchCalls = [];
  const errors = [];
  const cookies = new Map();
  const imports = {
    "next-auth": { default: (options) => { config = options; return {}; } },
    "next-auth/providers/credentials": { default: CredentialsProvider },
    "next-auth/providers/discord": { default: DiscordProvider },
    "@/lib/auth/guest": { ERP_GUEST_USER: {} },
    "@/lib/auth/session-runtime": {
      readAuthSecrets: () => "synthetic-oauth-regression-secret",
    },
    "@/lib/db/users": Object.fromEntries([
      "findUserByUsername", "findUserByDiscordId", "findUserById",
      "upsertDiscordUser", "verifyPassword", "updateLastLogin", "linkDiscord",
    ].map((name) => [name, async (...args) => {
      dbCalls.push({ name, args });
      if (name === "findUserByDiscordId" || name === "findUserById") return { ...user };
      throw new Error(`Unexpected DB operation: ${name}`);
    }])),
  };
  // These two writes are expected only after a valid OAuth callback.
  for (const name of ["linkDiscord", "updateLastLogin"]) {
    imports["@/lib/db/users"][name] = async (...args) => {
      dbCalls.push({ name, args });
    };
  }
  let config;
  const { outputText } = ts.transpileModule(
    readFileSync(new URL("../config.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  );
  runInNewContext(outputText, {
    exports: {},
    process: { env: {
      STARGATE_DISCORD_CLIENT_ID: "123456789012345679",
      STARGATE_DISCORD_CLIENT_SECRET: "synthetic-discord-client-secret",
    } },
    require: (name) => {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  config.basePath = "/api/auth";
  config.logger = { error: (error) => errors.push(error), warn() {}, debug() {} };
  const discord = config.providers.find((provider) => provider.id === "discord");
  discord[customFetch] = async (input, init) => {
    const url = String(input);
    fetchCalls.push(url);
    if (url === "https://discord.com/api/oauth2/token") {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("code"), "synthetic-authorization-code");
      assert.equal(body.get("redirect_uri"), `${origin}/api/auth/callback/discord`);
      const verifier = body.get("code_verifier");
      assert.ok(verifier, "the callback must send its PKCE verifier");
      assert.equal(
        createHash("sha256").update(verifier).digest("base64url"),
        authorizationUrl.searchParams.get("code_challenge"),
      );
      return Response.json({ access_token: "synthetic-access-token", token_type: "Bearer" });
    }
    if (url === "https://discord.com/api/users/@me") {
      return Response.json({
        id: user.discordId, username: "synthetic-discord-user", global_name: "Discord Test",
        avatar: null, discriminator: "0", email: null,
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };
  let authorizationUrl;

  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("cookie", [...cookies].map(([name, value]) => `${name}=${value}`).join("; "));
    const response = await Auth(new Request(`${origin}/api/auth/${path}`, { ...options, headers }), config);
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return response;
  }

  return {
    dbCalls, fetchCalls, errors, cookies, request,
    async begin() {
      const csrf = await (await request("csrf")).json();
      const response = await request("signin/discord", {
        method: "POST",
        body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: `${origin}/erp` }),
      });
      assert.equal(response.status, 302);
      authorizationUrl = new URL(response.headers.get("location"));
      assert.equal(authorizationUrl.origin, "https://discord.com");
      assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");
      assert.ok(authorizationUrl.searchParams.get("code_challenge"));
    },
    callback(issuer) {
      const params = new URLSearchParams({ code: "synthetic-authorization-code" });
      if (issuer !== undefined) params.set("iss", issuer);
      return request(`callback/discord?${params}`);
    },
  };
}

for (const issuer of ["https://discord.com", undefined]) {
  test(`Discord callback ${issuer === undefined ? "without iss" : "with Discord iss"} completes PKCE and creates a session`, async () => {
    const harness = createHarness();
    await harness.begin();
    const response = await harness.callback(issuer);
    assert.equal(response.headers.get("location"), `${origin}/erp`);
    assert.deepEqual(harness.fetchCalls, [
      "https://discord.com/api/oauth2/token", "https://discord.com/api/users/@me",
    ]);
    assert.deepEqual(harness.dbCalls.map(({ name }) => name), [
      "findUserByDiscordId", "linkDiscord", "updateLastLogin",
    ]);
    assert.ok([...harness.cookies.keys()].some((name) => name.includes("session-token")));
    const sessionResponse = await harness.request("session");
    assert.equal(sessionResponse.status, 200);
    const session = await sessionResponse.json();
    assert.equal(session.user.id, user._id);
    assert.equal(session.user.username, user.username);
    assert.equal(session.user.role, user.role);
    assert.equal(session.user.discordId, user.discordId);
    assert.equal(session.user.isGuest, false);
    assert.equal(harness.dbCalls.at(-1).name, "findUserById");
    assert.equal(harness.errors.length, 0);
  });
}

test("Discord callback rejects an unexpected issuer before token exchange or DB access", async () => {
  const harness = createHarness();
  await harness.begin();
  const response = await harness.callback("https://unexpected-issuer.example");
  assert.equal(new URL(response.headers.get("location")).searchParams.get("error"), "Configuration");
  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.dbCalls.length, 0);
  assert.equal([...harness.cookies.keys()].some((name) => name.includes("session-token")), false);
  assert.equal(harness.errors[0]?.type, "CallbackRouteError");
  assert.match(harness.errors[0]?.cause?.err?.message ?? "", /unexpected "iss"/);
});

test("Discord callback still requires the PKCE cookie", async () => {
  const harness = createHarness();
  await harness.begin();
  for (const name of harness.cookies.keys()) {
    if (name.includes("pkce")) harness.cookies.delete(name);
  }
  const response = await harness.callback("https://discord.com");
  assert.ok(new URL(response.headers.get("location")).searchParams.has("error"));
  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.dbCalls.length, 0);
  assert.equal([...harness.cookies.keys()].some((name) => name.includes("session-token")), false);
});
