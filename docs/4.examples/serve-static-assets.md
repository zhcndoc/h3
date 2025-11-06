---
icon: ph:arrow-right
---

# 静态资源

> 提供静态资源服务，例如 HTML、图片、CSS、JavaScript 等。

H3 可以提供静态资源，例如 HTML、图片、CSS、JavaScript 等。

要提供一个静态目录，你可以使用 `serveStatic` 工具。

```ts
import { H3, serveStatic } from "h3";

const app = new H3();

app.use("/public/**", (event) => {
  return serveStatic(event, {
    getContents: (id) => {
      // TODO
    },
    getMeta: (id) => {
      // TODO
    },
  });
});
```

这段代码还未提供任何文件服务。你需要实现 `getContents` 和 `getMeta` 方法。

- `getContents` 用于读取文件内容。它应该返回一个 `Promise`，解析为文件内容，如果文件不存在则为 `undefined`。  
- `getMeta` 用于获取文件元信息。它应该返回一个 `Promise`，解析为文件的元数据，如果文件不存在则为 `undefined`。

它们被分开是为了让 H3 可以在不读取文件内容的情况下响应 `HEAD` 请求，并使用 `Last-Modified` 头部。

## 读取文件

现在，在 `public` 目录中创建一个包含简单消息的 `index.html` 文件，并在浏览器中打开 http://localhost:3000 。你应该可以看到该消息。

接下来，我们可以实现 `getContents` 和 `getMeta` 方法：

```ts
import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { H3, serve, serveStatic } from "h3";

const app = new H3();

app.use("/public/**", (event) => {
  return serveStatic(event, {
    indexNames: ["/index.html"],
    getContents: (id) => readFile(join("public", id)),
    getMeta: async (id) => {
      const stats = await stat(join("public", id)).catch(() => {});
      if (stats?.isFile()) {
        return {
          size: stats.size,
          mtime: stats.mtimeMs,
        };
      }
    },
  });
});

serve(app);
```

`getContents` 读取文件并返回其内容，非常简单。`getMeta` 使用 `fs.stat` 获取文件元数据。如果文件不存在或不是文件，返回 `undefined`。否则返回文件大小和最后修改时间。

文件大小和最后修改时间用于生成 etag，以便如果文件自上次请求以来没有被修改，则发送 `304 Not Modified` 响应。这对于避免发送未更改的文件非常有用。