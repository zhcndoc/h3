---
icon: devicon-plain:cloudflareworkers
---

# Cloudflare

> 在 Cloudflare Workers 中运行你的 h3 应用

你可以直接将你的 h3 应用托管到 [Cloudflare Workers](https://workers.cloudflare.com/) 使用 [Web Adapter](/adapters/web)。

## 使用方法

创建应用入口：

```js [app.mjs]
import { createApp } from "h3";

export const app = createApp();

app.use(() => "你好，世界！");
```

为 Cloudflare Worker 创建入口：

```js [cloudflare.mjs]
import { toWebHandler } from "h3";
import { app } from "./app.mjs";

const handler = toWebHandler(app);

export default {
  async fetch(request, env, ctx) {
    return handler(request, {
      cloudflare: { env, ctx },
    });
  },
};
```

然后，创建一个简单的 `wrangler.toml`：

```ini [wrangler.toml]
name = "h3-app"
main = "cloudflare.mjs"
compatibility_date = "2023-08-01"
```

最后，使用 `wrangler dev` 进行本地预览：

```bash
npx wrangler dev
```

要部署，请使用 `wrangler deploy`：

```bash
npx wrangler deploy
```

## WebSocket 支持

:read-more{to="https://crossws.unjs.io/adapters/cloudflare"}

```ts
import wsAdapter from "crossws/adapters/cloudflare";

const { handleUpgrade } = wsAdapter(app.websocket);

export default {
  async fetch(request, env, ctx) {
    if (request.headers.get("upgrade") === "websocket") {
      return handleUpgrade(request, env, context);
    }
    return handler(request, {
      cloudflare: { env, ctx },
    });
  },
};
```

---

::read-more
👉 查看 [pi0/h3-on-edge](https://github.com/pi0/h3-on-edge) 演示以获取完整的工作示例（[部署](https://h3-on-edge.pi0.workers.dev/)）。
::
