---
icon: teenyicons:netlify-outline
---

# Netlify

> 在 Netlify Edge 运行你的 h3 应用

你可以使用 [Web Adapter](/adapters/web) 将你的 h3 应用直接托管到 [Netlify Edge](https://www.netlify.com/platform/core/edge/) 上。

## 用法

创建应用入口：

```js [app.mjs]
import { createApp } from "h3";

export const app = createApp();

app.use(() => "Hello world!");
```

为 netlify-edge 创建入口：

```js [netlify/index.mjs]
import { toWebHandler } from "h3";
import { app } from "./app.mjs";

export const handler = toWebHandler(app);
```

然后，创建 `import_map.json`：

```json [import_map.json]
{
  "imports": {
    "h3": "https://esm.sh/h3@latest"
  }
}
```

创建 `netlify.toml`：

```ini [netlify.toml]
[build]
  edge_functions = "netlify"

[functions]
  deno_import_map = "./import_map.json"
```

最后，使用 `netlify dev` 进行本地预览：

```bash [terminal]
npx netlify dev
```

要部署，请使用 `netlify deploy`：

```bash [terminal]
npx netlify deploy --prod
```

---

::read-more
查看 [pi0/h3-on-edge](https://github.com/pi0/h3-on-edge) demo 以获取完整的工作示例。
::
