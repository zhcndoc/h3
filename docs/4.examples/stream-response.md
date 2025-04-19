<<<<<<< HEAD
# 流响应
=======
---
icon: ph:arrow-right
---

# Stream Response
>>>>>>> origin/upstream

> 向客户端发送流响应。

<<<<<<< HEAD
流式传输是 h3 的一个强大功能。它允许您在获取数据的第一时间就将其发送给客户端。这对于大型文件或长时间运行的任务非常有用。

> [!WARNING]
> 流式传输是复杂的，如果您不需要它，可能会变成负担。
=======
Using stream responses It allows you to send data to the client as soon as you have it. This is useful for large files or long running responses.
>>>>>>> origin/upstream

## 创建流

要流式发送响应，首先需要使用 [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) API 创建一个流：

```ts
const stream = new ReadableStream();
```

在这个示例中，我们将创建一个启动函数，每 100 毫秒发送一个随机数。在 1000 毫秒后，它将关闭流：

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

## 发送流

```ts
import { H3, setResponseHeader } from "h3";

export const app = new H3();

app.use((event) => {
  // 设置响应头告知客户端我们正在发送一个流。
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

打开您的浏览器访问 http://localhost:3000，您应该会看到每 100 毫秒出现一个随机数字的列表。

神奇！ 🎉
