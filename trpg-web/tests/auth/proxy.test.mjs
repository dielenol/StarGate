import assert from "node:assert/strict";
import { test } from "node:test";

import { NextRequest } from "next/server";

import { SESSION_COOKIE_NAMES } from "../../lib/auth/cookies.ts";
import { proxy } from "../../proxy.ts";

const ORIGIN = "http://localhost:3001";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

test(
  "개발 환경 proxy는 같은 localhost의 StarGateV2 세션 쿠키만 있으면 /login으로 보낸다",
  { skip: IS_PRODUCTION },
  () => {
    const request = new NextRequest(`${ORIGIN}/calendar`, {
      headers: { cookie: "authjs.session-token=stargate-v2-session" },
    });

    const response = proxy(request);

    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location")).pathname, "/login");
  },
);

for (const name of SESSION_COOKIE_NAMES) {
  test(`proxy는 현재 환경의 세션 쿠키(${name})가 있으면 통과시킨다`, () => {
    const request = new NextRequest(`${ORIGIN}/calendar`, {
      headers: { cookie: `${name}=token` },
    });

    const response = proxy(request);

    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
  });
}
