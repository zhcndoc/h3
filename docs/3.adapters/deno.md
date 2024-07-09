---
icon: teenyicons:deno-solid
---

# Deno

> Run your h3 apps in Deno Deploy

You can directly host your h3 applications to [Deno Deploy](https://deno.com/deploy) using [Web Adapter](/adapters/web).

## Usage

Create app entry:

```js [app.mjs]
import { createApp } from "h3";

export const app = createApp();

app.use(() => "Hello world!");
```

Create entry for Deno Deploy:

```js [deno.mjs]
import { toWebHandler } from "h3";
import { app } from "./app.mjs";

Deno.serve(toWebHandler(app));
```

Create an `import_map.json`:

```json [import_map.json]
{
  "imports": {
    "h3": "https://esm.sh/h3@latest"
  }
}
```

Finally, use `deno run` to locally preview:

```bash [terminal]
deno run --allow-net ./deno.mjs
```

To deploy, use `deployctl deploy`:

```bash [terminal]
deployctl deploy --prod --exclude=node_modules --import-map=./import_map.json ./deno.mjs
```

## WebSocket support

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
See [pi0/h3-on-edge](https://github.com/pi0/h3-on-edge) demo for a fully working example ([deployment](https://h3-on-edge.deno.dev/)).
::
