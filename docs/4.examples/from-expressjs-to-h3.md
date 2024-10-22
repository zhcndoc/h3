# 从 Express.js 到 h3

> 通过各种示例，让我们看看如果你熟悉 Express.js，使用 h3 是多么简单。

在本指南中，我们将重现许多来自 [Express.js 文档](https://expressjs.com/en/starter/examples.html) 的示例，以向你展示如何使用 h3 做同样的事情。

> [!NOTE]
> 如果你不熟悉 Express.js，你可以安全地跳过本指南。

我们的目的是向你展示 h3 与 Express.js 是多么相似。一旦你理解了这些相似之处，如果你对 Express.js 有一定的了解，就可以毫无问题地使用 h3。

> [!CAUTION]
> 即使 h3 看起来与 Express.js 相似，也并不意味着 Express.js 仍然可行。Express.js 是一个很老的框架，已经很长时间没有发展了。对于新项目来说，它不是一个好的选择，因为它容易导致安全问题和内存泄漏。

使用 h3，你还可以开箱即用地进行热重载，无需任何配置，使用 [unjs/listhen](https://listhen.unjs.io)。

> [!NOTE]
> 你可以通过 `npx --yes listhen -w ./app.ts` 运行每个 h3 示例。

## 你好，世界

来自 Express.js 文档的第一个示例是 [Hello World](https://github.com/expressjs/express/blob/master/examples/hello-world/index.js)。

代码相当简单：

```js [index.js]
/**
 * Express.js 示例应用程序。
 */
var express = require("express");
var app = express();

app.get("/", function (req, res) {
  res.send("Hello World");
});

app.listen(3000);
console.log("Express 在 3000 端口启动");
```

让我们看看如何使用 h3 做同样的事情：

```ts [app.ts]
/**
 * h3 示例应用程序。
 */
import { createApp } from "h3";

export const app = createApp();

app.use("/", () => "Hello World");
```

然后，你可以使用 `npx --yes listhen -w ./app.ts` 启动服务器，并访问 http://localhost:3000 查看结果。

:read-more{to="/guide/app"}

## 多路由

第二个示例是 [多路由](https://github.com/expressjs/express/blob/master/examples/multi-router/index.js)。在这个示例中，我们创建多个路由器来拆分逻辑。

```js [index.js]
/**
 * Express.js 示例应用程序。
 */
var express = require("express");

var app = express();

var apiv1 = express.Router();

apiv1.get("/", function (req, res) {
  res.send("Hello from APIv1 root route.");
});

apiv1.get("/users", function (req, res) {
  res.send("List of APIv1 users.");
});

var apiv2 = express.Router();

apiv2.get("/", function (req, res) {
  res.send("Hello from APIv2 root route.");
});

apiv2.get("/users", function (req, res) {
  res.send("List of APIv2 users.");
});

app.use("/api/v1", apiv1);
app.use("/api/v2", apiv2);

app.get("/", function (req, res) {
  res.send("Hello from root route.");
});

app.listen(3000);
console.log("Express 在 3000 端口启动");
```

> [!NOTE]
> 为了某些功能，我们将每个文件归为同一类。

使用 h3，我们可以做同样的事情：

```ts [app.ts]
/**
 * h3 示例应用程序。
 */
import { createApp, createRouter, useBase } from "h3";

export const app = createApp();

const apiv1 = createRouter()
  .get("/", () => "Hello from APIv1 root route.")
  .get("/users", () => "List of APIv1 users.");

const apiv2 = createRouter()
  .get("/", () => "Hello from APIv2 root route.")
  .get("/users", () => "List of APIv2 users.");

app.use("/api/v1/**", useBase("/api/v1", apiv1.handler));
app.use("/api/v2/**", useBase("/api/v2", apiv2.handler));
```

这相当相似。主要的区别是我们需要使用 `useBase` 来定义路由器的基本路径。

:read-more{to="/guide/router"}

## 参数

第三个示例是 [参数](https://github.com/expressjs/express/tree/master/examples/params/index.js)。在这个示例中，我们在路由中使用参数。

```js [index.js]
/**
 * Express.js 示例应用程序。
 */
var createError = require("http-errors");
var express = require("express");
var app = express();

var users = [
  { name: "tj" },
  { name: "tobi" },
  { name: "loki" },
  { name: "jane" },
  { name: "bandit" },
];

app.param(["to", "from"], function (req, res, next, num, name) {
  req.params[name] = parseInt(num, 10);
  if (isNaN(req.params[name])) {
    next(createError(400, "无法解析 " + num));
  } else {
    next();
  }
});

app.param("user", function (req, res, next, id) {
  if ((req.user = users[id])) {
    next();
  } else {
    next(createError(404, "未找到用户"));
  }
});

app.get("/", function (req, res) {
  res.send("访问 /user/0 或 /users/0-2");
});

app.get("/user/:user", function (req, res) {
  res.send("用户 " + req.user.name);
});

app.get("/users/:from-:to", function (req, res) {
  var from = req.params.from;
  var to = req.params.to;
  var names = users.map(function (user) {
    return user.name;
  });
  res.send("用户 " + names.slice(from, to + 1).join(", "));
});

app.listen(3000);
console.log("Express 在 3000 端口启动");
```

使用 h3，我们可以做到同样的事情：

```ts [app.ts]
/**
 * h3 示例应用程序。
 */
import {
  createApp,
  createError,
  createRouter,
  getRouterParam,
  getValidatedRouterParams,
} from "h3";
import { z } from "zod";

const users = [
  { name: "tj" },
  { name: "tobi" },
  { name: "loki" },
  { name: "jane" },
  { name: "bandit" },
];

export const app = createApp();
const router = createRouter();

router.get("/", () => "访问 /users/0 或 /users/0/2");

router.get("/user/:user", async (event) => {
  const { user } = await getValidatedRouterParams(
    event,
    z.object({
      user: z.number({ coerce: true }),
    }).parse,
  );

  if (!users[user])
    throw createError({
      status: 404,
      statusMessage: "用户未找到",
    });

  return `用户 ${user}`;
});

router.get("/users/:from/:to", async (event) => {
  const { from, to } = await getValidatedRouterParams(
    event,
    z.object({
      from: z.number({ coerce: true }),
      to: z.number({ coerce: true }),
    }).parse,
  );

  const names = users.map((user) => {
    return user.name;
  });

  return `用户 ${names.slice(from, to).join(", ")}`;
});

app.use(router);
```

在 h3 中，我们没有 `param` 方法。相反，我们使用 `getRouterParam` 或 `getValidatedRouterParams` 来验证参数。这是更明确且更易于使用的。在这个示例中，我们使用了 `Zod`，但你可以自由使用任何其他验证库。

## Cookies

第四个示例是 [Cookies](https://github.com/expressjs/express/blob/master/examples/cookies/index.js)。在这个示例中，我们使用 cookies。

```js [index.js]
/**
 * Express.js 示例应用程序。
 */
var express = require("express");
var app = express();
var cookieParser = require("cookie-parser");

app.use(cookieParser("my secret here"));

app.use(express.urlencoded({ extended: false }));

app.get("/", function (req, res) {
  if (req.cookies.remember) {
    res.send('记住我了 :). 点击 <a href="/forget">忘记</a>!.');
  } else {
    res.send(
      '<form method="post"><p>勾选以 <label>' +
        '<input type="checkbox" name="remember"/> 记住我</label> ' +
        '<input type="submit" value="提交"/>.</p></form>',
    );
  }
});

app.get("/forget", function (req, res) {
  res.clearCookie("remember");
  res.redirect("back");
});

app.post("/", function (req, res) {
  var minute = 60000;
  if (req.body.remember) res.cookie("remember", 1, { maxAge: minute });
  res.redirect("back");
});

app.listen(3000);
console.log("Express 在 3000 端口启动");
```

使用 h3，我们可以做到同样的事情：

```ts [app.ts]
import {
  createApp,
  createRouter,
  getCookie,
  getRequestHeader,
  readJSONBody,
  redirect,
  setCookie,
} from "h3";

export const app = createApp();
const router = createRouter();

router.get("/", (event) => {
  const remember = getCookie(event, "remember");

  if (remember) {
    return '记住我了 :). 点击 <a href="/forget">忘记</a>!.';
  } else {
    return `<form method="post"><p>勾选以 <label>
    <input type="checkbox" name="remember"/> 记住我</label>
    <input type="submit" value="提交"/>.</p></form>`;
  }
});

router.get("/forget", (event) => {
  deleteCookie(event, "remember");

  const back = getRequestHeader(event, "referer") || "/";
  return redirect(event, back);
});

router.post("/", async (event) => {
  const body = await readJSONBody(event);

  if (body.remember)
    setCookie(event, "remember", "1", { maxAge: 60 * 60 * 24 * 7 });

  const back = getRequestHeader(event, "referer") || "/";
  return redirect(event, back);
});

app.use(router);
```

在 h3 中，我们没有 `cookieParser` 中间件。相反，我们使用 `getCookie` 和 `setCookie` 来获取和设置 cookies。这是更明确且更易于使用的。

## 中间件

在使用 `express` 时，我们通常使用 `middleware` 处理请求。

例如，这里我们使用 `morgan` 来处理请求日志。

```js [index.js]
var express = require("express");
var morgan = require("morgan");

var app = express();

app.use(morgan("combined"));

app.get("/", function (req, res) {
  res.send("hello, world!");
});

app.listen(3000);
console.log("Express 在 3000 端口启动");
```

在 `h3` 中，我们也可以直接使用来自 `express` 生态系统的中间件。

这可以通过使用 `fromNodeHandler` 简单实现。

```ts [app.ts]
import morgan from "morgan";
import { createApp, fromNodeHandler } from "h3";

export const app = createApp();

app.use(fromNodeHandler(morgan("combined")));

app.use("/", () => "Hello World");
```
