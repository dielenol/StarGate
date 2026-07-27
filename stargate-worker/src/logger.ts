export interface WorkerLogger {
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
  error(event: string, error: unknown, details?: Record<string, unknown>): void;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return { errorMessage: String(error) };
}

function write(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
): void {
  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "stargate-worker",
    level,
    event,
    ...details,
  });
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

export const logger: WorkerLogger = {
  info(event, details) {
    write("info", event, details);
  },
  warn(event, details) {
    write("warn", event, details);
  },
  error(event, error, details) {
    write("error", event, { ...details, ...serializeError(error) });
  },
};
