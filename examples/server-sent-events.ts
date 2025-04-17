import { H3, createEventStream } from "h3";

export const app = new H3();

app.get("/", (event) => {
  const eventStream = createEventStream(event);

  // Send a message every second
  const interval = setInterval(async () => {
    await eventStream.push("Hello world");
  }, 1000);

  // cleanup the interval when the connection is terminated or the writer is closed
  eventStream.onClosed(() => {
    clearInterval(interval);
  });

  return eventStream.send();
});
