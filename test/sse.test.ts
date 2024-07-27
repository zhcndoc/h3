import { beforeEach } from "vitest";
import { createEventStream } from "../src";

import { describeMatrix } from "./_setup";

describeMatrix("sse", (t, { it, expect }) => {
  beforeEach(() => {
    t.app.get("/sse", (event) => {
      const includeMeta = event.query.get("includeMeta") === "true";
      const eventStream = createEventStream(event);
      let counter = 0;
      const clear = setInterval(() => {
        if (counter++ === 3) {
          clearInterval(clear);
          eventStream.close();
          return; // TODO: eventStream.push should auto disable after close!
        }
        if (includeMeta) {
          eventStream.push({
            id: String(counter),
            event: "custom-event",
            data: "hello world",
          });
        } else {
          eventStream.push("hello world");
        }
      });
      return eventStream.send();
    });
  });

  // TODO: Investigate issues with web target

  it.skipIf(t.target === "web")("streams events", async () => {
    const res = await t.fetch("/sse");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const messages = (await res.text()).split("\n\n").filter(Boolean);
    expect(messages.length).toBe(3);
  });

  it.skipIf(t.target === "web")("streams events", async () => {
    const res = await t.fetch("/sse?includeMeta=true");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const messages = (await res.text()).split("\n\n").filter(Boolean);
    expect(messages.length).toBe(3);
  });
});
