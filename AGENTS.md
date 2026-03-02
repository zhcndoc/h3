<!-- NOTE: Keep this file updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# H3 - 代理指南

H3（读作 /eɪtʃθriː/）是一个为高性能和可移植性打造的极简 HTTP 框架。目前处于 **v2** 版本——基于 **Web 标准原语**（Request、Response、URL、Headers）的重大重写。

## 快速参考

```bash
# 安装
corepack enable && pnpm install

# 开发
pnpm dev                    # vitest 监听模式
pnpm vitest run <path>      # 运行指定测试
pnpm test                   # 全套测试（lint + 类型检查 + 覆盖率）
pnpm build                  # 用 obuild 构建
pnpm lint                   # oxlint + oxfmt --check
pnpm fmt                    # automd + oxlint --fix + oxfmt
pnpm typecheck              # tsgo --noEmit --skipLibCheck
pnpm bench:node             # Node.js 基准测试
pnpm bench:bun              # Bun 基准测试
```

## 架构

### 核心设计

- **优先 Web 标准**：基于原生 `Request`、`Response`、`URL`、`Headers`
- **多运行时支持**：Node.js、Bun、Deno、Cloudflare Workers、Service Workers、浏览器
- **极简核心**：2 个生产依赖（`rou3` 路由，`srvx` 服务器抽象）
- **基于处理器**：可组合的处理器 + 中间件，无重度 class 模式
- **类型安全**：全程严格的 TypeScript 泛型推断

### 关键类

| 类            | 文件               | 作用                                                         |
| ------------- | ------------------ | ------------------------------------------------------------ |
| `H3`          | `src/h3.ts`        | 主应用类（继承 `H3Core`），添加路由方法（get/post/put/delete/...） |
| `H3Event`     | `src/event.ts`     | 请求包装——用懒计算属性包装原生 Web `Request`（URL、上下文） |
| `HTTPError`   | `src/error.ts`     | 带状态码、数据、头部的结构化 HTTP 错误                       |
| `HTTPResponse`| `src/response.ts`  | 灵活的响应构建器                                             |

### 请求流程

1. 请求经过平台适配器进入（`src/_entries/*.ts`）
2. `H3.fetch()` 根据 `Request` 创建 `H3Event`
3. 执行全局 `onRequest` 钩子
4. 执行匹配的中间件链（基于路由/方法）
5. 路由处理器处理请求并返回值
6. `toResponse()` 将返回值转换为 `Response`（自动处理 JSON、流、Blob、原始值）
7. 运行全局 `onResponse` 钩子

## 项目结构

```
src/
├── index.ts              # 公共 API 导出
├── h3.ts                 # H3Core + H3 类
├── event.ts              # H3Event
├── handler.ts            # defineHandler、defineValidatedHandler 等
├── middleware.ts         # 中间件系统
├── response.ts           # toResponse、HTTPResponse、kNotFound、kHandled
├── error.ts              # HTTPError
├── adapters.ts           # Web/Node 处理器适配器
├── tracing.ts            # 跟踪插件（独立入口）
├── types/                # 类型定义
│   ├── h3.ts             # 应用类型（H3Config、H3Plugin、H3Route、HTTPMethod）
│   ├── handler.ts        # 处理器类型（EventHandler、Middleware）
│   ├── context.ts        # H3EventContext
│   └── _utils.ts         # 内部类型辅助
├── utils/                # 约 30 个工具模块（公共 API）
│   ├── request.ts        # getQuery、getRouterParams、getRequestURL 等
│   ├── response.ts       # redirect、noContent、html、iterable 等
│   ├── body.ts           # readBody、readValidatedBody、assertBodySize
│   ├── cookie.ts         # getCookie、setCookie、parseCookies、chunked cookies
│   ├── session.ts        # getSession、useSession、sealSession 等
│   ├── auth.ts           # requireBasicAuth、basicAuth
│   ├── cors.ts           # handleCors、appendCorsHeaders 等
│   ├── proxy.ts          # proxy、proxyRequest、fetchWithEvent
│   ├── ws.ts             # defineWebSocketHandler、defineWebSocket
│   ├── json-rpc.ts       # defineJsonRpcHandler、defineJsonRpcWebSocketHandler
│   ├── event-stream.ts   # createEventStream（SSE）
│   ├── static.ts         # serveStatic
│   ├── cache.ts          # handleCacheHeaders
│   ├── middleware.ts     # onRequest、onResponse、onError、bodyLimit
│   ├── route.ts          # defineRoute
│   ├── base.ts           # withBase
│   └── internal/         # 内部辅助（不导出）
│       ├── auth.ts, body.ts, cors.ts, encoding.ts 等
│       ├── iron-crypto.ts     # 会话封装加密
│       ├── standard-schema.ts # 标准数据校验
│       └── validate.ts
├── _entries/             # 平台特定入口点
│   ├── generic.ts        # Web Worker / 浏览器
│   ├── node.ts           # Node.js（带 serve()）
│   ├── bun.ts            # Bun
│   ├── deno.ts           # Deno
│   ├── cloudflare.ts     # Cloudflare Workers
│   ├── service-worker.ts # Service Workers
│   └── _common.ts        # 共享入口工具
└── _deprecated.ts        # 弃用导出（v1 兼容）

test/
├── _setup.ts             # 测试基础设施（describeMatrix、setupWebTest、setupNodeTest）
├── *.test.ts             # 约 30 个集成测试文件
├── unit/                 # 单元测试（含类型测试：types.test-d.ts）
├── bench/                # 基准测试（mitata）
└── fixture/              # 运行时特定测试用例
```

