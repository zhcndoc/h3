<<<<<<< HEAD
# 验证数据
=======
---
icon: ph:arrow-right
---

# Validate Data
>>>>>>> origin/upstream

> 在处理数据之前，确保数据是有效和安全的。

当你从用户那里接收数据时，必须对其进行验证。验证意味着接收到的数据的形状必须与预期的形状匹配。这一点很重要，因为你不能信任用户的输入。

> [!WARNING]
> 不要使用通用类型作为验证。提供像 `readJSONBody` 这样的工具接口并不是验证。你必须在使用数据之前先验证它。

## 验证的工具

h3 提供了一些工具来帮助你处理数据验证。你将能够验证：

- 查询字符串使用 `getValidatedQuery`
- 路由参数使用 `getValidatedRouterParams`
- 请求体使用 `readValidatedJSONBody`

要验证数据，你可以使用任何你想要的验证库。h3 不提供任何验证库，如 [Zod](https://zod.dev)、[joi](https://joi.dev) 或 [myzod](https://github.com/davidmdm/myzod)。

> [!WARNING]
> h3 是与运行时无关的。这意味着你可以在 [任何运行时](/adapters) 中使用它。但某些验证库并不与所有运行时兼容。

让我们看看如何使用 [Zod](https://zod.dev) 进行数据验证。

在以下示例中，我们将使用以下模式：

```js
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(3).max(20),
  age: z.number({ coerce: true }).positive().int(),
});
```

## 验证查询

你可以使用 `getValidatedQuery` 来验证查询并获取结果，从而替代 `getQuery`：

```js
import { getValidatedQuery } from "h3";

app.use(async (event) => {
  const query = await getValidatedQuery(event, userSchema.parse);
  return `Hello ${query.name}! You are ${query.age} years old.`;
});
```

> [!NOTE]
> 你可以使用 `safeParse` 替代 `parse` 来获取部分查询对象，并且如果查询无效则不会抛出错误。

如果你向这个事件处理程序发送一个有效的请求，如 `/?name=John&age=42`，你将得到如下响应：

```txt
Hello John! You are 42 years old.
```

如果你发送了一个无效请求且验证失败，h3 将抛出一个 `400 Validation Error` 错误。在错误的数据中，你将找到验证错误，可以在客户端上使用这些错误来向用户显示友好的错误信息。

## 验证参数

你可以使用 `getValidatedRouterParams` 来验证参数并获取结果，从而替代 `getRouterParams`：

```js
import { getValidatedRouterParams } from "h3";

router.use(
  // 你必须使用路由器才能使用参数
  "/hello/:name/:age",
  async (event) => {
    const params = await getValidatedRouterParams(event, userSchema.parse);
    return `Hello ${params.name}! You are ${params.age} years old!`;
  },
);
```

> [!NOTE]
> 你可以使用 `safeParse` 替代 `parse` 来获取部分参数对象，并且如果参数无效则不会抛出错误。

如果你向这个事件处理程序发送一个有效请求，如 `/hello/John/42`，你将得到如下响应：

```txt
Hello John! You are 42 years old.
```

如果你发送了一个无效请求且验证失败，h3 将抛出一个 `400 Validation Error` 错误。在错误的数据中，你将找到验证错误，可以在客户端上使用这些错误来向用户显示友好的错误信息。

## 验证请求体

你可以使用 `readValidatedJSONBody` 来验证请求体并获取结果，从而替代 `readJSONBody`：

```js
import { readValidatedJSONBody } from "h3";

app.use(async (event) => {
  const body = await readValidatedJSONBody(event, userSchema.parse);
  return `Hello ${body.name}! You are ${body.age} years old.`;
});
```

> [!NOTE]
> 你可以使用 `safeParse` 替代 `parse` 来获取部分请求体对象，并且如果请求体无效则不会抛出错误。

如果你向这个事件处理程序发送一个有效的 POST 请求，你将得到如下响应：

```txt
Hello John! You are 42 years old.
```

如果你发送了一个无效请求且验证失败，h3 将抛出一个 `400 Validation Error` 错误。在错误的数据中，你将找到验证错误，可以在客户端上使用这些错误来向用户显示友好的错误信息。
