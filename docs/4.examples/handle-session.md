---
icon: ph:arrow-right
---

# 会话

> 通过会话记住您的用户。

会话是一种通过 cookie 记住用户的方法。这是在网络上认证用户或保存关于他们的数据（例如其语言或偏好设置）的非常常见的方法。

H3 提供了许多用于处理会话的工具：

- `useSession` 初始化一个会话并返回一个用于控制会话的包装器。
- `getSession` 初始化或获取当前用户会话。
- `updateSession` 更新当前会话的数据。
- `clearSession` 清除当前会话。

大多数情况下，您将使用 `useSession` 来操作会话。

## 初始化会话

要初始化会话，您需要在[事件处理器](/guide/handler)中使用 `useSession`：

```js
import { useSession } from "h3";

app.use(async (event) => {
  const session = await useSession(event, {
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  // 做一些事情...
});
```

> [!WARNING]
> 您必须提供一个密码来加密会话。

这将初始化一个会话并返回一个包含名为 `h3` 的 cookie 和加密内容的 `Set-Cookie` 头。

如果请求中包含名为 `h3` 的 cookie 或名为 `x-h3-session` 的头部，会话将使用该 cookie 或头部的内容进行初始化。

> [!NOTE]
> 头部优先于 cookie。

## 从会话中获取数据

要从会话中获取数据，我们仍然使用 `useSession`。在内部，它会使用 `getSession` 来获取会话。

```js
import { useSession } from "h3";

app.use(async (event) => {
  const session = await useSession(event, {
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  return session.data;
});
```

数据存储在会话的 `data` 属性中。如果没有数据，它将是一个空对象。

## 向会话添加数据

要向会话添加数据，我们仍然使用 `useSession`。在内部，它会使用 `updateSession` 来更新会话。

```js
import { useSession } from "h3";

app.use(async (event) => {
  const session = await useSession(event, {
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  const count = (session.data.count || 0) + 1;
  await session.update({
    count: count,
  });

  return count === 0
    ? "Hello world!"
    : `Hello world! 您已经访问此页面 ${count} 次。`;
});
```

这里发生了什么？

我们尝试从请求中获取一个会话。如果没有会话，将创建一个新的。然后，我们递增会话的 `count` 属性，并用新值更新会话。最后，我们返回一条显示用户访问页面次数的消息。

尝试多次访问该页面，您将看到您访问的次数。

> [!NOTE]
> 如果您使用类似 `curl` 的命令行工具测试此示例，您将看不到访问次数，因为命令行工具不会保存 cookie。您必须从响应中获取 cookie 并回传给服务器。

## 清除会话

要清除会话，我们仍然使用 `useSession`。在内部，它会使用 `clearSession` 来清除会话。

```js
import { useSession } from "h3";

app.use("/clear", async (event) => {
  const session = await useSession(event, {
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  await session.clear();

  return "会话已清除";
});
```

H3 将发送一个带有空的名为 `h3` 的 cookie 的 `Set-Cookie` 头，以清除会话。

## 选项

调用 `useSession` 时，您可以传递一个带有选项的对象作为第二个参数来配置会话：

```js
import { useSession } from "h3";

app.use(async (event) => {
  const session = await useSession(event, {
    name: "my-session",
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    },
    maxAge: 60 * 60 * 24 * 7, // 7 天
  });

  return session.data;
});
```