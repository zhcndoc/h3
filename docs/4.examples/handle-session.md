# 处理会话

> 使用会话来记住你的用户。

会话是一种使用 cookies 记住用户的方法。这是一种非常常见的用户身份验证或保存用户数据的方法，例如他们的语言或网络偏好。

h3 提供了许多处理会话的工具：

- `useSession` 初始化会话并返回一个控制它的包装器。
- `getSession` 初始化或检索当前用户会话。
- `updateSession` 更新当前会话的数据。
- `clearSession` 清除当前会话。

大多数情况下，你将使用 `useSession` 来操作会话。

## 初始化会话

要初始化会话，你需要在 [事件处理器](/guide/event-handler) 中使用 `useSession`：

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
> 你必须提供一个密码来加密会话。

这将初始化一个会话并返回一个名为 `Set-Cookie` 的头信息，其中包含一个名为 `h3` 的 cookie 和加密内容。

如果请求包含名为 `h3` 的 cookie 或名为 `x-h3-session` 的头信息，则会话将使用 cookie 或头信息的内容进行初始化。

> [!NOTE]
> 头信息优先于 cookie。

## 从会话获取数据

要从会话获取数据，我们仍然使用 `useSession`。在底层，它将使用 `getSession` 来获取会话。

```js
import { useSession } from "h3";

app.use(async (event) => {
  const session = await useSession(event, {
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  return session.data;
});
```

数据存储在会话的 `data` 属性中。如果没有数据，将是一个空对象。

## 向会话添加数据

要向会话添加数据，我们仍然使用 `useSession`。在底层，它将使用 `updateSession` 来更新会话。

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
    ? "你好，世界！"
    : `你好，世界！你已经访问了这个页面 ${count} 次。`;
});
```

这里发生了什么？

我们尝试从请求中获取会话。如果没有会话，将创建一个新的会话。然后，我们递增会话的 `count` 属性，并用新值更新会话。最后，我们返回一条消息，显示用户访问页面的次数。

尝试多次访问该页面，你将看到你访问该页面的次数。

> [!NOTE]
> 如果你使用像 `curl` 这样的 CLI 工具来测试这个例子，你将看不到你访问该页面的次数，因为 CLI 工具不保存 cookies。你必须从响应中获取 cookie 并将其发送回服务器。

## 清除会话

要清除会话，我们仍然使用 `useSession`。在底层，它将使用 `clearSession` 来清除会话。

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

h3 将发送一个名为 `Set-Cookie` 的头信息，包含一个空的名为 `h3` 的 cookie，以清除会话。

## 选项

在使用 `useSession` 时，你可以将一个包含选项的对象作为第二个参数传递，以配置会话：

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
    maxAge: 60 * 60 * 24 * 7, // 7天
  });

  return session.data;
});
```
