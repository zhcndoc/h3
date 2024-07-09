# Stream Response

> Stream response to the client.

Streaming is a powerful feature of h3. It allows you to send data to the client as soon as you have it. This is useful for large files or long running tasks.

> [!WARNING]
> Steaming is complicated and can become an overhead if you don't need it.

## Create a Stream

To stream a response, you first need to create a stream using the [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) API:

```ts
const steam = new ReadableStream();
```

For the example, we will create a start function that will send a random number every 100 milliseconds. After 1000 milliseconds, it will close the stream:

```ts
let interval: NodeJS.Timeout;
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue("<ul>");

    interval = setInterval(() => {
      controller.enqueue("<li>" + Math.random() + "</li>");
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      controller.close();
    }, 1000);
  },
  cancel() {
    clearInterval(interval);
  },
});
```

## Send a Stream

```ts
import { createApp, setResponseHeader } from "h3";

export const app = createApp();

app.use((event) => {
  // Set to response header to tell to the client that we are sending a stream.
  setResponseHeader(event, "Content-Type", "text/html");
  setResponseHeader(event, "Cache-Control", "no-cache");
  setResponseHeader(event, "Transfer-Encoding", "chunked");

  let interval: NodeJS.Timeout;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("<ul>");

      interval = setInterval(() => {
        controller.enqueue("<li>" + Math.random() + "</li>");
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        controller.close();
      }, 1000);
    },
    cancel() {
      clearInterval(interval);
    },
  });

  return stream;
});
```

Open your browser to http://localhost:3000 and you should see a list of random numbers appearing every 100 milliseconds.

Magic! 🎉
