import type { Mock } from "vitest";
import type { H3, H3Config, H3Error, H3Event, NodeHandler } from "../src/types";
import { Server as NodeServer } from "node:http";
import { getRandomPort } from "get-port-please";
import {
  beforeEach,
  afterEach,
  vi,
  it,
  describe,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import { createH3, toNodeHandler } from "../src";

// Matrix
export function describeMatrix(
  title: string,
  fn: (ctx: TestContext, testUtils: TestUtils) => void | Promise<void>,
  opts?: TestOptions,
) {
  const run = (ctx: TestContext) => {
    const utils: TestUtils = {
      expect,
      describe,
      it: Object.assign(inteceptFnWithSuffix(it, ctx.target), {
        only: inteceptFnWithSuffix(it.only, ctx.target),
        todo: inteceptFnWithSuffix(it.todo, ctx.target),
        skip: inteceptFnWithSuffix(it.skip, ctx.target),
        skipIf: (condition: boolean) => (condition ? utils.it.skip : utils.it),
        runIf: (condition: boolean) => (condition ? utils.it : utils.it.skip),
      }),
    };
    fn(ctx, utils);
  };
  describe(title, () => {
    describe("web", () => {
      run(setupWebTest(opts));
    });
    describe("node", () => {
      run(setupNodeTest(opts));
    });
  });
}

// Web
function setupWebTest(opts: TestOptions = {}): TestContext {
  const ctx = setupBaseTest("web", opts);
  beforeEach(() => {
    ctx.fetch = (input, init) => Promise.resolve(ctx.app.fetch(input, init));
  });
  return ctx;
}

// Node.js
function setupNodeTest(opts: TestOptions = {}): TestContext {
  const ctx = setupBaseTest("node", opts);

  let server: NodeServer;
  let handler: NodeHandler;

  beforeAll(async () => {
    server = new NodeServer((req, res) => {
      handler!(req, res);
    });
    const port = await getRandomPort();
    await new Promise<void>((resolve) => server.listen(port, resolve));
    ctx.url = `http://localhost:${port}`;
    ctx.fetch = (input, init = {}) => {
      const url = new URL(input, ctx.url);
      const headers = new Headers(init.headers);
      // Emulate a reverse proxy
      if (!headers.has("x-forwarded-host")) {
        headers.set("x-forwarded-host", url.host);
      }
      if (url.protocol === "https:" && !headers.has("x-forwarded-proto")) {
        headers.set("x-forwarded-proto", "https");
      }
      return fetch(`${ctx.url}${url.pathname}${url.search}`, {
        redirect: "manual",
        // @ts-expect-error undici/node specific
        duplex: "half",
        ...init,
        headers,
      });
    };
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    server = undefined!;
  });

  beforeEach(async () => {
    handler = toNodeHandler(ctx.app);
  });

  afterEach(() => {
    handler = undefined!;
  });

  return ctx;
}

// Base
function setupBaseTest(
  target: TestContext["target"],
  opts: TestOptions = {},
): TestContext {
  const ctx: TestContext = { target } as TestContext;

  beforeEach(async () => {
    ctx.hooks = {
      onRequest: vi.fn(),
      onError: vi.fn(),
      onBeforeResponse: vi.fn(),
      onAfterResponse: vi.fn(),
    };

    ctx.errors = [];
    ctx.hooks.onError.mockImplementation((error, _event: H3Event) => {
      if (opts.debug) {
        console.error(error);
      }
      ctx.errors.push(error);
    });

    ctx.app = createH3({
      debug: true,
      onError: ctx.hooks.onError,
      onRequest: ctx.hooks.onRequest,
      onBeforeResponse: ctx.hooks.onBeforeResponse,
      onAfterResponse: ctx.hooks.onAfterResponse,
    });
  });

  afterEach(async () => {
    const errors = ctx.errors;

    ctx.app = undefined!;
    ctx.hooks = undefined!;
    ctx.errors = undefined!;

    vi.resetAllMocks();
    if (!opts.allowUnhandledErrors) {
      const unhandledErrors = errors.filter(
        (error) => error.unhandled !== false,
      );
      if (unhandledErrors.length > 0) {
        throw mergeErrors(errors);
      }
    }
  });

  return ctx;
}

// --- types ---

export interface TestOptions {
  allowUnhandledErrors?: boolean;
  startServer?: boolean;
  debug?: boolean;
}

export interface TestContext {
  errors: H3Error[];
  hooks: {
    onRequest: Mock<Exclude<H3Config["onRequest"], undefined>>;
    onError: Mock<Exclude<H3Config["onError"], undefined>>;
    onBeforeResponse: Mock<Exclude<H3Config["onBeforeResponse"], undefined>>;
    onAfterResponse: Mock<Exclude<H3Config["onAfterResponse"], undefined>>;
  };

  target: "web" | "node";
  app: H3;
  url?: string;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface TestUtils {
  it: typeof it;
  describe: typeof describe;
  expect: typeof expect;
}

// --- utils ---

function mergeErrors(err: Error | Error[]) {
  if (Array.isArray(err)) {
    if (err.length === 1) {
      return mergeErrors(err[0]);
    }
    return new Error(
      "[tests] H3 global errors: \n" +
        err.map((error) => " - " + (error.stack || "")).join("\n"),
    );
  }
  return new Error("[tests] H3 global error: " + (err.stack || ""));
}

function inteceptFnWithSuffix<T extends (...args: any[]) => any>(
  originalFn: T,
  suffix: string,
): T {
  return Object.assign((...args: Parameters<T>) => {
    args[0] += ` (${suffix})`;
    return originalFn(...args);
  }, originalFn);
}
