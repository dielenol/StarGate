export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
    this.name = "RequestBodyTooLargeError";
  }
}

export class RequestBodyAbortedError extends Error {
  constructor() {
    super("Request body reading was aborted.");
    this.name = "RequestBodyAbortedError";
  }
}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ rawBody: string; requestReceivedAt: Date }> {
  const reader = request.body?.getReader();
  if (!reader) {
    return { rawBody: "", requestReceivedAt: new Date() };
  }

  let byteLength = 0;
  let rawBody = "";
  const decoder = new TextDecoder();
  const cancelReader = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancelReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new RequestBodyAbortedError();
      }

      const { done, value } = await reader.read();
      if (signal?.aborted) {
        throw new RequestBodyAbortedError();
      }
      if (done) break;

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      rawBody += decoder.decode(value, { stream: true });
    }

    rawBody += decoder.decode();
    return { rawBody, requestReceivedAt: new Date() };
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }
}
