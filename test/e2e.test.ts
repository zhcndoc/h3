import { describe, it, expect } from "vitest";
import { createError } from "../src";
import { setupTest } from "./_setup";

describe("server", () => {
  const ctx = setupTest();

  it("can serve requests", async () => {
    ctx.app.use(() => "sample");
    const result = await ctx.request.get("/");
    expect(result.text).toBe("sample");
  });

  it("can return 404s", async () => {
    const result = await ctx.request.get("/");
    expect(result.status).toBe(404);
  });

  it("can return 500s", async () => {
    ctx.app.use(() => {
      throw createError("Unknown");
    });
    const result = await ctx.request.get("/");
    expect(result.status).toBe(500);
  });
});
