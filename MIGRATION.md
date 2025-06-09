---
icon: icons8:up-round
---

# 从 v1 到 v2 的迁移指南

H3 版本 2 包含一些行为和 API 变更，您在迁移时需要考虑应用这些更改。

> [!NOTE]
> 目前 H3 v2 仍处于测试阶段。您可以尝试使用 [夜间频道](/guide/advanced/nightly)。

> [!NOTE]
> 这是一个正在进行中的迁移指南，可能会更新。

> [!TIP]
> H3 拥有全新的文档改版。前往新的 [指南](/guide) 部分了解更多！

## 最新的 Node.js 和 ESM-only

> [!TIP]
> H3 v2 要求 Node.js >= 20.11（推荐使用最新 LTS）。

如果您的应用当前使用 CommonJS 模块（`require` 和 `module.exports`），得益于最新 Node.js 版本支持 `require(esm)`，您仍可以使用 `require("h3")`。

您也可以选择其他兼容的运行时环境 [Bun](https://bun.sh/) 或 [Deno](https://deno.com/)。

## Web 标准

> [!TIP]
> H3 v2 基于 Web 标准原语重新编写（[`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL)、[`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers)、[`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) 和 [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)）。

在使用 Node.js 时，H3 采用兼容层（[💥 srvx](https://srvx.h3.dev/guide/node)），在其他运行时使用原生 Web 兼容 API。

仅在 Node.js 运行时服务器中才能访问原生的 `event.node.{req,res}`。

`event.web` 被重命名为 `event.req`（Web[Response](https://developer.mozilla.org/en-US/docs/Web/API/Response)的实例）。

## 响应处理

> [!TIP]
> 您应始终显式 **return** 响应体或 **throw** 一个错误。

如果您之前使用了以下方法，可以改为用返回语句 `return` 返回文本、JSON、流或 Web `Response`（H3 会智能识别并处理每种类型）：

- `send(event, value)`：迁移为 `return <value>`。
- `sendError(event, <error>)`：迁移为 `throw createError(<error>)`。
- `sendStream(event, <stream>)`：迁移为 `return <stream>`。
- `sendWebResponse(event, <response>)`：迁移为 `return <response>`。

其他更名且需要显式 `return` 的发送工具：

- `sendNoContent(event)` / `return null`：迁移为 `return noContent(event)`。
- `sendIterable(event, <value>)`：迁移为 `return iterable(event, <value>)`。
- `sendProxy(event, target)`：迁移为 `return proxy(event, target)`。
- `handleCors(event)`：检查返回值（布尔型），如果已处理则提前 `return`。
- `serveStatic(event, content)`：确保添加 `return`。
- `sendRedirect(event, location, code)`：迁移为 `return redirect(event, location, code)`。

:read-more{to="/guide/basics/response" title="发送响应"}

## H3 与 Router

> [!TIP]
> Router 功能现已集成入 H3 核心。  
> 您可以使用 [`new H3()`](/guide/api/h3) 代替 `createApp()` 和 `createRouter()`。

任何 handler 都可以返回一个响应。如果中间件不返回响应，则会尝试后续处理，最终若无响应则返回 404。Router 处理程序可以返回也可以不返回响应，此时 H3 会发送一个简单的 200 空内容响应。

:read-more{to="/guide/basics/lifecycle" title="请求生命周期"}

H3 迁移到了全新的路由匹配引擎（[🌳 rou3](https://rou3.h3.dev/)）。您可能会体验到更加直观但稍有不同的匹配行为变化。

**v1 的其他变更：**

- 使用 `app.use("/path", handler)` 添加的中间件仅匹配 `/path`（不会匹配 `/path/foo/bar`）。如需匹配所有子路径，请改为使用 `app.use("/path/**", handler)`。
- 每个 handler 中接收的 `event.path` 将是完整路径，不会省略前缀。请使用工具函数 `withBase(base, handler)` 构建带前缀的应用（示例：`withBase("/api", app.handler)`）。
- **`router.add(path, method: Method | Method[])` 签名更改为 `router.add(method: Method, path)`。**
- `router.use(path, handler)` 已废弃，请改用 `router.all(path, handler)`。
- 不再支持 `app.use(() => handler, { lazy: true })`，请改用 `app.use(defineLazyEventHandler(() => handler), { lazy: true })`。
- 不再支持 `app.use(["/path1", "/path2"], ...)` 与 `app.use("/path", [handler1, handler2])`，请使用多次 `app.use()` 代替。
- 移除 `app.resolve(path)`。

:read-more{to="/guide/basics/routing" title="路由"}

:read-more{to="/guide/basics/middleware" title="中间件"}

## 请求体

> [!TIP]
> 大多数请求体的工具现可替换为基于 Web [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Response) 接口的 `event.req.*` 原生方法。

`readBody(event)` 根据请求的 `content-type` 使用 [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) 或 [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) 解析 `application/x-www-form-urlencoded` 格式内容。

- 文本：使用 [event.req.text()](https://developer.mozilla.org/en-US/docs/Web/API/Request/text)。
- JSON：使用 [event.req.json()](https://developer.mozilla.org/en-US/docs/Web/API/Request/json)。
- formData：使用 [event.req.formData()](https://developer.mozilla.org/en-US/docs/Web/API/Request/formData)。
- 流：使用 [event.req.body](https://developer.mozilla.org/en-US/docs/Web/API/Request/body)。

**行为变更：**

- 针对无请求体的请求（例如 GET 方法），Body 工具不会抛出异常，而是返回空值。
- 原生 `request.json` 和 `readBody` 不再使用 [unjs/destr](https://destr.unjs.io)，您需自行严格过滤和清理用户数据以防范 [原型污染攻击](https://medium.com/intrinsic-blog/javascript-prototype-poisoning-vulnerabilities-in-the-wild-7bc15347c96)。

## Cookie 和 Headers

> [!TIP]
> H3 现原生使用标准 Web [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) 来支持所有工具。

Header 值现在始终为纯 `string` 类型（不再可能是 `null`、`undefined`、`number` 或 `string[]`）。

针对 [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) 头，可以使用 [`headers.getSetCookie`](https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie) 方法，该方法始终返回字符串数组。

## 其他废弃内容

H3 v2 废弃了一些老旧及别名工具。

### App 和路由工具

- `createApp` / `createRouter`：迁移为 `new H3()`。

### 错误工具

- `createError`/`H3Error`：迁移为 `HTTPError`
- `isError`：迁移为 `HTTPError.isError`

### Handler 工具

- `eventHandler`/`defineEventHandler`：迁移为 `defineHandler`（您也可以直接使用函数）。
- `lazyEventHandler`：迁移为 `defineLazyEventHandler`。
- `toEventHandler`：移除包装器。
- `isEventHandler`：（移除）任何函数均可作为事件处理器。
- `useBase`：迁移为 `withBase`。
- `defineRequestMiddleware` 和 `defineResponseMiddleware` 已移除。

### 请求工具

- `getHeader` / `getRequestHeader`：迁移为 `event.req.headers.get(name)`。
- `getHeaders` / `getRequestHeaders`：迁移为 `Object.fromEntries(event.req.headers.entries())`。
- `getRequestPath`：迁移为 `event.path` 或 `event.url`。
- `getMethod`：迁移为 `event.method`。

### 响应工具

- `getResponseHeader` / `getResponseHeaders`：迁移为 `event.res.headers.get(name)`。
- `setHeader` / `setResponseHeader` / `setHeaders` / `setResponseHeaders`：迁移为 `event.res.headers.set(name, value)`。
- `appendHeader` / `appendResponseHeader` / `appendResponseHeaders`：迁移为 `event.res.headers.append(name, value)`。
- `removeResponseHeader` / `clearResponseHeaders`：迁移为 `event.res.headers.delete(name)`。
- `appendHeaders`：迁移为 `appendResponseHeaders`。
- `defaultContentType`：迁移为 `event.res.headers.set("content-type", type)`。
- `getResponseStatus` / `getResponseStatusText` / `setResponseStatus`：请使用 `event.res.status` 和 `event.res.statusText`。

### Node.js 工具

- `defineNodeListener`：迁移为 `defineNodeHandler`。
- `fromNodeMiddleware`：迁移为 `fromNodeHandler`。
- `toNodeListener`：迁移为 `toNodeHandler`。
- `createEvent`：移除，使用 Node.js 适配器（`toNodeHandler(app)`）。
- `fromNodeRequest`：移除，使用 Node.js 适配器（`toNodeHandler(app)`）。
- `promisifyNodeListener`：移除。
- `callNodeListener`：移除。

### Web 工具

- `fromPlainHandler`：移除，迁移为 Web API。
- `toPlainHandler`：移除，迁移为 Web API。
- `fromPlainRequest`：移除，迁移为 Web API 或使用测试工具 `mockEvent`。
- `callWithPlainRequest`：移除，迁移为 Web API。
- `fromWebRequest`：移除，迁移为 Web API。
- `callWithWebRequest`：移除。

### Body 工具

- `readRawBody`：迁移为 `event.req.text()` 或 `event.req.arrayBuffer()`。
- `getBodyStream` / `getRequestWebStream`：迁移为 `event.req.body`。
- `readFormData` / `readMultipartFormData` / `readFormDataBody`：迁移为 `event.req.formData()`。

### 其他工具

- `isStream`：迁移为 `instanceof ReadableStream`。
- `isWebResponse`：迁移为 `instanceof Response`。
- `splitCookiesString`：请使用 [cookie-es](https://github.com/unjs/cookie-es) 中的 `splitSetCookieString`。
- `MIMES`：移除。

### 类型导出

> [!NOTE]
> 类型可能还会有更多变更。

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