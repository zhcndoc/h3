---
icon: icons8:up-round
---

# 从 v1 迁移到 v2 的指南

h3 v2 包括一些行为和 API 的变化，你需要在迁移时考虑应用这些变化。

> [!NOTE]
> 目前 v2 处于 beta 阶段，你可以通过 [`h3-nightly@2x`](https://www.npmjs.com/package/h3-nightly?activeTab=versions) 尝试使用。

> [!NOTE]
> 这是一个正在进行中的迁移指南，尚未完成。

## Web 标准

H3 v2 是基于 Web 标准原语重新编写的（[`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL)、[`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers)、[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) 和 [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)）。

`event.node` 上下文仅在 Node.js 运行时可用，而 `event.web` 通过 `event.request` 获取。

在 Node.js 运行时，h3 使用双向代理将 Node.js API 同步到 Web 标准 API，使其在 Node 上的体验更为流畅。

为了迎合 Web 标准，旧的用于普通处理程序和 Web 处理程序的工具被移除。

## 响应处理

你应该始终明确地 `return` 响应体。

如果你以前使用以下方法，可以将它们替换为返回文本、JSON、流或 Web `Response` 的 `return` 语句（h3 会智能地检测和处理每种情况）：

- `send(event, value)`：迁移为 `return <value>`。
- `sendError(event, <error>)`：迁移为 `throw createError(<error>)`。
- `sendStream(event, <stream>)`：迁移为 `return <stream>`。
- `sendWebResponse(event, <response>)`：迁移为 `return <response>`。

其他被重命名的发送工具需要明确 `return`：

- `sendNoContent(event)` / `return null`：迁移为 `return noContent(event)`。
- `sendIterable(event, <value>)`：迁移为 `return iterable(event, <value>)`。
- `sendRedirect(event, location, code)`：迁移为 `return redirect(event, location, code)`。
- `sendProxy(event, target)`：迁移为 `return proxy(event, target)`。
- `handleCors(event)`：检查返回值（布尔值），如果处理，则提前 `return`。
- `serveStatic(event, content)`：确保在前面添加 `return`。

## 应用接口和路由器

路由功能现在集成在 h3 应用核心中。你可以使用 `createH3()` 代替 `createApp()` 和 `createRouter()`。

新方法：

- `app.use(handler)`：添加全局中间件。
- `app.use(route, handler)`：添加路由中间件。
- `app.on(method, handler)` / `app.all(handler)` / `app.[METHOD](handler)`：添加路由处理程序。

处理程序将按以下顺序运行：

- 所有全局中间件按注册的顺序运行。
- 所有路由中间件从最少特定到最具体的路径（自动排序）。
- 匹配的路由处理程序。

任何处理程序都可以返回响应。如果中间件不返回响应，将尝试下一个处理程序，最终如果没有响应则返回 404。路由处理程序可以返回或不返回任何响应，在这种情况下，h3 将发送一个简单的 200 状态及空内容。

h3 已迁移到全新的路由匹配引擎 [unjs/rou3](https://rou3.unjs.io/)。你可能会体验到稍微（但更直观）的行为变化。

v1 的其他变化：

- 使用 `app.use("/path", handler)` 注册的处理程序仅匹配 `/path`（不匹配 `/path/foo/bar`）。要匹配所有子路径，需更新为 `app.use("/path/**", handler)`。
- 每个处理程序接收到的 `event.path` 将包含完整路径而没有省略前缀。使用 `withBase(base, handler)` 工具来创建带前缀的应用。（例如：`withBase("/api", app.handler)`）。
- `app.use(() => handler, { lazy: true })` 不再受支持。相反你可以使用 `app.use(defineLazyEventHandler(() => handler), { lazy: true })`。
- `app.use(["/path1", "/path2"], ...)` 和 `app.use("/path", [handler1, handler2])` 不再受支持。相反，使用多个 `app.use()` 调用。
- 自定义 `match` 函数的 `app.use` 不再受支持（中间件可以跳过自己）。
- `app.resolve(path) => { route, handler }` 更改为 `app.resolve(method, path) => { method, route, handler }`。
- `router.use(path, handler)` 被弃用。请使用 `router.all(path, handler)` 代替。
- `router.add(path, method: Method | Method[]` 签名更改为 `router.add(method: Method, path)`（**重要**）。

## 请求体实用工具

大多数请求体实用工具现在可以替换为基于标准 [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Response) 接口的 `event.request` 工具。

`readBody(event)` 工具将使用 [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) 或 [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) 来解析具有 `application/x-www-form-urlencoded` 内容类型的请求。

- 对于文本：使用 [event.request.text()](https://developer.mozilla.org/en-US/docs/Web/API/Request/text)。
- 对于 JSON：使用 [event.request.json()](https://developer.mozilla.org/en-US/docs/Web/API/Request/json)。
- 对于 FormData：使用 [event.request.formData()](https://developer.mozilla.org/en-US/docs/Web/API/Request/formData)。
- 对于流：使用 [event.request.body](https://developer.mozilla.org/en-US/docs/Web/API/Request/body)。

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

- `createApp` / `createRouter`：迁移至 `createH3()`。

**处理程序：**

- `eventHandler`：迁移至 `defineEventHandler`（或移除它！）。
- `lazyEventHandler`：迁移至 `defineLazyEventHandler`。
- `toEventHandler` / `isEventHandler`：（移除）任何函数都可以成为事件处理程序。
- `useBase`：迁移至 `withbase`。

**请求：**

- `getHeader` / `getRequestHeader`：迁移至 `event.request.headers.get(name)`。
- `getHeaders` / `getRequestHeaders`：迁移至 `Object.fromEntries(event.request.headers.entries())`。
- `getRequestPath`：迁移至 `event.path` 或 `event.url`。
- `getMethod`：迁移至 `event.method`。

**响应：**

- `getResponseHeader` / `getResponseHeaders`：迁移至 `event.response.headers.get(name)`。
- `setHeader` / `setResponseHeader` / `setHeaders` / `setResponseHeaders`：迁移至 `event.response.headers.set(name, value)`。
- `appendHeader` / `appendResponseHeader` / `appendResponseHeaders`：迁移至 `event.response.headers.append(name, value)`。
- `removeResponseHeader` / `clearResponseHeaders`：迁移至 `event.response.headers.delete(name)`。
- `appendHeaders`：迁移至 `appendResponseHeaders`。
- `defaultContentType`：迁移至 `event.response.headers.set("content-type", type)`。
- `getResponseStatus` / `getResponseStatusText` / `setResponseStatus`：使用 `event.response.status` 和 `event.response.statusText`。

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

- `readRawBody`：迁移至 `event.request.text()` 或 `event.request.arrayBuffer()`。
- `getBodyStream` / `getRequestWebStream`：迁移至 `event.request.body`。
- `readFormData` / `readMultipartFormData` / `readFormDataBody`：迁移至 `event.request.formData()`。

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
