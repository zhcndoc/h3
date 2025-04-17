---
icon: icons8:up-round
---

# 从 v1 迁移到 v2 的指南

h3 v2 包括一些行为和 API 的变化，你需要在迁移时考虑应用这些变化。

> [!NOTE]
> 目前 v2 处于 beta 阶段，你可以通过 [`h3-nightly@2x`](https://www.npmjs.com/package/h3-nightly?activeTab=versions) 尝试使用。

> [!NOTE]
> 这是一个正在进行的迁移指南，尚未完成。

## ESM 和最新的 Node.js

H3 v2 需要 Node.js >= 2.11，并支持 ESM。

你仍然可以通过 `require(esm)` 在较新的 Node.js 版本中使用 `require("h3")`。

## Web 标准

H3 v2 基于 Web 标准原语重写（[`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL), [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers), [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)，以及 [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)）。

`event.node` 上下文仅在 Node.js 运行时中可用，而 `event.web` 可通过 `event.req` 访问。

在 Node.js 运行时，h3 使用双向代理来同步 Node.js API 与 Web 标准 API，使其在 Node.js 中提供无缝体验。

为了支持 Web 标准，旧的普通处理程序和 Web 处理程序工具被移除。

## 响应处理

你应该始终明确 `return` 响应体。

如果你之前使用以下方法，可以将其替换为返回文本、JSON、流或 Web `Response` 的 `return` 语句（h3 会智能检测并处理每个）：

- `send(event, value)`：迁移为 `return <value>`。
- `sendError(event, <error>)`：迁移为 `throw createError(<error>)`。
- `sendStream(event, <stream>)`：迁移为 `return <stream>`。
- `sendWebResponse(event, <response>)`：迁移为 `return <response>`。

其他重命名的发送工具需要明确 `return`：

- `sendNoContent(event)` / `return null`: 迁移为 `return noContent(event)`。
- `sendIterable(event, <value>)`: 迁移为 `return iterable(event, <value>)`。
- `sendRedirect(event, location, code)`: 迁移为 `return redirect(event, location, code)`。
- `sendProxy(event, target)`: 迁移为 `return proxy(event, target)`。
- `handleCors(event)`: 检查返回值（布尔值），如果处理了便提前 `return`。
- `serveStatic(event, content)`: 确保在前面添加 `return`。

## 应用接口和路由器

路由器功能现在已集成到 h3 应用核心中。您可以使用 `new H3()`，而不是 `createApp()` 和 `createRouter()`。

新方法：

- `app.use(handler)`：添加全局中间件。
- `app.use(route, handler)`：添加路由中间件。
- `app.on(method, handler)` / `app.all(handler)` / `app.[METHOD](handler)`：添加路由处理程序。

处理程序将按以下顺序运行：

- 按相同顺序注册的所有全局中间件
- 从最不具体到最具体路径的所有路由中间件（自动排序）
- 匹配的路由处理程序

任何处理程序都可以返回响应。如果中间件不返回响应，则会尝试下一个处理程序，最后如果都没有响应则返回 404。路由处理程序可以选择返回或不返回任何响应，在这种情况下，h3 将发送一个简单的 200 状态码和空内容。

h3 迁移到了全新的路由匹配引擎 [unjs/rou3](https://rou3.unjs.io/)。你可能会经历轻微（但更直观的）匹配模式行为变化。

v1 的其他变化：

- 使用 `app.use("/path", handler)` 注册的处理程序仅匹配 `/path`（而不是 `/path/foo/bar`）。为了像以前那样匹配所有子路径，它应该更新为 `app.use("/path/**", handler)`。
- 每个处理程序中接收到的 `event.path` 将包含完整路径，而不是省略前缀。使用 `withBase(base, handler)` 工具来制作带前缀的应用。（示例：`withBase("/api", app.handler)`）。
- `app.use(() => handler, { lazy: true })` 不再受支持。现在可以使用 `app.use(defineLazyEventHandler(() => handler), { lazy: true })`。
- `app.use(["/path1", "/path2"], ...)` 和 `app.use("/path", [handler1, handler2])` 不再受支持。相反，请使用多个 `app.use()` 调用。
- 自定义 `match` 函数不再支持 `app.use`（中间件可以跳过自己）。
- `app.resolve(path) => { route, handler }` 改为 `app.resolve(method, path) => { method, route, handler }`。
- `router.use(path, handler)` 已弃用。请改为使用 `router.all(path, handler)`。
- `router.add(path, method: Method | Method[]` 的签名更改为 `router.add(method: Method, path)`（**重要**）。

## 请求体工具

大多数请求体工具现在可以替代为基于标准 [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Response) 接口 + 来自 [srvx](https://srvx.unjs.io/guide/handler#additional-properties) 的平台附加功能的 `event.req` 工具。

`readBody(event)` 工具将使用 [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) 或 [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) 来解析具有 `application/x-www-form-urlencoded` 内容类型的请求。

- 对于文本：使用 [event.req.text()](https://developer.mozilla.org/en-US/docs/Web/API/Request/text)。
- 对于 JSON：使用 [event.req.json()](https://developer.mozilla.org/en-US/docs/Web/API/Request/json)。
- 对于 formData：使用 [event.req.formData()](https://developer.mozilla.org/en-US/docs/Web/API/Request/formData)。
- 对于流：使用 [event.req.body](https://developer.mozilla.org/en-US/docs/Web/API/Request/body)。

**行为变化：**

- 如果传入的请求没有主体（例如是 `GET` 方法），则主体工具不会抛出错误，而是返回空值。
- 原生的 `request.json` 和 `readBody` 不再使用 [unjs/destr](https://destr.unjs.io)。你应始终过滤和清理来自用户的数据，以避免 [prototype-poisoning](https://medium.com/intrinsic-blog/javascript-prototype-poisoning-vulnerabilities-in-the-wild-7bc15347c96)。

## Cookie 和头部

h3 已迁移以利用标准 Web [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) 进行所有工具。

头部值现在始终是简单的 `string`（没有 `null`、`undefined`、`number` 或 `string[]`）。

对于 [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) 头部，你可以使用 [`headers.getSetCookie`](https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie)，它始终返回一个字符串数组。

### 其他弃用

h3 v2 弃用了一些过时和别名的工具。

**应用和路由器：**

- `createApp` / `createRouter`：迁移至 `new H3()`。

**处理程序：**

- `eventHandler`：迁移至 `defineEventHandler`（或移除它！）。
- `lazyEventHandler`：迁移至 `defineLazyEventHandler`。
- `toEventHandler` / `isEventHandler`：（移除）任何函数都可以成为事件处理程序。
- `useBase`：迁移至 `withbase`。

**请求：**

- `getHeader` / `getRequestHeader`: 迁移至 `event.req.headers.get(name)`。
- `getHeaders` / `getRequestHeaders`: 迁移至 `Object.fromEntries(event.req.headers.entries())`。
- `getRequestPath`: 迁移至 `event.path` 或 `event.url`。
- `getMethod`: 迁移至 `event.method`。

**响应：**

- `getResponseHeader` / `getResponseHeaders`: 迁移至 `event.res.headers.get(name)`。
- `setHeader` / `setResponseHeader` / `setHeaders` / `setResponseHeaders`: 迁移至 `event.res.headers.set(name, value)`。
- `appendHeader` / `appendResponseHeader` / `appendResponseHeaders`: 迁移至 `event.res.headers.append(name, value)`。
- `removeResponseHeader` / `clearResponseHeaders`: 迁移至 `event.res.headers.delete(name)`。
- `appendHeaders`: 迁移至 `appendResponseHeaders`。
- `defaultContentType`: 迁移至 `event.res.headers.set("content-type", type)`。
- `getResponseStatus` / `getResponseStatusText` / `setResponseStatus`: 使用 `event.res.status` 和 `event.res.statusText`。

**Node.js：**

- `defineNodeListener`：迁移至 `defineNodeHandler`。
- `fromNodeMiddleware`：迁移至 `fromNodeHandler`。
- `toNodeListener`：迁移至 `toNodeHandler`。
- `createEvent`：（移除）：使用 Node.js 适配器 (`toNodeHandler(app)`)。
- `fromNodeRequest`：（移除）：使用 Node.js 适配器 (`toNodeHandler(app)`)。
- `promisifyNodeListener`（移除）。
- `callNodeListener`：（移除）。

**Web：**

- `fromPlainHandler`：（移除）迁移至 Web API。
- `toPlainHandler`：（移除）迁移至 Web API。
- `fromPlainRequest`（移除）迁移至 Web API 或使用 `mockEvent` 工具进行测试。
- `callWithPlainRequest`（移除）迁移至 Web API。
- `fromWebRequest`：（移除）迁移至 Web API。
- `callWithWebRequest`：（移除）。

**主体：**

- `readRawBody`: 迁移至 `event.req.text()` 或 `event.req.arrayBuffer()`。
- `getBodyStream` / `getRequestWebStream`: 迁移至 `event.req.body`。
- `readFormData` / `readMultipartFormData` / `readFormDataBody`: 迁移至 `event.req.formData()`。

**工具：**

- `isStream`：迁移至 `instanceof ReadableStream`。
- `isWebResponse`：迁移至 `instanceof Response`。
- `splitCookiesString`：使用来自 [cookie-es](https://github.com/unjs/cookie-es) 的 `splitSetCookieString`。
- `MIMES`：（移除）。

**类型：**

- `App`：迁移至 `H3`。
- `AppOptions`：迁移至 `H3Config`。
- `_RequestMiddleware`：迁移至 `RequestMiddleware`。
- `_ResponseMiddleware`：迁移至 `ResponseMiddleware`。
- `NodeListener`：迁移至 `NodeHandler`。
- `TypedHeaders`：迁移至 `RequestHeaders` 和 `ResponseHeaders`。
- `HTTPHeaderName`：迁移至 `RequestHeaderName` 和 `ResponseHeaderName`。
- `H3Headers`：迁移至原生 `Headers`。
- `H3Response`：迁移至原生 `Response`。
- `MultiPartData`：迁移至原生 `FormData`。
- `RouteNode`：迁移至 `RouterEntry`。
  `CreateRouterOptions`：迁移至 `RouterOptions`。

已移除的类型导出：`WebEventContext`、`NodeEventContext`、`NodePromisifiedHandler`、`AppUse`、`Stack`、`InputLayer`、`InputStack`、`Layer`、`Matcher`、`PlainHandler`、`PlainRequest`、`PlainResponse`、`WebHandler`。