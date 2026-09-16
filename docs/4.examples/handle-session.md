---
icon: ph:arrow-right
---

# 会话

> 通过会话记住您的用户。

会话是一种通过 cookie 记住用户的方法。这是在网络上认证用户或保存关于他们的数据（例如其语言或偏好设置）的非常常见的方法。

H3 提供了许多用于处理会话的工具：

- `useSession` 初始化一个会话，并返回一个用于控制它的包装器
- `getSession` 获取当前用户会话，但不会启动会话
- `updateSession` 更新当前会话的数据
- `clearSession` 清除当前会话

大多数情况下，您将使用 `useSession` 来操作会话。

## 初始化会话

要初始化会话，您需要在[事件处理器](/guide/basics/handler)中使用 `useSession`：

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
> `password` 会对每个会话 cookie 进行加密，其**熵是实际的安全边界**。被窃取的会话 cookie 会以明文形式携带盐值和完整性摘要，因此弱密码或容易猜测的密码可能会遭到离线暴力破解——增加 PBKDF2 迭代次数只会减慢破解速度，并不能修复低熵密钥。请始终使用密码学安全的随机源生成密码，例如：
>
> ```sh
> node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
> ```
>
> 下面的示例使用硬编码值以保持可读性，但在实际应用中，请从环境变量（例如 `process.env.SESSION_PASSWORD`）中加载一个随机生成的、至少包含 32 个字符的密钥，并且绝不要将其提交到源代码管理系统中。容易猜测的密码短语（即使长度 ≥32 个字符）也不安全。

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

  return count === 0 ? "Hello world!" : `Hello world! 您已经访问此页面 ${count} 次。`;
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

除 `password` 外，每个选项都是可选的。`name` 选项值得特别说明：它会设置用于存储会话的 cookie，默认值为 `h3`。H3 还会从一个由 `name` 派生的请求头中读取会话，并将其规范化为小写，格式为 `x-${name.toLowerCase()}-session`，因此默认名称 `h3` 会生成前面看到的 `x-h3-session` 请求头。像 `MyApp` 这样混合大小写的 `name` 仍然会解析为小写的 `x-myapp-session` 请求头，而 cookie 会保留原始大小写。正因为这个默认值，前面的示例才会设置一个名为 `h3` 的 cookie。

> [!NOTE]
> 会话 cookie 的默认值为 `secure: true`、`httpOnly: true`、`sameSite: "lax"` 和 `path: "/"`。这些选项中的任何一个都可以通过 `cookie` 进行覆盖。

> [!NOTE]
> `secure: true` 选项会告知浏览器仅通过 HTTPS 存储和发送 cookie。在使用普通 HTTP 进行本地开发时，符合规范的浏览器（尤其是 Safari 和 iOS，以及某些本地域名下的 Chrome）会静默丢弃 cookie，因此会话将无法持久化。要解决此问题，请在本地开发期间设置 `cookie: { secure: false }`。

## 过期

会话有两个独立的过期控制选项，您可以单独使用其中一个，也可以同时使用两个：

- `maxAge` 是一个**绝对**生命周期，从会话创建时开始计算。无论用户多么活跃，达到该时限后都会过期
- `idleTimeout` 是一个**滑动**生命周期，从上一次请求开始计算。活跃用户会保持登录状态；闲置用户会退出登录

```js
const session = await useSession(event, {
  password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  idleTimeout: 60 * 30, // signed out after 30 minutes of inactivity...
  maxAge: 60 * 60 * 24 * 7, // ...and after 7 days regardless
});
```

设置 `idleTimeout` 后，H3 会通过重新密封会话 cookie 来向后延长闲置窗口，并将重新密封的时间戳写入其中。`createdAt` 保持不变，这使得 `maxAge` 仍然可以作为上层的硬性上限。cookie 的 `Expires` 会设置为最先到期的那个限制。

如果您使用过 `express-session` 或 `koa-session`，`idleTimeout` 就是它们的 `rolling` 选项。不同之处在于，它使用自身的持续时间，而不是重新解释 `maxAge`，因此启用它不会牺牲绝对时限。

重新密封是会话中开销较大的部分，因此 H3 不会在每次请求时都进行重新密封：只有在窗口使用时间超过一半后才会再次重新密封，而更新会话也会被视为一次重新密封。因此，活跃用户永远不会退出登录，但记录的最后访问时间可能会比实际时间最多滞后半个窗口：

```js
// idleTimeout: 60 * 30
// Sign-out happens 15 to 30 minutes after the last request, never later.
```

如果您需要将该范围中较短的一端作为实际限制，请将 `idleTimeout` 减半。

> [!NOTE]
> 只有 cookie 会话会滑动延长。通过 `x-{name}-session` 头发送的会话无法重新密封，因此会在其密封签发后的 `idleTimeout` 时间过期。

> [!IMPORTANT]
> 由于会话存在于 cookie 中，仅读取会话的请求在滑动窗口时也会将其写回。如果此类请求与写入会话的请求发生重叠，则浏览器最后应用哪个响应，哪个响应就会生效，因此写入操作可能会丢失。不使用 `idleTimeout` 时，只读请求不会设置 cookie，也不会覆盖并发写入。

> [!NOTE]
> 滑动窗口的请求需要额外进行一次密封，并会在其响应中添加 `Set-Cookie` 头——共享缓存和 CDN 通常会拒绝存储此类响应。在节流窗口内仅读取会话的请求完全不会设置 cookie。

会话 cookie 也会应用于错误响应，因此抛出错误的请求仍会滑动窗口，并且仍会持久化在该请求期间创建的会话。

## 使用多个会话

由于每个会话都存储在自己的 `name` 下，你可以在同一个请求上运行多个彼此独立的会话。它们会保存在不同的 cookie 中，且永远不会互相覆盖，这对于将无关的事项分开很有用，例如一个长期存在的认证会话和一个短暂的闪现消息：

```js
import { useSession } from "h3";

app.use(async (event) => {
  const auth = await useSession(event, {
    name: "auth",
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  const flash = await useSession(event, {
    name: "flash",
    password: "80d42cfb-1cd2-462c-8f17-e3237d9027e9",
  });

  await flash.update({ message: "已保存！" });

  // `auth` 和 `flash` 由不同的 cookie 支持，因此它们会保持独立
  return { user: auth.data.user, flash: flash.data.message };
});
```

> [!NOTE]
> 为每个会话使用不同的 `name`。两个共享同一个 `name` 的会话也会共享同一个 cookie，因此最后一次写入的内容会生效。
