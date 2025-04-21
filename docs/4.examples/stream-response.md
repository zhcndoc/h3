---
icon: ph:arrow-right
---

# 流式响应

> 向客户端进行流式响应。

使用流式响应可以让你在获取数据后立即发送给客户端。这对于大文件或长时间运行的响应非常有用。

## 创建一个流

要进行流式响应，首先需要使用 [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) API 创建一个流：

```ts
const stream = new ReadableStream();
```

在示例中，我们将创建一个 start 函数，每 100 毫秒发送一个随机数。1000 毫秒后关闭流：

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
  // 设置响应头，告知客户端我们正在发送一个流。
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

打开浏览器访问 http://localhost:3000 ，你应该会看到每 100 毫秒出现一个随机数列表。

神奇！🎉