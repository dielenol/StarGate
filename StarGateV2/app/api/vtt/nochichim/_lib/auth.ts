import { NextResponse } from "next/server";

/**
 * VTT sync endpoints are server-to-server only.
 *
 * The browser must never receive this secret; Nochi calls these routes from its
 * Express server and passes the value through an Authorization bearer token.
 */
export function requireNochichimSyncAuth(request: Request): NextResponse | null {
  const configuredSecret =
    process.env.NOCHICHIM_SYNC_SECRET ?? process.env.STARGATE_VTT_SYNC_SECRET;

  if (!configuredSecret) {
    return NextResponse.json(
      { error: "NOCHICHIM_SYNC_SECRET is not configured" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerSecret = request.headers.get("x-nochichim-sync-secret")?.trim();
  const providedSecret = bearer || headerSecret || "";

  if (providedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

