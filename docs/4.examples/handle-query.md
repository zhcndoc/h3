---
icon: ph:arrow-right
---

# HTTP `QUERY` 方法

> 接受在请求体中携带查询内容的安全、可缓存请求。

[HTTP `QUERY` 方法（RFC 10008）](https://www.rfc-editor.org/rfc/rfc10008)类似于 `GET` —— **安全、幂等且可缓存** —— 但会在请求 **体** 中通过 `Content-Type` 携带查询内容。它是对“我需要使用 GET，但我的查询内容对于 URL 来说过大或结构过于复杂”这一需求的标准解决方案。

H3 通过 [`app.query()`](/guide/basics/routing#http-query-method) 将 `QUERY` 作为一等方法提供，并额外提供两个辅助工具。

## 注册 `QUERY` 处理器

读取请求体的方式与处理 `POST` 一样：

```ts
import { readBody } from "h3";

app.query("/books", async (event) => {
  const query = await readBody(event, { type: "text" });
  return runSearch(query);
});
```

由于 `QUERY` 携带可由攻击者控制的请求体，[请求体大小限制](/utils/request#assertbodysizeevent-limit)与 `POST` 一样适用。

## 广告支持的格式

使用 [`appendAcceptQuery`](/utils/request#appendacceptqueryevent-mediatypes) 告知客户端资源理解哪些查询格式。它会设置 `Accept-Query` 响应标头（一个 [结构化字段](https://www.rfc-editor.org/rfc/rfc8941) 列表），也可以在普通的 `GET` 请求中设置，以便客户端在发送 `QUERY` 请求之前发现可用格式：

```ts
import { appendAcceptQuery } from "h3";

app.get("/books", (event) => {
  appendAcceptQuery(event, ["application/sql", "application/jsonpath"]);
  // Accept-Query: application/sql, application/jsonpath
  return "Send a QUERY request with a SQL or JSONPath body.";
});
```

## 验证 `Content-Type`

使用 [`requireContentType`](/utils/request#requirecontenttypeevent-acceptedtypes) 强制执行 RFC 的错误语义。它返回匹配的媒体类型，或抛出 `400`（缺失）、`415`（不支持）或 `422`（格式错误）：

```ts
import { requireContentType, readBody } from "h3";

app.query("/books", async (event) => {
  const type = requireContentType(event, ["application/sql", "application/jsonpath"]);
  const query = await readBody(event, { type: "text" });
  return runQuery(type, query);
});
```

## 提供可缓存的 `GET` 替代方案

`QUERY` 响应无法通过 URL 寻址，因此浏览器和 CDN 无法缓存它。RFC 10008 建议通过 `Content-Location` 标头将客户端指向一个等效且可缓存的 `GET`。使用稳定的 ID 保存结果，并让客户端通过普通的、可由 HTTP 缓存的 `GET` 重复查询：

```ts
app.query("/books", async (event) => {
  const result = runQuery(type, query);
  const id = queryId(type, query); // 查询的稳定哈希值
  cache.set(id, result);
  event.res.headers.set("content-location", `/books/${id}`);
  return result;
});
```

## 完整示例

一个自包含、可运行的演示——一个 `/books` 资源，接受类似 SQL 和 JSONPath 的查询，验证 `Content-Type`，并提供一个可缓存的 `GET` 替代方案。同时，它还会在 `/` 提供一个小型交互页面。

::read-more{to="https://github.com/h3js/h3/tree/main/examples/query.mjs"}
查看完整的 [`examples/query.mjs`](https://github.com/h3js/h3/tree/main/examples/query.mjs) 源代码，或使用 `node examples/query.mjs` 在本地运行。
::

> [!NOTE]
> 与 `GET` 不同，`QUERY` **不在 CORS 安全列表中**，因此浏览器会发送预检请求。如果你向 [`handleCors`](/utils/security#handlecorsevent-options) 传入显式的 `methods` 允许列表，请加入 `"QUERY"`。
