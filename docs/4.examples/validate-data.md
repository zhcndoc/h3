---
icon: ph:arrow-right
---

# 验证数据

> 在处理数据之前，确保您的数据是有效且安全的。

当您在服务器上接收用户数据时，必须对其进行验证。验证意味着接收到的数据的结构必须符合预期的结构。这很重要，因为您无法信任用户输入。

> [!WARNING]
> 不要仅使用泛型作为验证手段。为诸如 `readJSONBody` 这样的工具提供接口并不等同于验证。您必须在使用数据之前对其进行验证。

## 验证辅助工具

h3 提供了一些辅助工具，帮助您处理数据验证。您可以验证：

- 使用 `getValidatedQuery` 验证查询参数
- 使用 `getValidatedRouterParams` 验证路由参数
- 使用 `readValidatedJSONBody` 验证请求体

您可以使用任何您喜欢的验证库来验证数据。h3 本身不提供任何像 [Zod](https://zod.dev)、[joi](https://joi.dev) 或 [myzod](https://github.com/davidmdm/myzod) 这样的验证库。

> [!WARNING]
> h3 是运行时无关的。这意味着您可以在 [任何运行时](/adapters) 中使用它。但某些验证库不兼容所有运行时。

下面以 [Zod](https://zod.dev) 为例，演示如何验证数据。

在接下来的示例中，我们将使用如下的 schema：

```js
import { z } from "zod";

const userSchema = z.object({
  name: z.string().min(3).max(20),
  age: z.number({ coerce: true }).positive().int(),
});
```

## 验证查询参数

您可以使用 `getValidatedQuery` 来验证查询参数并获取结果，替代 `getQuery`：

```js
import { getValidatedQuery } from "h3";

app.use(async (event) => {
  const query = await getValidatedQuery(event, userSchema.parse);
  return `Hello ${query.name}! You are ${query.age} years old.`;
});
```

> [!NOTE]
> 您也可以使用 `safeParse` 替代 `parse`，以获得部分查询对象，并且在查询无效时不会抛出错误。

如果您向该事件处理器发送一个有效请求，比如 `/?name=John&age=42`，您将得到如下响应：

```txt
Hello John! You are 42 years old.
```

如果您发送一个无效请求且验证失败，h3 会抛出 `400 Validation Error` 错误。在错误数据中，您会找到验证错误信息，您可以在客户端使用这些信息向用户显示友好的错误消息。

## 验证路由参数

您可以使用 `getValidatedRouterParams` 来验证路由参数并获取结果，替代 `getRouterParams`：

```js
import { getValidatedRouterParams } from "h3";

router.use(
  // 您必须使用路由才能使用参数
  "/hello/:name/:age",
  async (event) => {
    const params = await getValidatedRouterParams(event, userSchema.parse);
    return `Hello ${params.name}! You are ${params.age} years old!`;
  },
);
```

> [!NOTE]
> 您也可以使用 `safeParse` 替代 `parse`，以获得部分路由参数对象，并且在参数无效时不会抛出错误。

如果您向该事件处理器发送一个有效请求，比如 `/hello/John/42`，您将得到如下响应：

```txt
Hello John! You are 42 years old.
```

如果您发送一个无效请求且验证失败，h3 会抛出 `400 Validation Error` 错误。在错误数据中，您会找到验证错误信息，您可以在客户端使用这些信息向用户显示友好的错误消息。

## 验证请求体

您可以使用 `readValidatedJSONBody` 来验证请求体并获取结果，替代 `readJSONBody`：

```js
import { readValidatedJSONBody } from "h3";

app.use(async (event) => {
  const body = await readValidatedJSONBody(event, userSchema.parse);
  return `Hello ${body.name}! You are ${body.age} years old.`;
});
```

> [!NOTE]
> 您也可以使用 `safeParse` 替代 `parse`，以获得部分请求体对象，并且在请求体无效时不会抛出错误。

如果您向该事件处理器发送一个有效的 POST 请求，将得到如下响应：

```txt
Hello John! You are 42 years old.
```

如果您发送一个无效请求且验证失败，h3 会抛出 `400 Validation Error` 错误。在错误数据中，您会找到验证错误信息，您可以在客户端使用这些信息向用户显示友好的错误消息。