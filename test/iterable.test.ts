import { ReadableStream } from "node:stream/web";
import { describe, it, expect, vi } from "vitest";
import { iterable } from "../src";
import { serializeIterableValue } from "../src/utils/internal/iterable";
import { setupTest } from "./_setup";

describe("iterable", () => {
  const ctx = setupTest();

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
      ctx.app.use((event) => iterable(event, []));
      const result = await ctx.request.get("/");
      expect(result.header["content-length"]).toBe("0");
      expect(result.text).toBe("");
    });

    it("concatenates iterated values", async () => {
      ctx.app.use((event) => iterable(event, ["a", "b", "c"]));
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
        ctx.app.use((event) => iterable(event, t.iterable));
        const response = await ctx.request.get("/");
        expect(response.text).toBe("the-value");
      });
    });

    describe("serializer argument", () => {
      it("is called for every value", async () => {
        const testIterable = [1, "2", { field: 3 }, null];
        const serializer = vi.fn(() => "x");
        ctx.app.use((event) => iterable(event, testIterable, { serializer }));
        const response = await ctx.request.get("/");
        expect(response.text).toBe("x".repeat(testIterable.length));
        expect(serializer).toBeCalledTimes(4);
        for (const [i, obj] of testIterable.entries()) {
          expect.soft(serializer).toHaveBeenNthCalledWith(i + 1, obj);
        }
      });
    });
  });
});
