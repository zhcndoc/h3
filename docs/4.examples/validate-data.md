---
icon: ph:arrow-right
---

# 验证数据

> 在处理数据之前，确保您的数据是有效且安全的。

当您在服务器端接收到数据时，必须对其进行验证。所谓验证，是指接收的数据结构必须与预期结构相匹配。这很重要，因为您无法信任来自未知来源的数据，比如用户或外部 API。

> [!WARNING]
> 不要使用类型泛型来作为验证。为类似 `readBody` 这样的工具提供接口并不是验证。您必须在使用数据之前进行验证。

## 验证辅助工具

h3 提供了一些辅助工具，帮助您处理数据验证。您可以验证：

- 使用 `getValidatedQuery` 验证查询参数
- 使用 `getValidatedRouterParams` 验证路由参数
- 使用 `readValidatedBody` 验证请求体

h3 本身不提供任何验证库，但支持来自 **Standard-Schema** 兼容库的 schema，比如：[Zod](https://zod.dev)、[Valibot](https://valibot.dev)、[ArkType](https://arktype.io/) 等等……（所有兼容库请参考 [它们的官方仓库](https://github.com/standard-schema/standard-schema)）。如果您想使用不兼容 Standard-Schema 的验证库，仍然可以使用，但您需要调用该库自身提供的解析函数（详情请参阅下方的 [安全解析](#safe-parsing) 部分）。

> [!WARNING]
> h3 与运行时无关。这意味着您可以在 [任何运行时](/adapters) 中使用它。但某些验证库并不兼容所有运行时。

下面让我们看看如何使用 [Zod](https://zod.dev) 和 [Valibot](https://valibot.dev) 进行数据验证。

### 验证路由参数

您可以使用 `getValidatedRouterParams` 来验证路由参数并获取结果，替代 `getRouterParams`：

```js
import { getValidatedRouterParams } from "h3";
import * as z from "zod";
import * as v from "valibot";

// 使用 Zod 示例
const contentSchema = z.object({
  topic: z.string().min(1),
  uuid: z.string().uuid(),
});
// 使用 Valibot 示例
const contentSchema = v.object({
  topic: v.pipe(v.string(), v.nonEmpty()),
  uuid: v.pipe(v.string(), v.uuid()),
});

router.use(
  // 您必须使用一个路由以使用参数
  "/content/:topic/:uuid",
  async (event) => {
    const params = await getValidatedRouterParams(event, contentSchema);
    return `您正在查找 topic 为 "${params.topic}" 且 uuid 为 "${params.uuid}" 的内容。`;
  },
);
```

如果您向该事件处理程序发送一个有效请求，例如 `/content/posts/123e4567-e89b-12d3-a456-426614174000`，您将得到如下响应：

```txt
您正在查找 topic 为 "posts" 且 uuid 为 "123e4567-e89b-12d3-a456-426614174000" 的内容。
```

如果您发送了无效请求且验证失败，h3 会抛出 `400 Validation Error` 错误。在错误数据中，您会找到验证错误信息，您可以在客户端使用它们向用户展示友好的错误提示。

### 验证查询参数

您可以使用 `getValidatedQuery` 来验证查询参数并获取结果，替代 `getQuery`：

```js
import { getValidatedQuery } from "h3";
import * as z from "zod";
import * as v from "valibot";

// 使用 Zod 示例
const stringToNumber = z
  .string()
  .regex(/^\d+$/, "必须是数字字符串")
  .transform(Number);
const paginationSchema = z.object({
  page: stringToNumber.optional().default(1),
  size: stringToNumber.optional().default(10),
});

// 使用 Valibot 示例
const stringToNumber = v.pipe(
  v.string(),
  v.regex(/^\d+$/, "必须是数字字符串"),
  v.transform(Number),
);
const paginationSchema = v.object({
  page: v.optional(stringToNumber, 1),
  size: v.optional(stringToNumber, 10),
});

app.use(async (event) => {
  const query = await getValidatedQuery(event, paginationSchema);
  return `您当前在第 ${query.page} 页，每页显示 ${query.size} 条内容。`;
});
```

如您所见，与 `getValidatedRouterParams` 示例相比，我们可以利用验证库对传入数据进行转换。例如这里，将数字的字符串形式转换为真正的数字，对于像内容分页这样的场景非常有用。

如果您向该事件处理程序发送一个有效请求，如 `/?page=2&size=20`，您将得到如下响应：

```txt
您当前在第 2 页，每页显示 20 条内容。
```

如果您发送无效请求且验证失败，h3 会抛出 `400 Validation Error` 错误。在错误数据中，您会找到验证错误信息，您可以在客户端使用它们向用户展示友好的错误提示。

### 验证请求体

您可以使用 `readValidatedBody` 来验证请求体并获取结果，替代 `readBody`：

```js
import { readValidatedBody } from "h3";
import { z } from "zod";
import * as v from "valibot";

// 使用 Zod 示例
const userSchema = z.object({
  name: z.string().min(3).max(20),
  age: z.number({ coerce: true }).positive().int(),
});

// 使用 Valibot 示例
const userSchema = v.object({
  name: v.pipe(v.string(), v.minLength(3), v.maxLength(20)),
  age: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

app.use(async (event) => {
  const body = await readValidatedBody(event, userSchema);
  return `你好 ${body.name}！你今年 ${body.age} 岁。`;
});
```

如果您发送一个带有如下 JSON 请求体的有效 POST 请求：

```json
{
  "name": "John",
  "age": 42
}
```

您将得到如下响应：

```txt
你好 John！你今年 42 岁。
```

如果您发送无效请求且验证失败，h3 会抛出 `400 Validation Error` 错误。在错误数据中，您会找到验证错误信息，您可以在客户端使用它们向用户展示友好的错误提示。

## 安全解析

默认情况下，如果直接将 schema 作为第二个参数传给任何验证辅助工具（`getValidatedRouterParams`、`getValidatedQuery` 和 `readValidatedBody`），当验证失败时会抛出 `400 Validation Error` 错误。但在某些情况下，您可能想自己处理验证错误。这时，您应该根据所使用的验证库，传入其提供的实际安全验证函数作为第二个参数。

回到第一示例中 `getValidatedRouterParams`，对于 Zod 会是这样：

```ts
import { getValidatedRouterParams } from "h3";
import { z } from "zod/v4";

const contentSchema = z.object({
  topic: z.string().min(1),
  uuid: z.string().uuid(),
});

router.use("/content/:topic/:uuid", async (event) => {
  const params = await getValidatedRouterParams(event, contentSchema.safeParse);
  if (!params.success) {
    // 处理验证错误
    return `验证失败：\n${z.prettifyError(params.error)}`;
  }
  return `您正在查找 topic 为 "${params.data.topic}" 且 uuid 为 "${params.data.uuid}" 的内容。`;
});
```

而对于 Valibot 则是这样：

```ts
import { getValidatedRouterParams } from "h3";
import * as v from "valibot";

const contentSchema = v.object({
  topic: v.pipe(v.string(), v.nonEmpty()),
  uuid: v.pipe(v.string(), v.uuid()),
});

router.use("/content/:topic/:uuid", async (event) => {
  const params = await getValidatedRouterParams(
    event,
    v.safeParser(contentSchema),
  );
  if (!params.success) {
    // 处理验证错误
    return `验证失败：\n${v.summarize(params.issues)}`;
  }
  return `您正在查找 topic 为 "${params.output.topic}" 且 uuid 为 "${params.output.uuid}" 的内容。`;
});
```