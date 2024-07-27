import { beforeEach, vi } from "vitest";
import { serveStatic } from "../src";
import { describeMatrix } from "./_setup";

describeMatrix("serve static", (t, { it, expect }) => {
  beforeEach(() => {
    const serveStaticOptions = {
      getContents: vi.fn((id) =>
        id.includes("404") ? undefined : `asset:${id}`,
      ),
      getMeta: vi.fn((id) =>
        id.includes("404")
          ? undefined
          : {
              type: "text/plain",
              encoding: "utf8",
              etag: "w/123",
              mtime: 1_700_000_000_000,
              path: id,
              size: `asset:${id}`.length,
            },
      ),
      indexNames: ["/index.html"],
      encodings: { gzip: ".gz", br: ".br" },
    };

    t.app.all("/**", (event) => {
      return serveStatic(event, serveStaticOptions);
    });
  });

  const expectedHeaders = {
    "content-type": "text/plain",
    etag: "w/123",
    "content-encoding": "utf8",
    "last-modified": new Date(1_700_000_000_000).toUTCString(),
    vary: "accept-encoding",
  };

  it("Can serve asset (GET)", async () => {
    const res = await t.fetch("/test.png", {
      headers: {
        "if-none-match": "w/456",
        "if-modified-since": new Date(1_700_000_000_000 - 1).toUTCString(),
        "accept-encoding": "gzip, br",
      },
    });

    expect(res.status).toEqual(200);
    expect(await res.text()).toBe("asset:/test.png.gz");
    expect(Object.fromEntries(res.headers)).toMatchObject(expectedHeaders);
    expect(res.headers.get("content-length")).toBe("18");
  });

  it("Can serve asset (HEAD)", async () => {
    const headRes = await t.fetch("/test.png", {
      method: "HEAD",
      headers: {
        "if-none-match": "w/456",
        "if-modified-since": new Date(1_700_000_000_000 - 1).toUTCString(),
        "accept-encoding": "gzip, br",
      },
    });

    expect(headRes.status).toEqual(200);
    expect(await headRes.text()).toBe("");
    expect(Object.fromEntries(headRes.headers)).toMatchObject(expectedHeaders);
    expect(headRes.headers.get("content-length")).toBe("18");
  });

  it("Handles cache (if-none-match)", async () => {
    const res = await t.fetch("/test.png", {
      headers: { "if-none-match": "w/123" },
    });
    expect(res.headers.get("etag")).toBe(expectedHeaders.etag);
    expect(res.status).toEqual(304);
    expect(await res.text()).toBe("");
  });

  it("Handles cache (if-modified-since)", async () => {
    const res = await t.fetch("/test.png", {
      headers: {
        "if-modified-since": new Date(1_700_000_000_001).toUTCString(),
      },
    });
    expect(res.status).toEqual(304);
    expect(await res.text()).toBe("");
  });

  it("Returns 404 if not found", async () => {
    const res = await t.fetch("/404/test.png");
    expect(res.status).toEqual(404);

    const headRes = await t.fetch("/404/test.png", { method: "HEAD" });
    expect(headRes.status).toEqual(404);
  });

  it("Returns 405 if other methods used", async () => {
    const res = await t.fetch("/test.png", { method: "POST" });
    expect(res.status).toEqual(405);
  });
});
