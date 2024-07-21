import { describe, it, expect, vi } from "vitest";
import { createError } from "../src";
import { setupTest } from "./_setup";

const consoleMock = ((global.console.error as any) = vi.fn());

describe("error", () => {
  const ctx = setupTest({ allowUnhandledErrors: true });

  it("logs errors", async () => {
    ctx.app.use(() => {
      throw createError({ statusMessage: "Unprocessable", statusCode: 422 });
    });
    const result = await ctx.request.get("/");

    expect(result.status).toBe(422);
  });

  it("returns errors", async () => {
    ctx.app.use(() => {
      throw createError({ statusMessage: "Unprocessable", statusCode: 422 });
    });
    const result = await ctx.request.get("/");

    expect(result.status).toBe(422);
  });

  it("can send internal error", async () => {
    ctx.app.use("/api/test", () => {
      throw new Error("Booo");
    });
    const result = await ctx.request.get("/api/test");

    expect(result.status).toBe(500);
    expect(JSON.parse(result.text)).toMatchObject({
      statusCode: 500,
    });
  });

  it("can send runtime error", async () => {
    consoleMock.mockReset();

    ctx.app.use("/api/test", () => {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: {
          message: "Invalid Input",
        },
      });
    });

    const result = await ctx.request.get("/api/test");

    expect(result.status).toBe(400);
    expect(result.type).toMatch("application/json");

    expect(console.error).not.toBeCalled();

    expect(JSON.parse(result.text)).toMatchObject({
      statusCode: 400,
      statusMessage: "Bad Request",
      data: {
        message: "Invalid Input",
      },
    });
  });

  it("can handle errors in promises", async () => {
    ctx.app.use("/", () => {
      throw new Error("failed");
    });

    const res = await ctx.request.get("/");
    expect(res.status).toBe(500);
  });

  it("can handle returned Error", async () => {
    ctx.app.use("/", () => new Error("failed"));

    const res = await ctx.request.get("/");
    expect(res.status).toBe(500);
  });

  it("can handle returned H3Error", async () => {
    ctx.app.use("/", () => createError({ statusCode: 501 }));

    const res = await ctx.request.get("/");
    expect(res.status).toBe(501);
  });

  it("can access original error", async () => {
    class CustomError extends Error {
      customError = true;
    }

    ctx.app.use("/", () => {
      throw createError(new CustomError());
    });

    const res = await ctx.request.get("/");
    expect(res.status).toBe(500);

    expect(ctx.errors[0].cause).toBeInstanceOf(CustomError);
  });

  it("can inherit from cause", async () => {
    class CustomError extends Error {
      cause = createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        unhandled: true,
        fatal: true,
      });
    }

    ctx.app.use("/", () => {
      throw createError(new CustomError());
    });

    const res = await ctx.request.get("/");
    expect(res.status).toBe(400);
    expect(ctx.errors[0].unhandled).toBe(true);
    expect(ctx.errors[0].fatal).toBe(true);
  });
});
