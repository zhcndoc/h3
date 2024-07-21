---
icon: icons8:up-round
---

# Migration guide for v1 to v2

h3 v2 includes some behavior and API changes that you need to consider applying when migrating.

> [!NOTE]
> Currently v2 is in beta stage You can try with [`h3-nightly@2x`](https://www.npmjs.com/package/h3-nightly?activeTab=versions)

> [!NOTE]
> This is an undergoing migration guide and is not finished yet.

## Web stanrdards

H3 v2 is rewritten based on Web standard primitives ([`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL), [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers), [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request), and [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response)).

`event.node` context is only available when running in Node.js runtime and `event.web` is available via `event.request`.

On Node.js runtime, h3 uses a two way proxy to sync Node.js API with Web standard API making it a seamless experience on Node.

Old utils for plain handler and web handler are removed to embrace web standards.

## Response handling

You should always explicitly `return` the response body.

If you were previously using methods below, you can replace them with `return` statements returning a text, JSON, stream, or web `Response` (h3 smartly detects and handles each):

- `send(event, value)`: Migrate to `return <value>`.
- `sendError(event, <error>)`: Migrate to `throw createError(<error>)`.
- `sendStream(event, <stream>)`: Migrate to `return <stream>`.
- `sendWebResponse(event, <response>)`: Migrate to `return <response>`.

Other send utils that are renamed and need explicit `return`:

- `sendNoContent(event)` / `return null`: Migrate to `return noContent(event)`.
- `sendIterable(event, <value>)`: Migrate to `return iterable(event, <value>)`.
- `sendRedirect(event, location, code)`: Migrate to `return redirect(event, location, code)`.
- `sendProxy(event, target)`: Migrate to `return proxy(event, target)`.
- `handleCors(event)`: Check return value (boolean) and early `return` if handled.
- `serveStatic(event, content)`: Make sure to add `return` before.

## App interface and router

Router functionality is now integrated into the h3 app core. Instead of `createApp()` and `createRouter()` you can use `createH3()`.

New methods:

- `app.use(handler)`: Adds a global middleware.
- `app.use(route, handler)`: Adds a routed middleware.
- `app.on(method, handler)` / `app.all(handler)` / `app.[METHOD](handler)`: Adds a route handler.

Handlers will run in this order:

- All global middleware in the same order were registered
- All routed middleware from least specific to most specific paths (auto-sorted)
- Matched route handler

Any handler can return a response. If middleware don't return a response, next handlers will be tried and finally make a 404 if neither responses. Router handlers can return or not return any response, in this case, h3 will send a simple 200 with empty content.

h3 migrated to a brand new route-matching engine [unjs/rou3](https://rou3.unjs.io/). You might experience slight (but more intuitive) behavior changes for matching patterns.

Other changes from v1:

- Handlers registered with `app.use("/path", handler)` only match `/path` (not `/path/foo/bar`). For matching all subpaths like before, it should be updated to `app.use("/path/**", handler)`.
- The `event.path` received in each handler will have a full path without omitting the prefixes. use `withBase(base, handler)` utility to make prefixed app. (example: `withBase("/api", app.handler)`).
- `app.use(() => handler, { lazy: true })` is no supported anymore. Instead you can use `app.use(defineLazyEventHandler(() => handler), { lazy: true })`.
- `app.use(["/path1", "/path2"], ...)` and `app.use("/path", [handler1, handler2])` are not supported anymore. Instead, use multiple `app.use()` calls.
- Custom `match` function for `app.use` is not supported anymore (middleware can skip themselves).
- `app.resolve(path) => { route, handler }` changed to `app.resolve(method, path) => { method, route, handler }`.
- `router.use(path, handler)` is deprecated. Use `router.all(path, handler)` instead.
- `router.add(path, method: Method | Method[]` signature is changed to `router.add(method: Method, path)` (**important**)

## Body utils

Most of request body utilities can now be replaced with `event.request` utils which is based on standard [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Response) interface.

`readBody(event)` utility will use [`JSON.parse`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) or [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) for parsing requests with `application/x-www-form-urlencoded` content-type.

- For text: Use [event.request.text()](https://developer.mozilla.org/en-US/docs/Web/API/Request/text).
- For json: Use [event.request.json()](https://developer.mozilla.org/en-US/docs/Web/API/Request/json).
- For formData: Use [event.request.formData()](https://developer.mozilla.org/en-US/docs/Web/API/Request/formData).
- For stream: Use [event.request.body](https://developer.mozilla.org/en-US/docs/Web/API/Request/body).

**Behavior changes:**

- Body utils won't throw an error if the incoming request has no body (or is a `GET` method for example) but instead, return empty values.
- native `request.json` and `readBody` does not use [unjs/destr](https://destr.unjs.io) anymore. You should always filter and sanitize data coming from user to avoid [prototype-poisoning](https://medium.com/intrinsic-blog/javascript-prototype-poisoning-vulnerabilities-in-the-wild-7bc15347c96).

## Cookie and headers

h3 migrated to leverage standard web [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) for all utils.

Header values are always a plain `string` now (no `null` or `undefined` or `number` or `string[]`).

For the [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) header, you can use [`headers.getSetCookie`](https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie) that always returns a string array.

### Other deprecations

h3 v2 deprecated some legacy and aliased utilities.

**App and router:**

- `createApp` / `createRouter`: Migrate to `createH3()`.

**Handler:**

- `eventHandler`: Migrate to `defineEventHandler` (or remove it!).
- `lazyEventHandler`: Migrate to `defineLazyEventHandler`.
- `toEventHandler` / `isEventHandler`: (removed) Any function can be an event handler.
- `useBase`: Migrate to `withbase`.

**Request:**

- `getHeader` / `getRequestHeader`: Migrate to `event.request.headers.get(name)`.
- `getHeaders` / `getRequestHeaders`: Migrate to `Object.fromEntries(event.request.headers.entries())`.
- `getRequestPath`: Migrate to `event.path` or `event.url`.
- `getMethod`: Migrate to `event.method`.

**Response:**

- `getResponseHeader` / `getResponseHeaders`: Migrate to `event.response.headers.get(name)`
- `setHeader` / `setResponseHeader` / `setHeaders` / `setResponseHeaders`: Migrate to `event.response.headers.set(name, value)`.
- `appendHeader` / `appendResponseHeader` / `appendResponseHeaders`: Migrate to `event.response.headers.append(name, value)`.
- `removeResponseHeader` / `clearResponseHeaders`: Migrate to `event.response.headers.delete(name)`
- `appendHeaders`: Migrate to `appendResponseHeaders`.
- `defaultContentType`: Migrate to `event.response.headers.set("content-type", type)`
- `getResponseStatus` / `getResponseStatusText` / `setResponseStatus`: Use `event.response.status` and `event.response.statusText`.

**Node.js:**

- `defineNodeListener`: Migrate to `defineNodeHandler`.
- `fromNodeMiddleware`: Migrate to `fromNodeHandler`.
- `toNodeListener`: Migrate to `toNodeHandler`.
- `createEvent`: (removed): Use Node.js adapter (`toNodeHandler(app)`).
- `fromNodeRequest`: (removed): Use Node.js adapter (`toNodeHandler(app)`).
- `promisifyNodeListener` (removed).
- `callNodeListener`: (removed).

**Web:**

- `fromPlainHandler`: (removed) Migrate to Web API.
- `toPlainHandler`: (removed) Migrate to Web API.
- `fromPlainRequest` (removed) Migrate to Web API or use `mockEvent` util for testing.
- `callWithPlainRequest` (removed) Migrate to Web API.
- `fromWebRequest`: (removed) Migrate to Web API.
- `callWithWebRequest`: (removed).

**Body:**

- `readRawBody`: Migrate to `event.request.text()` or `event.request.arrayBuffer()`.
- `getBodyStream` / `getRequestWebStream`: Migrate to `event.request.body`.
- `readFormData` / `readMultipartFormData` / `readFormDataBody`: Migrate to `event.request.formData()`.

**Utils:**

- `isStream`: Migrate to `instanceof ReadableStream`.
- `isWebResponse`: Migrate to `instanceof Response`.
- `splitCookiesString`: Use `splitSetCookieString` from [cookie-es](https://github.com/unjs/cookie-es).
- `MIMES`: (removed).

**Types:**

- `App`: Migrate to `H3`.
- `AppOptions`: Migrate to `H3Config`.
- `_RequestMiddleware`: Migrate to `RequestMiddleware`.
- `_ResponseMiddleware`: Migrate to `ResponseMiddleware`.
- `NodeListener`: Migrate to `NodeHandler`.
- `TypedHeaders`: Migrate to `RequestHeaders` and `ResponseHeaders`.
- `HTTPHeaderName`: Migrate to `RequestHeaderName` and `ResponseHeaderName`.
- `H3Headers`: Migrate to native `Headers`.
- `H3Response`: Migrate to native `Response`.
- `MultiPartData`: Migrate to native `FormData`.
- `RouteNode`: Migrate to `RouterEntry`.
  `CreateRouterOptions`: Migrate to `RouterOptions`.

Removed type exports: `WebEventContext`, `NodeEventContext`, `NodePromisifiedHandler`, `AppUse`, `Stack`, `InputLayer`, `InputStack`, `Layer`, `Matcher`, `PlainHandler`, `PlainRequest`, `PlainResponse`, `WebHandler`.
