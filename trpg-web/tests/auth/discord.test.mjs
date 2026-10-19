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
const { encode } = await import(
  pathToFileURL(nextAuthRequire.resolve("@auth/core/jwt")).href
);

const ORIGIN = "https://calendar.example.test";
// ORIGIN이 https라 운영 Auth.js 기본 세션 쿠키 이름에 __Secure- 접두가 붙는다.
const SESSION_COOKIE_NAME = "__Secure-authjs.session-token";
const SECRET = "isolated-test-secret-with-at-least-32-characters";
const DISCORD_ID = "123456789012345678";
const EXEMPT_DISCORD_ID = "376610453696020482";
const NOW = Date.parse("2026-10-19T00:00:00Z");
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

// lib/auth/cookies.ts는 모듈 로드 시점의 NODE_ENV로 쿠키 이름을 정한다.
// 운영 설정(Auth.js 기본 쿠키 이름)을 검증하도록 config import 전에 production으로 고정한다.
process.env.NODE_ENV = "production";
const { MEMBERSHIP_RECHECK_INTERVAL_MS } = await import("../../lib/auth/config.ts");
const { SESSION_COOKIE_NAMES } = await import("../../lib/auth/cookies.ts");

function fixture(t, member = { discordUserId: DISCORD_ID }, identity = { id: DISCORD_ID }) {
  const cookies = new Map();
  const errors = [];
  const exchanges = [];
  const memberLookups = [];
  let lookupError = null;
  lookupMember = async (...args) => {
    memberLookups.push(args);
    if (lookupError) throw lookupError;
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
      ...identity,
    });
  });
  const config = {
    ...productionConfig,
    basePath: "/api/auth",
    secret: SECRET,
    logger: { error: (error) => errors.push(error), warn() {}, debug() {} },
  };

  // applyCookies=false 는 Set-Cookie 를 버리는 서버 컴포넌트/라우트의 auth() 호출을 모사한다.
  async function request(path, init, { applyCookies = true } = {}) {
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
    if (!applyCookies) return response;
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

  async function start(referer) {
    const csrf = await (await request("csrf")).json();
    const response = await request("signin/discord", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(referer ? { referer } : {}),
      },
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

  async function callback(issuer = "https://discord.com", code = "test-authorization-code") {
    const params = new URLSearchParams({ code });
    if (issuer !== null) params.set("iss", issuer);
    return request(`callback/discord?${params}`);
  }

  const hasSession = () =>
    [...cookies.keys()].some((name) => name.includes("session-token"));

  const session = async (options) => (await request("session", undefined, options)).json();

  // 재검사 도입 전에 발급된 것처럼 임의 클레임의 세션 쿠키를 직접 심는다.
  async function seedSession(claims) {
    cookies.set(
      SESSION_COOKIE_NAME,
      await encode({ token: claims, secret: SECRET, salt: SESSION_COOKIE_NAME }),
    );
  }

  return {
    start, callback, request, session, seedSession, cookies, errors, exchanges, memberLookups,
    hasSession,
    setMember: (nextMember) => { member = nextMember; },
    setLookupError: (error) => { lookupError = error; },
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
    // proxy.ts가 운영 Auth.js가 발급한 세션 쿠키 이름을 인식해야 보호 경로가 열린다.
    assert.ok(
      SESSION_COOKIE_NAMES.some((name) => flow.cookies.has(name)),
      [...flow.cookies.keys()].join(", "),
    );
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

for (const id of [DISCORD_ID, EXEMPT_DISCORD_ID]) {
  test(`a different issuer is rejected before token exchange for ${id}`, async (t) => {
    const flow = fixture(t, null, { id });
    await flow.start();
    const response = await flow.callback("https://other.example.test");

    assert.equal(response.headers.get("location"), `${ORIGIN}/login?error=Configuration`);
    assert.match(flow.errors[0]?.cause?.err?.message, /unexpected "iss"/);
    assert.equal(flow.exchanges.length, 0);
    assert.deepEqual(flow.memberLookups, []);
    assert.equal(flow.hasSession(), false);
  });

  test(`a missing PKCE cookie is rejected before token exchange for ${id}`, async (t) => {
    const flow = fixture(t, null, { id });
    await flow.start();
    for (const name of flow.cookies.keys()) {
      if (name.includes("pkce")) flow.cookies.delete(name);
    }
    const response = await flow.callback();

    assert.equal(response.headers.get("location"), `${ORIGIN}/login?error=Configuration`);
    assert.equal(flow.errors[0]?.type, "InvalidCheck");
    assert.match(flow.errors[0]?.message, /pkceCodeVerifier value could not be parsed/);
    assert.equal(flow.exchanges.length, 0);
    assert.deepEqual(flow.memberLookups, []);
    assert.equal(flow.hasSession(), false);
  });
}

for (const [label, member] of [
  ["unknown", null],
  ["departed", { discordUserId: DISCORD_ID, leftAt: new Date("2026-01-01") }],
]) {
  test(`${label} guild member sharing the exempt account's name is denied a session`, async (t) => {
    const flow = fixture(t, member, {
      id: DISCORD_ID,
      username: "dielenol",
      global_name: "dielenol",
    });
    await flow.start();
    const response = await flow.callback();

    assert.equal(response.headers.get("location"), `${ORIGIN}/login?error=AccessDenied`);
    assert.deepEqual(flow.memberLookups, [["test-guild", DISCORD_ID]]);
    assert.equal(flow.exchanges.length, 1);
    assert.equal(flow.hasSession(), false);
    assert.equal(await (await flow.request("session")).json(), null);
  });
}

for (const [label, member] of [
  ["missing", null],
  ["departed", { discordUserId: EXEMPT_DISCORD_ID, leftAt: new Date("2026-01-01") }],
]) {
  test(`the sole exempt Discord ID receives a session with a ${label} membership record`, async (t) => {
    const flow = fixture(t, member, { id: EXEMPT_DISCORD_ID, username: "renamed-account" });
    await flow.start();
    const response = await flow.callback();

    assert.equal(response.headers.get("location"), `${ORIGIN}/calendar`);
    assert.deepEqual(flow.memberLookups, []);
    assert.equal(flow.exchanges.length, 1);
    assert.equal(flow.hasSession(), true);
    const session = await (await flow.request("session")).json();
    assert.equal(session.user.discordUserId, EXEMPT_DISCORD_ID);
    assert.deepEqual(flow.errors, []);
  });
}

test("the membership exemption cannot authorize a non-Discord or absent account", async (t) => {
  const flow = fixture(t, null);
  assert.equal(await productionConfig.callbacks.signIn({
    account: { provider: "github", providerAccountId: EXEMPT_DISCORD_ID },
  }), false);
  assert.equal(await productionConfig.callbacks.signIn({ account: null }), false);
  assert.deepEqual(flow.memberLookups, []);
});

test("a denied login returns to the app login page and a fresh attempt can succeed", async (t) => {
  const flow = fixture(t, null);
  const firstAuthorization = await flow.start();
  const denied = await flow.callback();
  const retryPage = denied.headers.get("location");

  assert.equal(retryPage, `${ORIGIN}/login?error=AccessDenied`);
  assert.equal(flow.hasSession(), false);
  assert.equal(await (await flow.request("session")).json(), null);

  flow.setMember({ discordUserId: DISCORD_ID });
  const retryAuthorization = await flow.start(retryPage);
  assert.equal(retryAuthorization.pathname, "/api/oauth2/authorize");
  assert.notEqual(
    retryAuthorization.searchParams.get("code_challenge"),
    firstAuthorization.searchParams.get("code_challenge"),
  );
  assert.equal(flow.hasSession(), false);

  const accepted = await flow.callback("https://discord.com", "retry-authorization-code");
  assert.equal(accepted.headers.get("location"), `${ORIGIN}/calendar`);
  assert.equal(flow.hasSession(), true);
  assert.deepEqual(flow.memberLookups, [
    ["test-guild", DISCORD_ID],
    ["test-guild", DISCORD_ID],
  ]);
  assert.equal(flow.exchanges.length, 2);
  assert.equal(flow.exchanges[1].get("code"), "retry-authorization-code");
  const session = await (await flow.request("session")).json();
  assert.equal(session.user.discordUserId, DISCORD_ID);
});

// 로그인 뒤 재검사: 시각은 MockTimers(Date)로 고정하고 tick 으로 넘긴다.
const INTERVAL = MEMBERSHIP_RECHECK_INTERVAL_MS;

async function login(t, flow) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  await flow.start();
  const response = await flow.callback();
  assert.equal(response.headers.get("location"), `${ORIGIN}/calendar`);
  assert.equal(flow.hasSession(), true);
}

test("an active member is rechecked once per interval and the result is stored in the cookie", async (t) => {
  const flow = fixture(t);
  await login(t, flow);
  assert.equal(flow.memberLookups.length, 1);

  t.mock.timers.tick(INTERVAL - 1);
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 1);

  t.mock.timers.tick(1);
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 2);
  assert.equal(flow.hasSession(), true);

  t.mock.timers.tick(INTERVAL - 1);
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 2);
  assert.deepEqual(flow.errors, []);
});

