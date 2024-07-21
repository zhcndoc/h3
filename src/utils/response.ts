import type { H3Event, StatusCode } from "../types";
import { sanitizeStatusCode } from "./sanitize";
import {
  serializeIterableValue,
  coerceIterable,
  IterationSource,
  IteratorSerializer,
} from "./internal/iterable";

/**
 * Respond with an empty payload.<br>
 *
 * @example
 * app.use("/", () => noContent());
 *
 * @param event H3 event
 * @param code status code to be send. By default, it is `204 No Content`.
 */
export function noContent(event: H3Event, code?: StatusCode): "" {
  const currentStatus = event.response.status;

  if (!code && currentStatus && currentStatus !== 200) {
    code = event.response.status;
  }

  event.response.status = sanitizeStatusCode(code, 204);

  // 204 responses MUST NOT have a Content-Length header field
  // https://www.rfc-editor.org/rfc/rfc7230#section-3.3.2
  if (event.response.status === 204) {
    event.response.headers.delete("content-length");
  }

  return "";
}

/**
 * Send a redirect response to the client.
 *
 * It adds the `location` header to the response and sets the status code to 302 by default.
 *
 * In the body, it sends a simple HTML page with a meta refresh tag to redirect the client in case the headers are ignored.
 *
 * @example
 * app.use("/", (event) => {
 *   return redirect(event, "https://example.com");
 * });
 *
 * @example
 * app.use("/", (event) => {
 *   return redirect(event, "https://example.com", 301); // Permanent redirect
 * });
 */
export function redirect(
  event: H3Event,
  location: string,
  code: StatusCode = 302,
) {
  event.response.status = sanitizeStatusCode(code, event.response.status);
  event.response.headers.set("location", location);
  const encodedLoc = location.replace(/"/g, "%22");
  const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=${encodedLoc}"></head></html>`;
  if (!event.response.headers.has("content-type")) {
    event.response.headers.set("content-type", "text/html");
  }
  return html;
}

/**
 * Write `HTTP/1.1 103 Early Hints` to the client.
 */
export function writeEarlyHints(
  event: H3Event,
  hints: Record<string, string>,
): void | Promise<void> {
  if (!event.node?.res?.writeEarlyHints) {
    return;
  }
  return new Promise((resolve) => {
    event.node?.res.writeEarlyHints(hints, () => resolve());
  });
}

/**
 * Iterate a source of chunks and send back each chunk in order.
 * Supports mixing async work together with emitting chunks.
 *
 * Each chunk must be a string or a buffer.
 *
 * For generator (yielding) functions, the returned value is treated the same as yielded values.
 *
 * @param event - H3 event
 * @param iterable - Iterator that produces chunks of the response.
 * @param serializer - Function that converts values from the iterable into stream-compatible values.
 * @template Value - Test
 *
 * @example
 * return iterable(event, async function* work() {
 *   // Open document body
 *   yield "<!DOCTYPE html>\n<html><body><h1>Executing...</h1><ol>\n";
 *   // Do work ...
 *   for (let i = 0; i < 1000) {
 *     await delay(1000);
 *     // Report progress
 *     yield `<li>Completed job #`;
 *     yield i;
 *     yield `</li>\n`;
 *   }
 *   // Close out the report
 *   return `</ol></body></html>`;
 * })
 * async function delay(ms) {
 *   return new Promise(resolve => setTimeout(resolve, ms));
 * }
 */
export function iterable<Value = unknown, Return = unknown>(
  _event: H3Event,
  iterable: IterationSource<Value, Return>,
  options?: {
    serializer: IteratorSerializer<Value | Return>;
  },
): ReadableStream {
  const serializer = options?.serializer ?? serializeIterableValue;
  const iterator = coerceIterable(iterable);
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (value !== undefined) {
        const chunk = serializer(value);
        if (chunk !== undefined) {
          controller.enqueue(chunk);
        }
      }
      if (done) {
        controller.close();
      }
    },
    cancel() {
      iterator.return?.();
    },
  });
}
