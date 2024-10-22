---
icon: simple-icons:bun
---

# Bun

> 使用 Bun 运行你的 h3 应用

为了在 [Bun](https://bun.sh/) 中运行 h3 应用，请使用 [Web Adapter](/adapters/web)。

> [!NOTE]
> 另外，你也可以使用 [Node.js adapter](/adapters/node)，因为 Bun 与 Node.js API 完全兼容！

## 用法

创建应用入口：

```js [app.mjs]
import { createApp } from "h3";

export const app = createApp();

app.use(() => "Hello world!");
```

创建 Bun 服务器入口：

```js [server.mjs]
import { toWebHandler } from "h3";
import { app } from "./app.mjs";

const server = Bun.serve({
  port: 3000,
  fetch: toWebHandler(app),
});
```

现在，你可以运行 Bun 服务器：

```bash
bun --bun ./server.mjs
```

## WebSocket 支持

:read-more{to="https://crossws.unjs.io/adapters/bun"}

```ts
import wsAdapter from "crossws/adapters/bun";

const { websocket, handleUpgrade } = wsAdapter(app.websocket);

const handler = toWebHandler(app);

const server = Bun.serve({
  port: 3000,
  websocket,
  fetch(req, server) {
    if (await handleUpgrade(req, server)) {
      return;
    }
    return handler(req);
  },
});
```
