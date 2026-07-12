import "server-only";

import { headers } from "next/headers";

export async function hasLocalErpPreviewAccess(): Promise<boolean> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-stargate-erp-local-access") === "1";
}
