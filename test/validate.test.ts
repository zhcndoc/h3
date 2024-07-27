import type { ValidateFunction } from "../src/types";
import { beforeEach } from "vitest";
import { z } from "zod";
import { readValidatedBody, getValidatedQuery } from "../src";
import { describeMatrix } from "./_setup";

describeMatrix("validate", (t, { it, describe, expect }) => {
  // Custom validator
  const customValidate: ValidateFunction<{
    invalidKey: never;
    default: string;
    field?: string;
  }> = (data: any) => {
    if (data.invalid) {
      throw new Error("Invalid key");
    }
    data.default = "default";
    return data;
  };

  // Zod validator (example)
  const zodValidate = z.object({
    default: z.string().default("default"),
    field: z.string().optional(),
    invalid: z.never().optional() /* WTF! */,
  }).parse;

  describe("readValidatedBody", () => {
    beforeEach(() => {
      t.app.post("/custom", async (event) => {
        const data = await readValidatedBody(event, customValidate);
        return data;
      });

      t.app.post("/zod", async (event) => {
        const data = await readValidatedBody(event, zodValidate);
        return data;
      });
    });

    describe("custom validator", () => {
      it("Valid JSON", async () => {
        const res = await t.fetch("/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "value" }),
        });
        expect(await res.json()).toEqual({
          field: "value",
          default: "default",
        });
        expect(res.status).toEqual(200);
      });

      it("Validate x-www-form-urlencoded", async () => {
        const res = await t.fetch("/custom", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "field=value",
        });
        expect(await res.json()).toEqual({
          field: "value",
          default: "default",
        });
        expect(res.status).toEqual(200);
      });

      it("Invalid JSON", async () => {
        const res = await t.fetch("/custom", {
          method: "POST",
          body: JSON.stringify({ invalid: true }),
        });
        expect(await res.text()).include("Invalid key");
        expect(res.status).toEqual(400);
      });
    });

    describe("zod validator", () => {
      it("Valid", async () => {
        const res = await t.fetch("/zod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "value" }),
        });
        expect(await res.json()).toEqual({
          field: "value",
          default: "default",
        });
        expect(res.status).toEqual(200);
      });

      it("Invalid", async () => {
        const res = await t.fetch("/zod", {
          method: "POST",
          body: JSON.stringify({ invalid: true }),
        });
        expect(res.status).toEqual(400);
        expect((await res.json()).data?.issues?.[0]?.code).toEqual(
          "invalid_type",
        );
      });
    });
  });

  describe("getQuery", () => {
    beforeEach(() => {
      t.app.get("/custom", async (event) => {
        const data = await getValidatedQuery(event, customValidate);
        return data;
      });

      t.app.get("/zod", async (event) => {
        const data = await getValidatedQuery(event, zodValidate);
        return data;
      });
    });

    describe("custom validator", () => {
      it("Valid", async () => {
        const res = await t.fetch("/custom?field=value");
        expect(await res.json()).toEqual({
          field: "value",
          default: "default",
        });
        expect(res.status).toEqual(200);
      });

      it("Invalid", async () => {
        const res = await t.fetch("/custom?invalid=true");
        expect(await res.text()).include("Invalid key");
        expect(res.status).toEqual(400);
      });
    });

    describe("zod validator", () => {
      it("Valid", async () => {
        const res = await t.fetch("/zod?field=value");
        expect(await res.json()).toEqual({
          field: "value",
          default: "default",
        });
        expect(res.status).toEqual(200);
      });

      it("Invalid", async () => {
        const res = await t.fetch("/zod?invalid=true");
        expect(res.status).toEqual(400);
      });
    });
  });
});
