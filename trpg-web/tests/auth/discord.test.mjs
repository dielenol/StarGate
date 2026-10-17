import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";

// Exercise the core version NextAuth actually uses, which may differ from our direct dependency.
const require = createRequire(import.meta.url);
const nextAuthRequire = createRequire(require.resolve("next-auth"));
const { Auth } = await import(
  pathToFileURL(nextAuthRequire.resolve("@auth/core")).href
);

const ORIGIN = "https://calendar.example.test";
const DISCORD_ID = "123456789012345678";
let productionConfig;
let lookupMember;

// Capture the deployed options without loading Next.js, real credentials, or MongoDB.
mock.module("next-auth", {
  defaultExport: (config) => {
    productionConfig = config;
    return {};
  },
});
mock.module("@/lib/db/init", { namedExports: {} });
mock.module("@stargate/shared-db", {
  namedExports: {
    findTrpgGuildMember: (...args) => lookupMember(...args),
  },
});
mock.module("@/lib/env", {
  namedExports: {
    DISCORD_CLIENT_ID: "test-discord-client",
    DISCORD_CLIENT_SECRET: "test-discord-secret",
    TRPG_GUILD_ID: "test-guild",
  },
});

await import("../../lib/auth/config.ts");

function fixture(t, member = { discordUserId: DISCORD_ID }) {
  const cookies = new Map();
  const errors = [];
  const exchanges = [];
  const memberLookups = [];
  lookupMember = async (...args) => {
    memberLookups.push(args);
    return member;
  };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url) === "https://discord.com/api/oauth2/token") {
      exchanges.push(new URLSearchParams(options.body));
      return Response.json({
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "identify",
      });
    }
    assert.equal(String(url), "https://discord.com/api/users/@me");
    assert.equal(
      new Headers(options.headers).get("authorization"),
      "Bearer test-access-token",
    );
    return Response.json({
      id: DISCORD_ID,
      username: "test-member",
      discriminator: "0",
      avatar: null,
    });
  });
  const config = {
    ...productionConfig,
    basePath: "/api/auth",
    secret: "isolated-test-secret-with-at-least-32-characters",
    logger: { error: (error) => errors.push(error), warn() {}, debug() {} },
  };

  async function request(path, init) {
    const response = await Auth(
      new Request(`${ORIGIN}/api/auth/${path}`, {
        ...init,
        headers: {
          cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          ...init?.headers,
        },
      }),
      config,
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.slice(0, cookie.indexOf(";"));
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) cookies.set(name, value);
      else cookies.delete(name);
    }
    return response;
  }

  async function start() {
    const csrf = await (await request("csrf")).json();
    const response = await request("signin/discord", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken: csrf.csrfToken,
        callbackUrl: `${ORIGIN}/calendar`,
      }),
    });
    const authorization = new URL(response.headers.get("location"));
    assert.equal(authorization.origin, "https://discord.com");
    assert.equal(authorization.searchParams.get("scope"), "identify");
    assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorization.searchParams.get("code_challenge"));
    return authorization;
  }

  async function callback(issuer = "https://discord.com") {
    const params = new URLSearchParams({ code: "test-authorization-code" });
    if (issuer !== null) params.set("iss", issuer);
    return request(`callback/discord?${params}`);
  }

  const hasSession = () =>
    [...cookies.keys()].some((name) => name.includes("session-token"));

  return {
    start, callback, request, cookies, errors, exchanges, memberLookups, hasSession,
  };
}

for (const issuer of ["https://discord.com", null]) {
  test(`active guild member receives a session ${issuer ? "with Discord iss" : "without iss"}`, async (t) => {
    const flow = fixture(t);
    const authorization = await flow.start();
    const response = await flow.callback(issuer);

    assert.equal(
      response.headers.get("location"),
      `${ORIGIN}/calendar`,
      flow.errors.map((error) => error.cause?.err?.message ?? error.message).join("\n"),
    );
    assert.equal(flow.hasSession(), true);
    assert.deepEqual(flow.memberLookups, [["test-guild", DISCORD_ID]]);
    assert.equal(flow.exchanges.length, 1);
    assert.equal(flow.exchanges[0].get("code"), "test-authorization-code");
    const verifier = flow.exchanges[0].get("code_verifier");
    assert.ok(verifier);
    const challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url");
    assert.equal(challenge, authorization.searchParams.get("code_challenge"));
    const session = await (await flow.request("session")).json();
    assert.equal(session.user.discordUserId, DISCORD_ID);
    assert.deepEqual(flow.errors, []);
  });
}

test("a different issuer is rejected before token exchange", async (t) => {
  const flow = fixture(t);
  await flow.start();
  const response = await flow.callback("https://other.example.test");

  assert.match(response.headers.get("location"), /error=Configuration/);
  assert.match(flow.errors[0]?.cause?.err?.message, /unexpected "iss"/);
  assert.equal(flow.exchanges.length, 0);
  assert.deepEqual(flow.memberLookups, []);
  assert.equal(flow.hasSession(), false);
});

test("a missing PKCE cookie is rejected before token exchange", async (t) => {
  const flow = fixture(t);
  await flow.start();
  for (const name of flow.cookies.keys()) {
    if (name.includes("pkce")) flow.cookies.delete(name);
  }
  const response = await flow.callback();

  assert.match(response.headers.get("location"), /error=Configuration/);
  assert.equal(flow.errors[0]?.type, "InvalidCheck");
  assert.match(flow.errors[0]?.message, /pkceCodeVerifier value could not be parsed/);
  assert.equal(flow.exchanges.length, 0);
  assert.deepEqual(flow.memberLookups, []);
  assert.equal(flow.hasSession(), false);
});

for (const [label, member] of [
  ["unknown", null],
  ["departed", { discordUserId: DISCORD_ID, leftAt: new Date("2026-01-01") }],
]) {
  test(`${label} guild member is denied a session`, async (t) => {
    const flow = fixture(t, member);
    await flow.start();
    const response = await flow.callback();

    assert.match(response.headers.get("location"), /error=AccessDenied/);
    assert.deepEqual(flow.memberLookups, [["test-guild", DISCORD_ID]]);
    assert.equal(flow.exchanges.length, 1);
    assert.equal(flow.hasSession(), false);
    assert.equal(await (await flow.request("session")).json(), null);
  });
}
