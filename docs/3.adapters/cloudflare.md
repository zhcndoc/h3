---
icon: devicon-plain:cloudflareworkers
---

# Cloudflare

> Run your h3 apps in Cloudflare Workers

You can directly host your h3 applications to [Cloudflare Workers](https://workers.cloudflare.com/) using [Web Adapter](/adapters/web).

## Usage

Create app entry:

```js [app.mjs]
import { createApp } from "h3";

export const app = createApp();

app.use(() => "Hello world!");
```

Create entry for a Cloudflare Worker:

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

Then, create a simple `wrangler.toml`:

```ini [wrangler.toml]
name = "h3-app"
main = "cloudflare.mjs"
compatibility_date = "2023-08-01"
```

Finally, use `wrangler dev` to locally preview:

```bash
npx wrangler dev
```

To deploy, use `wrangler deploy`:

```bash
npx wrangler deploy
```

## WebSocket support

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
👉 See [pi0/h3-on-edge](https://github.com/pi0/h3-on-edge) demo for a fully working example ([deployment](https://h3-on-edge.pi0.workers.dev/)).
::
