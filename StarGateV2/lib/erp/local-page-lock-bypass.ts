const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function shouldBypassPageLocks(args: {
  hostname: string;
  nodeEnv: string | undefined;
}): boolean {
  return (
    args.nodeEnv === "development" &&
    LOCAL_HOSTNAMES.has(args.hostname.toLowerCase())
  );
}

export function buildTrustedErpRequestHeaders(
  requestHeaders: Headers,
  args: {
    pathname: string;
    hostname: string;
    nodeEnv: string | undefined;
  },
): Headers {
  const trustedHeaders = new Headers(requestHeaders);
  trustedHeaders.set("x-stargate-erp-pathname", args.pathname);
  trustedHeaders.set(
    "x-stargate-erp-local-access",
    shouldBypassPageLocks(args) ? "1" : "0",
  );
  return trustedHeaders;
}
