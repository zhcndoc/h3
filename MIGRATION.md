---
icon: icons8:up-round
---

# 从 v1 到 v2 的迁移指南

h3 v2 包含了一些行为和 API 的变更，迁移时需要考虑应用这些变更。

> [!NOTE]
> 当前 v2 仍处于测试阶段，您可以尝试使用 [`h3-nightly@2x`](https://www.npmjs.com/package/h3-nightly?activeTab=versions)

> [!NOTE]
> 这是一个正在进行中的迁移指南，尚未完成。

## ESM 和最新的 Node.js

H3 v2 需要 Node.js >= 20.11 并支持 ESM。

感谢较新版本 Node.js 中对 `require(esm)` 的支持，您依然可以使用 `require("h3")`。

## Web 标准

H3 v2 基于 Web 标准原语重写（[`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL)、[`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers)、[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) 和 [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)）。

`event.node` 上下文仅在 Node.js 环境中可用，`event.web` 可通过 `event.req` 获取。

在 Node.js 环境中，h3 使用双向代理同步 Node.js API 与 Web 标准 API，实现 Node 端的无缝体验。

旧版的纯处理器和 Web 处理器工具已移除，以更好地遵循 Web 标准。

## 响应处理

您应始终显式地 `return` 响应体。

如果您之前使用了以下方法，可以用返回文本、JSON、流或 Web `Response`（h3 会智能检测并处理）来替代 `return` 语句：

- `send(event, value)`：迁移为 `return <value>`。
- `sendError(event, <error>)`：迁移为 `throw createError(<error>)`。
- `sendStream(event, <stream>)`：迁移为 `return <stream>`。
- `sendWebResponse(event, <response>)`：迁移为 `return <response>`。

其他被重命名且需要显式 `return` 的发送工具：

- `sendNoContent(event)` / `return null`：迁移为 `return noContent(event)`。
- `sendIterable(event, <value>)`：迁移为 `return iterable(event, <value>)`。
- `sendRedirect(event, location, code)`：迁移为 `return redirect(event, location, code)`。
- `sendProxy(event, target)`：迁移为 `return proxy(event, target)`。
- `handleCors(event)`：检查返回值（布尔值），如已处理则早期 `return`。
- `serveStatic(event, content)`：确保前面加上 `return`。

## 应用接口和路由器

路由功能已集成至 h3 应用核心。无需 `createApp()` 和 `createRouter()`，可直接使用 `new H3()`。

新方法：

- `app.use(handler)`：添加全局中间件。
- `app.use(route, handler)`：添加路径中间件。
- `app.on(method, handler)` / `app.all(handler)` / `app.[METHOD](handler)`：添加路由处理器。

处理器运行顺序为：

- 按注册顺序执行所有全局中间件
- 从最不具体到最具体路径（自动排序）执行所有路径中间件
- 匹配到的路由处理器

任何处理器都可以返回响应。如果中间件未返回响应，则尝试下一个处理器，最终如果无响应返回会导致 404。路由处理器可有可无返回响应，若无返回，h3 会发送一个简单的状态码 200 空内容响应。

h3 迁移到了全新的路由匹配引擎 [rou3](https://rou3.h3.dev/)，匹配模式可能有细微（但更直观）的行为变更。

从 v1 的其他变化：

- 使用 `app.use("/path", handler)` 注册的处理器仅匹配 `/path`（不匹配 `/path/foo/bar`）。如需匹配所有子路径，应改为 `app.use("/path/**", handler)`。
- 每个处理器中接收到的 `event.path` 是完整路径，不会省略前缀。请使用 `withBase(base, handler)` 工具来创建带前缀的应用。(示例：`withBase("/api", app.handler)`)。
- `app.use(() => handler, { lazy: true })` 不再支持。可改用 `app.use(defineLazyEventHandler(() => handler), { lazy: true })`。
- 不再支持 `app.use(["/path1", "/path2"], ...)` 和 `app.use("/path", [handler1, handler2])`，请改用多次调用 `app.use()`。
- `app.use` 不再支持自定义 `match` 函数（中间件可自行跳过）。
- `app.resolve(path)` 改为 `app.resolve(method, path)` 并返回 `{ method, route, handler }`。
- `router.use(path, handler)` 已废弃，请改用 `router.all(path, handler)`。
- `router.add(path, method: Method | Method[])` 签名改为 `router.add(method: Method, path)`（**重要**）。

## Body 工具

大多数请求体工具现在可以替换为基于标准 [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Response) 接口和 [srvx](https://srvx.h3.dev/guide/handler#additional-properties) 平台扩展的 `event.req` 工具。

`readBody(event)` 工具会根据请求 `content-type` 使用 [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) 或 [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) 解析 `application/x-www-form-urlencoded` 内容。

- 文本：使用 [event.req.text()](https://developer.mozilla.org/en-US/docs/Web/API/Request/text)。
- JSON：使用 [event.req.json()](https://developer.mozilla.org/en-US/docs/Web/API/Request/json)。
- formData：使用 [event.req.formData()](https://developer.mozilla.org/en-US/docs/Web/API/Request/formData)。
- 流：使用 [event.req.body](https://developer.mozilla.org/en-US/docs/Web/API/Request/body)。

**行为变更：**

- 请求无请求体（例如 GET 方法）时，Body 工具不会抛错，而是返回空值。
- 原生 `request.json` 和 `readBody` 不再使用 [unjs/destr](https://destr.unjs.io)，需自行严格过滤和清理用户数据，以避免 [原型污染攻击](https://medium.com/intrinsic-blog/javascript-prototype-poisoning-vulnerabilities-in-the-wild-7bc15347c96)。

## Cookie 和 Headers

h3 改用标准 Web [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) 来实现所有工具。

Header 值现在始终为纯 `string` 类型（不再为 `null`、`undefined`、`number` 或 `string[]`）。

对于 [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) 头，可使用 [`headers.getSetCookie`](https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie) 方法，始终返回字符串数组。

### 其他废弃

h3 v2 废弃了一些旧版和别名工具。

**应用和路由器：**

- `createApp` / `createRouter`：迁移为 `new H3()`。

**处理器：**

- `eventHandler`：迁移为 `defineEventHandler`（或直接删除）。
- `lazyEventHandler`：迁移为 `defineLazyEventHandler`。
- `toEventHandler`：删除包装器。
- `isEventHandler`：（已移除）任何函数均可作为事件处理器。
- `useBase`：迁移为 `withBase`。

**请求：**

- `getHeader` / `getRequestHeader`：迁移为 `event.req.headers.get(name)`。
- `getHeaders` / `getRequestHeaders`：迁移为 `Object.fromEntries(event.req.headers.entries())`。
- `getRequestPath`：迁移为 `event.path` 或 `event.url`。
- `getMethod`：迁移为 `event.method`。

**响应：**

- `getResponseHeader` / `getResponseHeaders`：迁移为 `event.res.headers.get(name)`。
- `setHeader` / `setResponseHeader` / `setHeaders` / `setResponseHeaders`：迁移为 `event.res.headers.set(name, value)`。
- `appendHeader` / `appendResponseHeader` / `appendResponseHeaders`：迁移为 `event.res.headers.append(name, value)`。
- `removeResponseHeader` / `clearResponseHeaders`：迁移为 `event.res.headers.delete(name)`。
- `appendHeaders`：迁移为 `appendResponseHeaders`。
- `defaultContentType`：迁移为 `event.res.headers.set("content-type", type)`。
- `getResponseStatus` / `getResponseStatusText` / `setResponseStatus`：使用 `event.res.status` 和 `event.res.statusText`。

**Node.js：**

- `defineNodeListener`：迁移为 `defineNodeHandler`。
- `fromNodeMiddleware`：迁移为 `fromNodeHandler`。
- `toNodeListener`：迁移为 `toNodeHandler`。
- `createEvent`：（已移除）使用 Node.js 适配器 (`toNodeHandler(app)`)。
- `fromNodeRequest`：（已移除）使用 Node.js 适配器 (`toNodeHandler(app)`)。
- `promisifyNodeListener`：（已移除）。
- `callNodeListener`：（已移除）。

**Web：**

- `fromPlainHandler`：（已移除）迁移为 Web API。
- `toPlainHandler`：（已移除）迁移为 Web API。
- `fromPlainRequest`：（已移除）迁移为 Web API 或测试时使用 `mockEvent` 工具。
- `callWithPlainRequest`：（已移除）迁移为 Web API。
- `fromWebRequest`：（已移除）迁移为 Web API。
- `callWithWebRequest`：（已移除）。

**Body：**

- `readRawBody`：迁移为 `event.req.text()` 或 `event.req.arrayBuffer()`。
- `getBodyStream` / `getRequestWebStream`：迁移为 `event.req.body`。
- `readFormData` / `readMultipartFormData` / `readFormDataBody`：迁移为 `event.req.formData()`。

**工具：**

- `isStream`：迁移为 `instanceof ReadableStream`。
- `isWebResponse`：迁移为 `instanceof Response`。
- `splitCookiesString`：使用 [cookie-es](https://github.com/unjs/cookie-es) 中的 `splitSetCookieString`。
- `MIMES`：（已移除）。

**类型：**

- `App`：迁移为 `H3`。
- `AppOptions`：迁移为 `H3Config`。
- `_RequestMiddleware`：迁移为 `RequestMiddleware`。
- `_ResponseMiddleware`：迁移为 `ResponseMiddleware`。
- `NodeListener`：迁移为 `NodeHandler`。
- `TypedHeaders`：迁移为 `RequestHeaders` 和 `ResponseHeaders`。
- `HTTPHeaderName`：迁移为 `RequestHeaderName` 和 `ResponseHeaderName`。
- `H3Headers`：迁移为原生 `Headers`。
- `H3Response`：迁移为原生 `Response`。
- `MultiPartData`：迁移为原生 `FormData`。
- `RouteNode`：迁移为 `RouterEntry`。
- `CreateRouterOptions`：迁移为 `RouterOptions`。

移除的类型导出：`WebEventContext`、`NodeEventContext`、`NodePromisifiedHandler`、`AppUse`、`Stack`、`InputLayer`、`InputStack`、`Layer`、`Matcher`、`PlainHandler`、`PlainRequest`、`PlainResponse`、`WebHandler`。