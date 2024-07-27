import { vi } from "vitest";
import { defineLazyEventHandler } from "../src";
import { describeMatrix } from "./_setup";

describeMatrix("lazy", (t, { it, expect }) => {
  (global.console.error as any) = vi.fn();

  const handlers = [
    ["sync", () => "lazy"],
    ["async", () => Promise.resolve("lazy")],
  ] as const;
  const kinds = [
    ["default export", (handler: any) => ({ default: handler })],
    ["non-default export", (handler: any) => handler],
  ] as const;

  for (const [type, handler] of handlers) {
    for (const [kind, resolution] of kinds) {
      it(`can load ${type} handlers lazily from a ${kind}`, async () => {
        t.app.use(
          "/big",
          defineLazyEventHandler(() => Promise.resolve(resolution(handler))),
        );
        const result = await t.fetch("/big");

        expect(await result.text()).toBe("lazy");
      });

      it(`can handle ${type} functions that don't return promises from a ${kind}`, async () => {
        t.app.use(
          "/big",
          defineLazyEventHandler(() => resolution(handler)),
        );
        const result = await t.fetch("/big");

        expect(await result.text()).toBe("lazy");
      });
    }
  }
});
