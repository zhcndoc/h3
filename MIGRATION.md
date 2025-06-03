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

- `sendNoContent(event)` / `return null`: 迁移为 `return noContent(event)`。
- `sendIterable(event, <value>)`: 迁移为 `return iterable(event, <value>)`。
- `sendRedirect(event, location, code)`: 迁移为 `return redirect(event, location, code)`。
- `sendProxy(event, target)`: 迁移为 `return proxy(event, target)`。
- `handleCors(event)`: 检查返回值（布尔型），如处理则提前 `return`。
- `serveStatic(event, content)`: 确保前面加上 `return`。

## 应用接口和路由器

路由器功能现已集成到 h3 应用核心中。您可以使用 `new H3()` 替代原来的 `createApp()` 和 `createRouter()`。

新增方法：

- `app.use(middleware, opts?: { route?: string, method?: string })`：添加全局中间件。
- `app.on(method, handler)` / `app.all(handler)` / `app.[METHOD](handler)`：添加路由处理器。

处理器的调用顺序为：

- 按注册顺序执行的全局中间件
- 匹配的路由处理器

任何处理器都可返回响应。如果中间件未返回响应，则尝试调用下一个处理器，最终若无响应则返回 404。路由处理器可以选择返回响应，也可以不返回响应，如果不返回，h3 会发送一个内容为空的简单 200 响应。

