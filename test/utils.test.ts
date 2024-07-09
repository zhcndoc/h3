import { ReadableStream } from "node:stream/web";
import { describe, it, expect, vi } from "vitest";
import {
  redirect,
  useBase,
  assertMethod,
  getQuery,
  getRequestURL,
  readFormDataBody,
  getRequestIP,
  getRequestFingerprint,
  iterable,
} from "../src";
import { getNodeContext } from "../src/adapters/node";
import { serializeIterableValue } from "../src/utils/internal/iterable";
import { setupTest } from "./_setup";

describe("", () => {
  const ctx = setupTest();

  describe("redirect", () => {
    it("can redirect URLs", async () => {
      ctx.app.use((event) => redirect(event, "https://google.com"));
      const result = await ctx.request.get("/");

      expect(result.header.location).toBe("https://google.com");
      expect(result.header["content-type"]).toBe("text/html");
    });
  });

  describe("serializeIterableValue", () => {
    const exampleDate: Date = new Date(Date.UTC(2015, 6, 21, 3, 24, 54, 888));
    it.each([
      { value: "Hello, world!", output: "Hello, world!" },
      { value: 123, output: "123" },
      { value: 1n, output: "1" },
      { value: true, output: "true" },
      { value: false, output: "false" },
      { value: undefined, output: undefined },
      { value: null, output: "null" },
      { value: exampleDate, output: JSON.stringify(exampleDate) },
      { value: { field: 1 }, output: '{"field":1}' },
      { value: [1, 2, 3], output: "[1,2,3]" },
      { value: () => {}, output: undefined },
      {
        value: Buffer.from("Hello, world!"),
        output: Buffer.from("Hello, world!"),
      },
      { value: Uint8Array.from([1, 2, 3]), output: Uint8Array.from([1, 2, 3]) },
    ])("$value => $output", ({ value, output }) => {
      const serialized = serializeIterableValue(value);
      expect(serialized).toStrictEqual(output);
    });
  });

  describe("iterable", () => {
    it("sends empty body for an empty iterator", async () => {
      ctx.app.use(() => iterable([]));
      const result = await ctx.request.get("/");
      expect(result.header["content-length"]).toBe("0");
      expect(result.text).toBe("");
    });

    it("concatenates iterated values", async () => {
      ctx.app.use(() => iterable(["a", "b", "c"]));
      const result = await ctx.request.get("/");
      expect(result.text).toBe("abc");
    });

    describe("iterable support", () => {
      it.each([
        { type: "Array", iterable: ["the-value"] },
        { type: "Set", iterable: new Set(["the-value"]) },
        {
          type: "Map.keys()",
          iterable: new Map([["the-value", "unused"]]).keys(),
        },
        {
          type: "Map.values()",
          iterable: new Map([["unused", "the-value"]]).values(),
        },
        {
          type: "Iterator object",
          iterable: { next: () => ({ value: "the-value", done: true }) },
        },
        {
          type: "AsyncIterator object",
          iterable: {
            next: () => Promise.resolve({ value: "the-value", done: true }),
          },
        },
        {
          type: "Generator (yield)",
          iterable: (function* () {
            yield "the-value";
          })(),
        },
        {
          type: "Generator (return)",
          // eslint-disable-next-line require-yield
          iterable: (function* () {
            return "the-value";
          })(),
        },
        {
          type: "Generator (yield*)",
          iterable: (function* () {
            // prettier-ignore
            yield * ["the-value"];
          })(),
        },
        {
          type: "AsyncGenerator",
          iterable: (async function* () {
            await Promise.resolve();
            yield "the-value";
          })(),
        },
        {
          type: "ReadableStream (push-mode)",
          iterable: new ReadableStream({
            start(controller) {
              controller.enqueue("the-value");
              controller.close();
            },
          }),
        },
        {
          type: "ReadableStream (pull-mode)",
          iterable: new ReadableStream({
            pull(controller) {
              controller.enqueue("the-value");
              controller.close();
            },
          }),
        },
      ])("$type", async (t) => {
        ctx.app.use(() => iterable(t.iterable));
        const response = await ctx.request.get("/");
        expect(response.text).toBe("the-value");
      });
    });

    describe("serializer argument", () => {
      it("is called for every value", async () => {
        const testIterable = [1, "2", { field: 3 }, null];
        const serializer = vi.fn(() => "x");

        ctx.app.use(() => iterable(testIterable, { serializer }));
        const response = await ctx.request.get("/");
        expect(response.text).toBe("x".repeat(testIterable.length));
        expect(serializer).toBeCalledTimes(4);
        for (const [i, obj] of testIterable.entries()) {
          expect.soft(serializer).toHaveBeenNthCalledWith(i + 1, obj);
        }
      });
    });
  });

  describe("useBase", () => {
    it("can prefix routes", async () => {
      ctx.app.use(
        "/",
        useBase("/api", (event) => Promise.resolve(event.path)),
      );
      const result = await ctx.request.get("/api/test");

      expect(result.text).toBe("/test");
    });
    it("does nothing when not provided a base", async () => {
      ctx.app.use(
        "/",
        useBase("", (event) => Promise.resolve(event.path)),
      );
      const result = await ctx.request.get("/api/test");

      expect(result.text).toBe("/api/test");
    });
  });

  describe("getQuery", () => {
    it("can parse query params", async () => {
      ctx.app.use("/", (event) => {
        const query = getQuery(event);
        expect(query).toMatchObject({
          bool: "true",
          name: "string",
          number: "1",
        });
        return "200";
      });
      const result = await ctx.request.get(
        "/api/test?bool=true&name=string&number=1",
      );

      expect(result.text).toBe("200");
    });
  });

  describe("getMethod", () => {
    it("can get method", async () => {
      ctx.app.use("/", (event) => event.method);
      expect((await ctx.request.get("/api")).text).toBe("GET");
      expect((await ctx.request.post("/api")).text).toBe("POST");
    });
  });

  describe("getRequestURL", () => {
    const tests = [
      { path: "/foo", url: "http://127.0.0.1/foo" },
      { path: "//foo", url: "http://127.0.0.1/foo" },
      { path: "//foo.com//bar", url: "http://127.0.0.1/foo.com//bar" },
      { path: "///foo", url: "http://127.0.0.1/foo" },
      { path: String.raw`\foo`, url: "http://127.0.0.1/foo" },
      { path: String.raw`\\foo`, url: "http://127.0.0.1/foo" },
      { path: String.raw`\/foo`, url: "http://127.0.0.1/foo" },
      { path: String.raw`/\foo`, url: "http://127.0.0.1/foo" },
      { path: "/test", host: "example.com", url: "http://example.com/test" },
      {
        path: "/test",
        headers: [["x-forwarded-proto", "https"]],
        url: "https://127.0.0.1:80/test",
      },
      {
        path: "/test",
        headers: [["x-forwarded-host", "example.com"]],
        url: "http://example.com/test",
      },
    ];
    for (const test of tests) {
      it("getRequestURL: " + JSON.stringify(test), async () => {
        ctx.app.use("/", (event) => {
          const url = getRequestURL(event, {
            xForwardedProto: true,
            xForwardedHost: true,
          });
          // @ts-ignore
          url.port = 80;
          return url;
        });
        const req = ctx.request.get(test.path);
        if (test.host) {
          req.set("Host", test.host);
        }
        if (test.headers) {
          for (const header of test.headers) {
            req.set(header[0], header[1]);
          }
        }
        expect((await req).text).toBe(JSON.stringify(test.url));
      });
    }
  });

  describe("getRequestIP", () => {
    it("x-forwarded-for", async () => {
      ctx.app.use("/", (event) => {
        return getRequestIP(event, {
          xForwardedFor: true,
        });
      });
      const req = ctx.request.get("/");
      req.set("x-forwarded-for", "127.0.0.1");
      expect((await req).text).toBe("127.0.0.1");
    });
    it("ports", async () => {
      ctx.app.use("/", (event) => {
        return getRequestIP(event, {
          xForwardedFor: true,
        });
      });
      const req = ctx.request.get("/");
      req.set("x-forwarded-for", "127.0.0.1:1234");
      expect((await req).text).toBe("127.0.0.1:1234");
    });
    it("ipv6", async () => {
      ctx.app.use("/", (event) => {
        return getRequestIP(event, {
          xForwardedFor: true,
        });
      });
      const req = ctx.request.get("/");
      req.set("x-forwarded-for", "2001:0db8:85a3:0000:0000:8a2e:0370:7334");
      expect((await req).text).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    });
    it("multiple ips", async () => {
      ctx.app.use("/", (event) => {
        return getRequestIP(event, {
          xForwardedFor: true,
        });
      });
      const req = ctx.request.get("/");
      req.set("x-forwarded-for", "client , proxy1, proxy2");
      expect((await req).text).toBe("client");
    });
  });

  describe("getRequestFingerprint", () => {
    it("returns an hash", async () => {
      ctx.app.use((event) => getRequestFingerprint(event));

      const req = ctx.request.get("/");

      // sha1 is 40 chars long
      expect((await req).text).toHaveLength(40);

      // and only uses hex chars
      expect((await req).text).toMatch(/^[\dA-Fa-f]+$/);
    });

    it("returns the same hash every time for same request", async () => {
      ctx.app.use((event) => getRequestFingerprint(event, { hash: false }));

      const req = ctx.request.get("/");
      expect((await req).text).toMatchInlineSnapshot('"::ffff:127.0.0.1"');
      expect((await req).text).toMatchInlineSnapshot('"::ffff:127.0.0.1"');
    });

    it("returns null when all detections impossible", async () => {
      ctx.app.use((event) =>
        getRequestFingerprint(event, { hash: false, ip: false }),
      );
      const f1 = (await ctx.request.get("/")).text;
      expect(f1).toBe("");
    });

    it("can use path/method", async () => {
      ctx.app.use((event) =>
        getRequestFingerprint(event, {
          hash: false,
          ip: false,
          path: true,
          method: true,
        }),
      );

      const req = ctx.request.post("/foo");

      expect((await req).text).toMatchInlineSnapshot('"POST|/foo"');
    });

    it("uses user agent when available", async () => {
      ctx.app.use((event) =>
        getRequestFingerprint(event, { hash: false, userAgent: true }),
      );

      const req = ctx.request.get("/");
      req.set("user-agent", "test-user-agent");

      expect((await req).text).toMatchInlineSnapshot(
        '"::ffff:127.0.0.1|test-user-agent"',
      );
    });

    it("uses x-forwarded-for ip when header set", async () => {
      ctx.app.use((event) =>
        getRequestFingerprint(event, { hash: false, xForwardedFor: true }),
      );

      const req = ctx.request.get("/");
      req.set("x-forwarded-for", "x-forwarded-for");

      expect((await req).text).toMatchInlineSnapshot('"x-forwarded-for"');
    });

    it("uses the request ip when no x-forwarded-for header set", async () => {
      ctx.app.use((event) => getRequestFingerprint(event, { hash: false }));

      ctx.app.options.onRequest = (event) => {
        const { socket } = getNodeContext(event)?.req || {};
        Object.defineProperty(socket, "remoteAddress", {
          get(): any {
            return "0.0.0.0";
          },
        });
      };

      const req = ctx.request.get("/");

      expect((await req).text).toMatchInlineSnapshot('"0.0.0.0"');
    });
  });

  describe("assertMethod", () => {
    it("only allow head and post", async () => {
      ctx.app.use("/post", (event) => {
        assertMethod(event, "POST", true);
        return "ok";
      });
      expect((await ctx.request.get("/post")).status).toBe(405);
      expect((await ctx.request.post("/post")).status).toBe(200);
      expect((await ctx.request.head("/post")).status).toBe(200);
    });
  });

  describe("readFormDataBody", () => {
    it("can handle form as FormData in event handler", async () => {
      ctx.app.use("/", async (event) => {
        const formData = await readFormDataBody(event);
        const user = formData!.get("user");
        expect(formData instanceof FormData).toBe(true);
        expect(user).toBe("john");
        return { user };
      });

      const result = await ctx.request
        .post("/api/test")
        .set("content-type", "application/x-www-form-urlencoded; charset=utf-8")
        .field("user", "john");

      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ user: "john" });
    });
  });
});
