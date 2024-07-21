import type { H3Event } from "../types";
import type { EventStreamOptions } from "../types/utils/sse";
import { EventStream } from "./internal/event-stream";

/**
 * Initialize an EventStream instance for creating [server sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
 *
 * @experimental This function is experimental and might be unstable in some environments.
 *
 * @example
 *
 * ```ts
 * import { createEventStream, sendEventStream } from "h3";
 *
 * app.use("/sse", (event) => {
 *   const eventStream = createEventStream(event);
 *
 *   // Send a message every second
 *   const interval = setInterval(async () => {
 *     await eventStream.push("Hello world");
 *   }, 1000);
 *
 *   // cleanup the interval and close the stream when the connection is terminated
 *   eventStream.onClosed(async () => {
 *     console.log("closing SSE...");
 *     clearInterval(interval);
 *     await eventStream.close();
 *   });
 *
 *   return eventStream.send();
 * });
 * ```
 */
export function createEventStream(
  event: H3Event,
  opts?: EventStreamOptions,
): EventStream {
  return new EventStream(event, opts);
}