h3 迁移到了全新的路由匹配引擎 [rou3](https://rou3.h3.dev/)，匹配模式可能会有些微但更直观的行为变化。

**v1 的其他变更：**

- 使用 `app.use("/path", handler)` 注册的处理器仅匹配 `/path`（不包含 `/path/foo/bar`）。若要匹配所有子路径，应改写为 `app.use("/path/**", handler)`。
- 各处理器中接收的 `event.path` 是完整路径，不会省略前缀。使用 `withBase(base, handler)` 实用工具创建带前缀的应用（例如：`withBase("/api", app.handler)`）。
- **`router.add(path, method: Method | Method[])` 签名变更为 `router.add(method: Method, path)`。**
- `router.use(path, handler)` 被弃用，改用 `router.all(path, handler)`。
- 不再支持 `app.use(() => handler, { lazy: true })`，改用 `app.use(defineLazyEventHandler(() => handler), { lazy: true })`。
- 不再支持 `app.use(["/path1", "/path2"], ...)` 和 `app.use("/path", [handler1, handler2])`，请改用多次调用 `app.use()`。
- 移除 `app.resolve(path)`。

## Body 工具

大多数请求体相关实用工具现可被基于标准 [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Response) 接口 + [srvx](https://srvx.h3.dev/guide/handler#additional-properties) 平台扩展的 `event.req` 工具替代。

`readBody(event)` 根据请求的 `content-type` 使用 [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) 或 [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) 解析 `application/x-www-form-urlencoded` 内容。

- 文本：使用 [event.req.text()](https://developer.mozilla.org/en-US/docs/Web/API/Request/text)。
- JSON：使用 [event.req.json()](https://developer.mozilla.org/en-US/docs/Web/API/Request/json)。
- formData：使用 [event.req.formData()](https://developer.mozilla.org/en-US/docs/Web/API/Request/formData)。
- 流：使用 [event.req.body](https://developer.mozilla.org/en-US/docs/Web/API/Request/body)。

**行为变更：**

- 对无请求体的请求（如 GET 方法），Body 工具不会抛出异常，而是返回空值。
- 原生 `request.json` 和 `readBody` 不再使用 [unjs/destr](https://destr.unjs.io)，需自行严格过滤和清理用户数据以防范 [原型污染攻击](https://medium.com/intrinsic-blog/javascript-prototype-poisoning-vulnerabilities-in-the-wild-7bc15347c96)。

## Cookie 和 Headers

h3 改用标准 Web [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) 实现所有工具。

Header 值现在始终为纯 `string` 类型（不再可能是 `null`、`undefined`、`number` 或 `string[]`）。

对于 [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) 头，可使用 [`headers.getSetCookie`](https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie) 方法，该方法始终返回字符串数组。

### 其他废弃

h3 v2 废弃了一些旧版及别名工具。

**应用及路由器：**

- `createApp` / `createRouter`：迁移为 `new H3()`。

**处理器相关：**

- `eventHandler`：迁移为 `defineEventHandler`（或直接移除！）。
- `lazyEventHandler`：迁移为 `defineLazyEventHandler`。
- `toEventHandler`：弃用移除。
- `isEventHandler`：（移除）任意函数均可作为事件处理器。
- `useBase`：迁移为 `withBase`。
- `defineRequestMiddleware` 和 `defineResponseMiddleware` 移除。

**请求相关：**

- `getHeader` / `getRequestHeader`：迁移为 `event.req.headers.get(name)`。
- `getHeaders` / `getRequestHeaders`：迁移为 `Object.fromEntries(event.req.headers.entries())`。
- `getRequestPath`：迁移为 `event.path` 或 `event.url`。
- `getMethod`：迁移为 `event.method`。

**响应相关：**

- `getResponseHeader` / `getResponseHeaders`：迁移为 `event.res.headers.get(name)`。
- `setHeader` / `setResponseHeader` / `setHeaders` / `setResponseHeaders`：迁移为 `event.res.headers.set(name, value)`。
- `appendHeader` / `appendResponseHeader` / `appendResponseHeaders`：迁移为 `event.res.headers.append(name, value)`。
- `removeResponseHeader` / `clearResponseHeaders`：迁移为 `event.res.headers.delete(name)`。
- `appendHeaders`：迁移为 `appendResponseHeaders`。
- `defaultContentType`：迁移为 `event.res.headers.set("content-type", type)`。
- `getResponseStatus` / `getResponseStatusText` / `setResponseStatus`：使用 `event.res.status` 和 `event.res.statusText`。

**Node.js 相关：**

- `defineNodeListener`：迁移为 `defineNodeHandler`。
- `fromNodeMiddleware`：迁移为 `fromNodeHandler`。
- `toNodeListener`：迁移为 `toNodeHandler`。
- `createEvent`：（移除）使用 Node.js 适配器 (`toNodeHandler(app)`)。
- `fromNodeRequest`：（移除）使用 Node.js 适配器 (`toNodeHandler(app)`)。
- `promisifyNodeListener`：（移除）。
- `callNodeListener`：（移除）。

**Web 相关：**

- `fromPlainHandler`：（移除）迁移为 Web API。
- `toPlainHandler`：（移除）迁移为 Web API。
- `fromPlainRequest`：（移除）迁移为 Web API 或使用测试工具 `mockEvent`。
- `callWithPlainRequest`：（移除）迁移为 Web API。
- `fromWebRequest`：（移除）迁移为 Web API。
- `callWithWebRequest`：（移除）。

**Body 相关：**

- `readRawBody`：迁移为 `event.req.text()` 或 `event.req.arrayBuffer()`。
- `getBodyStream` / `getRequestWebStream`：迁移为 `event.req.body`。
- `readFormData` / `readMultipartFormData` / `readFormDataBody`：迁移为 `event.req.formData()`。

**工具相关：**

- `isStream`：迁移为 `instanceof ReadableStream`。
- `isWebResponse`：迁移为 `instanceof Response`。
- `splitCookiesString`：使用 [cookie-es](https://github.com/unjs/cookie-es) 中的 `splitSetCookieString`。
- `MIMES`：（移除）。

**类型相关：**

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

移除的类型导出包括：`WebEventContext`、`NodeEventContext`、`NodePromisifiedHandler`、`AppUse`、`Stack`、`InputLayer`、`InputStack`、`Layer`、`Matcher`、`PlainHandler`、`PlainRequest`、`PlainResponse`、`WebHandler`。