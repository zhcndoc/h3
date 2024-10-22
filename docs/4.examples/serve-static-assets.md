# 提供静态资产

> 提供静态资产，例如 HTML、图像、CSS、JavaScript 等等。

h3 可以提供静态资产，例如 HTML、图像、CSS、JavaScript 等等。

> [!NOTE]
> 如果你使用 [`unjs/listhen`](https://listhen.unjs.io)，你只需在项目根目录中创建一个 `public` 目录，并将你的静态资产放在其中。它们将会自动提供。

## 使用方法

要提供静态目录，你可以使用 `serveStatic` 工具。

```ts
import { createApp, serveStatic } from "h3";

export const app = createApp();

app.use((event) => {
  return serveStatic(event, {
    getContents: (id) => {
      return undefined;
    },
    getMeta: (id) => {
      return undefined;
    },
  });
});
```

这段代码还未提供任何文件。你需要实现 `getContents` 和 `getMeta` 方法。

- `getContents` 用于读取文件内容。它应该返回一个 `Promise`，解析为文件的内容，如果文件不存在则返回 `undefined`。
- `getMeta` 用于获取文件的元数据。它应该返回一个 `Promise`，解析为文件的元数据，如果文件不存在则返回 `undefined`。

这两个方法是分开的，以允许 h3 在不读取文件内容的情况下响应 `HEAD` 请求，并使用 `Last-Modified` 头。

## 读取文件

现在，在 `public` 目录中创建一个简单消息的 `index.html` 文件，并在浏览器中打开 http://localhost:3000。你应该能看到该消息。

> [!NOTE]
> 使用 `public` 是一种约定，但你可以使用任何你想要的目录名称。

> [!NOTE]
> 如果你正在使用 [`unjs/listhen`](https://listhen.unjs.io) 并想尝试此示例，请创建一个与 `public` 不同名称的目录，因为它是 `listhen` 使用的默认目录。

然后，我们可以创建 `getContents` 和 `getMeta` 方法：

```ts
import { createApp, serveStatic } from "h3";
import { stat, readFile } from "node:fs/promises";
import { join } from "pathe";

export const app = createApp();

const publicDir = "assets";

app.use((event) => {
  return serveStatic(event, {
    getContents: (id) => readFile(join(publicDir, id)),
    getMeta: async (id) => {
      const stats = await stat(join(publicDir, id)).catch(() => {});

      if (!stats || !stats.isFile()) {
        return;
      }

      return {
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    },
  });
});
```

`getContents` 读取文件并返回其内容，非常简单。`getMeta` 使用 `fs.stat` 来获取文件元数据。如果文件不存在或不是一个文件，它会返回 `undefined`。否则，它将返回文件大小和最后修改时间。

文件大小和最后修改时间用于生成 etag，以便在文件自上次请求以来未被修改时发送 `304 Not Modified` 响应。这对于避免如果文件没有更改而多次发送相同的文件非常有用。

## 解析资产

如果路径不匹配文件，h3 将尝试在路径后添加 `index.html` 并再次尝试。如果仍然不匹配，它将返回 404 错误。

你可以通过将 `indexNames` 选项传递给 `serveStatic` 来改变这种行为：

```ts
import { createApp, serveStatic } from "h3";

const app = createApp();

app.use(
  serveStatic({
    indexNames: ["/app.html", "/index.html"],
  }),
);
```

使用此选项，h3 将首先尝试匹配 `<path>/app.html`，然后是 `<path>/index.html`，最后返回 404 错误。

> [!IMPORTANT]
> 不要忘记 `/` 在开头，h3 会将路径与索引名称连接起来。例如，`/index.html` 将与 `/hello` 连接，形成 `hello/index.html`。
