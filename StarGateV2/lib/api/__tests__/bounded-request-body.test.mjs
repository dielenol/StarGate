import assert from "node:assert/strict";
import test from "node:test";

import {
  readBoundedRequestBody,
  RequestBodyAbortedError,
  RequestBodyTooLargeError,
} from "../bounded-request-body.ts";

function streamedRequest(chunks, onCancel) {
  const stream = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunk));
    },
    cancel(reason) {
      onCancel?.(reason);
    },
  });
  return new Request("http://localhost/license-test", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
}

test("bounded request reader records a complete UTF-8 body receipt", async () => {
  const before = Date.now();
  const receipt = await readBoundedRequestBody(
    streamedRequest(["공진", "-pulse"]),
    32,
  );

  assert.equal(receipt.rawBody, "공진-pulse");
  assert.ok(receipt.requestReceivedAt.getTime() >= before);
});

test("bounded request reader cancels as soon as streamed bytes exceed the limit", async () => {
  let cancelled = false;
  const request = streamedRequest(["1234", "5678"], () => {
    cancelled = true;
  });

  await assert.rejects(
    readBoundedRequestBody(request, 7),
    RequestBodyTooLargeError,
  );
  assert.equal(cancelled, true);
});

test("bounded request reader cancels an in-flight body when auth aborts", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("http://localhost/license-test", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  const abortController = new AbortController();
  const reading = readBoundedRequestBody(request, 32, abortController.signal);

  abortController.abort();

  await assert.rejects(reading, RequestBodyAbortedError);
  assert.equal(cancelled, true);
});
