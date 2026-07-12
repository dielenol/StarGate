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
