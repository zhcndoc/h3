---
icon: teenyicons:deno-solid
---

# Deno

> 在 Deno Deploy 中运行你的 h3 应用

你可以使用 [Web Adapter](/adapters/web) 将你的 h3 应用直接托管到 [Deno Deploy](https://deno.com/deploy)。

## 使用方法

创建应用入口：

```js [app.mjs]
import { createApp } from "h3";

export const app = createApp();

app.use(() => "Hello world!");
```

为 Deno Deploy 创建入口：

```js [deno.mjs]
import { toWebHandler } from "h3";
import { app } from "./app.mjs";

Deno.serve(toWebHandler(app));
```

创建一个 `import_map.json`：

```json [import_map.json]
{
  "imports": {
    "h3": "https://esm.sh/h3@latest"
  }
}
```

最后，使用 `deno run` 进行本地预览：

```bash [terminal]
deno run --allow-net ./deno.mjs
```

要部署，请使用 `deployctl deploy`：

```bash [terminal]
deployctl deploy --prod --exclude=node_modules --import-map=./import_map.json ./deno.mjs
```

## WebSocket 支持

:read-more{to="https://crossws.unjs.io/adapters/deno"}

```ts
import wsAdapter from "crossws/adapters/deno";

const handler = toWebHandler(app);

const { handleUpgrade } = wsAdapter(app.websocket);

Deno.serve((request) => {
  if (request.headers.get("upgrade") === "websocket") {
    return handleUpgrade(request);
  }
  return handler(request);
});
```

---

::read-more
查看 [pi0/h3-on-edge](https://github.com/pi0/h3-on-edge) 演示，以获取完整的工作示例（[部署](https://h3-on-edge.deno.dev/)）。
::
