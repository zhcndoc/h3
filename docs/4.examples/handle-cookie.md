---
icon: ph:arrow-right
---

# Cookies

> 使用 Cookies 在客户端存储数据。

使用 H3 处理 Cookies 非常简单。有三个工具来处理 Cookies：

- `setCookie` 用于将 Cookie 附加到响应中。
- `getCookie` 用于从请求中获取 Cookie。
- `deleteCookie` 用于从响应中清除 Cookie。

## 设置 Cookie

要设置 Cookie，需要在事件处理器中使用 `setCookie`：

```ts
import { setCookie } from "h3";

app.use(async (event) => {
  setCookie(event, "name", "value", { maxAge: 60 * 60 * 24 * 7 });
  return "";
});
```

在选项中，可以配置[Cookie 标志](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)：

- `maxAge` 设置 Cookie 的过期时间（秒）。
- `expires` 使用 `Date` 对象设置 Cookie 的过期时间。
- `path` 设置 Cookie 的路径。
- `domain` 设置 Cookie 的域。
- `secure` 设置 Cookie 的 `Secure` 标志。
- `httpOnly` 设置 Cookie 的 `HttpOnly` 标志。
- `sameSite` 设置 Cookie 的 `SameSite` 标志。

:read-more{to="/utils"}

## 获取 Cookie

要获取 Cookie，需要在事件处理器中使用 `getCookie`。

```ts
import { getCookie } from "h3";

app.use(async (event) => {
  const name = getCookie(event, "name");

  // 执行相关操作...

  return "";
});
```

如果 Cookie 存在，将返回其值，否则返回 `undefined`。

## 删除 Cookie

要删除 Cookie，需要在事件处理器中使用 `deleteCookie`：

```ts
import { deleteCookie } from "h3";

app.use(async (event) => {
  deleteCookie(event, "name");
  return "";
});
```

`deleteCookie` 工具是对 `setCookie` 的封装，设置的值为 `""`，`maxAge` 为 `0`。

这会从客户端删除该 Cookie。