## 代码规范

### 风格

- **仅 ESM**——不使用 CommonJS
- 所有导入路径显式 `.ts` 扩展名
- **不使用桶文件**——直接从具体模块导入
- 内部文件用 `_` 前缀（如 `_deprecated.ts`、`_entries/`、`_utils.ts`）
- 内部辅助放在文件末尾或 `utils/internal/`
- 文件尽量短小——目标少于 200 行，超出则拆分
- 格式化工具：`oxfmt`（无配置，使用默认）
- 代码风格检查：`oxlint`（启用 `unicorn`, `typescript`, `oxc` 插件）

### 命名

- 符号常量使用 `k` 前缀（如 `kNotFound`、`kHandled`）
- 私有/不可枚举属性使用 `~` 前缀
- 真正的私有类字段使用 `#`
- 工厂函数用 `define*()` 命名（如 `defineHandler`、`defineMiddleware`、`defineWebSocketHandler`）
- 转换函数用 `to*()` 命名（如 `toResponse`、`toEventHandler`、`toWebHandler`）
- 适配器函数用 `from*()` 命名（如 `fromWebHandler`、`fromNodeHandler`）

### TypeScript

- 严格模式 + `isolatedDeclarations` + `verbatimModuleSyntax`
- `erasableSyntaxOnly: true`（不使用枚举和命名空间）
- Target/module：`ESNext` / `NodeNext`
- Lib：`["ESNext", "WebWorker", "DOM", "DOM.Iterable"]`
- 大量泛型用于处理器的类型推断

### 响应处理

处理器直接返回值——无 `res.send()` 模式：

- 返回 `string` → 文本响应
- 返回 `object` → JSON 响应
- 返回 `Response` / `HTTPResponse` → 直接响应
- 返回 `ReadableStream` / `Blob` / `File` → 流响应
- 返回 `kNotFound` 符号 → 404
- 返回 `kHandled` 符号 → 已处理（SSE、WebSocket 等）

## 测试

### 框架

- 使用 **Vitest** v4+ 和 **v8** 覆盖率
- 矩阵测试：每个测试在 `web` 和 `node` 两个模式下均运行

### 编写测试

```typescript
import { describeMatrix } from "./_setup.ts";

describeMatrix("feature name", (ctx, { it, expect }) => {
  it("does something", async () => {
    ctx.app.get("/test", () => "hello");
    const res = await ctx.fetch("/test");
    expect(await res.text()).toBe("hello");
  });
});
```

主要模式：

- 用 `describeMatrix` 跨运行时测试
- `ctx.app` 是每个测试一个新的 `H3` 实例（通过 `beforeEach` 创建）
- `ctx.fetch` 处理 web/node 的 URL 解析
- `ctx.errors` 追踪未处理错误（在 `afterEach` 自动断言）
- 使用 `it.skipIf(ctx.target === "node")` 跳过特定运行时测试

### 运行测试

```bash
pnpm vitest run test/body.test.ts        # 单文件
pnpm vitest run test/unit/               # 单元测试
pnpm dev                                 # 监听模式（所有）
pnpm test                                # 全套：lint + 类型检查 + 覆盖率
```

### 修复 Bug 流程

1. 编写回归测试，能重现该 Bug
2. 确认测试**失败**前不改代码
3. 修正实现（改动最小化）
4. 确认测试**通过**
5. 运行更广泛的测试套件，确保无回归

## 构建

- 使用 **obuild** 和 Rolldown 打包器
- 6 个平台入口 + `tracing.ts` 独立入口
- 启用代码拆分（生成 `h3-[hash].mjs` 代码块）
- 自定义插件剥离注释（保留 `#/@` 注解）
- 输出：`dist/_entries/*.mjs` + `dist/*.d.mts`

### 包导出

```
h3           → 运行时自动解析（deno/bun/workerd/node/default）
h3/node      → Node.js（带 serve()）
h3/bun       → Bun 运行时
h3/deno      → Deno 运行时
h3/cloudflare → Cloudflare Workers
h3/service-worker → Service Workers
h3/generic   → 通用 Web 标准
h3/tracing   → 跟踪插件
```

## 依赖

| 依赖       | 作用                         |
| ---------- | ---------------------------- |
| `rou3`     | 路由匹配引擎                 |
| `srvx`     | 服务器抽象（多运行时）       |
| `crossws`  | WebSocket 抽象（可选对等依赖）|

## 贡献最佳实践

- 优先使用 Web 标准 API，避免运行时特定 API
- 保持核心极简——新增工具，但不增加核心复杂度
- 使用 `describeMatrix` 跨运行时测试
- 处理器返回值，不直接修改响应对象
- 使用 `defineHandler`/`defineMiddleware` 保证类型安全