for (const [label, member] of [
  ["left", { discordUserId: DISCORD_ID, leftAt: new Date("2026-01-01") }],
  ["lost their record", null],
]) {
  test(`a member who ${label} after login is signed out once the interval passes`, async (t) => {
    const flow = fixture(t);
    await login(t, flow);
    flow.setMember(member);

    t.mock.timers.tick(INTERVAL - 1);
    assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
    assert.equal(flow.memberLookups.length, 1);

    t.mock.timers.tick(1);
    assert.equal(await flow.session(), null);
    assert.equal(flow.memberLookups.length, 2);
    assert.equal(flow.hasSession(), false);
    assert.equal(await flow.session(), null);
    assert.equal(flow.memberLookups.length, 2);
    assert.deepEqual(flow.errors, []);
  });
}

test("server-side auth() reads deny a departed member after the interval", async (t) => {
  const flow = fixture(t);
  await login(t, flow);
  flow.setMember({ discordUserId: DISCORD_ID, leftAt: new Date("2026-01-01") });

  t.mock.timers.tick(INTERVAL);
  assert.equal(await flow.session({ applyCookies: false }), null);
  assert.equal(flow.memberLookups.length, 2);
});

test("server-side auth() reads repeat the recheck until a session fetch refreshes the cookie", async (t) => {
  const flow = fixture(t);
  await login(t, flow);

  t.mock.timers.tick(INTERVAL);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(
      (await flow.session({ applyCookies: false })).user.discordUserId,
      DISCORD_ID,
    );
  }
  assert.equal(flow.memberLookups.length, 4);

  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 5);

  assert.equal(
    (await flow.session({ applyCookies: false })).user.discordUserId,
    DISCORD_ID,
  );
  assert.equal(flow.memberLookups.length, 5);
  assert.deepEqual(flow.errors, []);
});

