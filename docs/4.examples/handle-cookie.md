<<<<<<< HEAD
# 处理 Cookies
=======
---
icon: ph:arrow-right
---

# Cookies
>>>>>>> origin/upstream

> 使用 cookies 在客户端存储数据。

使用 h3 处理 cookies 非常简单。有三个工具来处理 cookies：

- `setCookie` 用于将 cookies 附加到响应。
- `getCookie` 用于从请求中获取 cookies。
- `deleteCookie` 用于从响应中清除 cookies。

## 设置 Cookies

要设置一个 cookie，您需要在事件处理程序中使用 `setCookie`：

```ts
import { setCookie } from "h3";

app.use(async (event) => {
  setCookie(event, "name", "value", { maxAge: 60 * 60 * 24 * 7 });
  return "";
});
```

在选项中，您可以配置 [cookie 标志](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)：

- `maxAge` 用于设置 cookie 的过期时间（以秒为单位）。
- `expires` 用于设置 cookie 的过期时间（以 `Date` 对象的形式）。
- `path` 用于设置 cookie 的路径。
- `domain` 用于设置 cookie 的域名。
- `secure` 用于设置 cookie 的 `Secure` 标志。
- `httpOnly` 用于设置 cookie 的 `HttpOnly` 标志。
- `sameSite` 用于设置 cookie 的 `SameSite` 标志。

:read-more{to="/utils"}

## 获取 Cookies

要获取一个 cookie，您需要在事件处理程序中使用 `getCookie`。

```ts
import { getCookie } from "h3";

app.use(async (event) => {
  const name = getCookie(event, "name");

  // 做一些事情...

  return "";
});
```

如果 cookie 存在，这将返回 cookie 的值，否则返回 `undefined`。

## 删除 Cookies

要删除一个 cookie，您需要在事件处理程序中使用 `deleteCookie`：

```ts
import { deleteCookie } from "h3";

app.use(async (event) => {
  deleteCookie(event, "name");
  return "";
});
```

工具 `deleteCookie` 是在 `setCookie` 的封装，值设置为 `""`，并将 `maxAge` 设置为 `0`。

这将从客户端删除该 cookie。