test("the exempt Discord ID is never rechecked against the database", async (t) => {
  const flow = fixture(t, null, { id: EXEMPT_DISCORD_ID });
  await login(t, flow);

  t.mock.timers.tick(24 * INTERVAL);
  assert.equal((await flow.session()).user.discordUserId, EXEMPT_DISCORD_ID);
  assert.equal(flow.hasSession(), true);
  assert.deepEqual(flow.memberLookups, []);
  assert.deepEqual(flow.errors, []);
});

test("a token issued before rechecks is verified on its next read and then stamped", async (t) => {
  const flow = fixture(t);
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  await flow.seedSession({ sub: DISCORD_ID, name: "test-member", discordUserId: DISCORD_ID });

  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.deepEqual(flow.memberLookups, [["test-guild", DISCORD_ID]]);
  assert.equal(flow.hasSession(), true);

  t.mock.timers.tick(INTERVAL - 1);
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 1);
  assert.deepEqual(flow.errors, []);
});

test("a token issued before rechecks is rejected on its next read when the member has left", async (t) => {
  const flow = fixture(t, { discordUserId: DISCORD_ID, leftAt: new Date("2026-01-01") });
  await flow.seedSession({ sub: DISCORD_ID, name: "test-member", discordUserId: DISCORD_ID });

  assert.equal(await flow.session(), null);
  assert.deepEqual(flow.memberLookups, [["test-guild", DISCORD_ID]]);
  assert.equal(flow.hasSession(), false);
  assert.deepEqual(flow.errors, []);
});

test("a token without a Discord ID is rejected without a lookup", async (t) => {
  const flow = fixture(t);
  await flow.seedSession({ sub: DISCORD_ID, name: "test-member" });

  assert.equal(await flow.session(), null);
  assert.deepEqual(flow.memberLookups, []);
  assert.equal(flow.hasSession(), false);
  assert.deepEqual(flow.errors, []);
});

test("a failed recheck keeps the session, logs once, and retries on the next read", async (t) => {
  const flow = fixture(t);
  await login(t, flow);
  const consoleError = t.mock.method(console, "error", () => {});

  t.mock.timers.tick(INTERVAL);
  flow.setLookupError(new Error("mongo unavailable"));
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 2);
  assert.equal(flow.hasSession(), true);
  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(consoleError.mock.calls[0].arguments[0], /^\[trpg-web\] 길드 멤버 재검사 실패/);
  assert.equal(consoleError.mock.calls[0].arguments[1].message, "mongo unavailable");
  assert.deepEqual(flow.errors, []);

  flow.setLookupError(null);
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 3);

  t.mock.timers.tick(INTERVAL - 1);
  assert.equal((await flow.session()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 3);
  assert.equal(consoleError.mock.callCount(), 1);
});

test("a client session update cannot rewrite claims or postpone the recheck", async (t) => {
  const flow = fixture(t);
  await login(t, flow);
  const { csrfToken } = await (await flow.request("csrf")).json();

  // POST /api/auth/session (useSession().update) 은 jwt 콜백에 trigger "update" 와 클라이언트 data 를 넘긴다.
  const updated = await flow.request("session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      csrfToken,
      data: { discordUserId: EXEMPT_DISCORD_ID, membershipCheckedAt: NOW + 365 * 24 * INTERVAL },
    }),
  });
  assert.equal((await updated.json()).user.discordUserId, DISCORD_ID);
  assert.equal(flow.memberLookups.length, 1);

  flow.setMember({ discordUserId: DISCORD_ID, leftAt: new Date("2026-01-01") });
  t.mock.timers.tick(INTERVAL);
  assert.equal(await flow.session(), null);
  assert.deepEqual(flow.memberLookups.at(-1), ["test-guild", DISCORD_ID]);
  assert.equal(flow.memberLookups.length, 2);
  assert.equal(flow.hasSession(), false);
  assert.deepEqual(flow.errors, []);
});
