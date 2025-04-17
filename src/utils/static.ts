import type { H3Event, StaticAssetMeta, ServeStaticOptions } from "../types";
import { createError } from "../error";
import { withLeadingSlash, withoutTrailingSlash } from "./internal/path";

/**
 * Dynamically serve static assets based on the request path.
 */
export async function serveStatic(
  event: H3Event,
  options: ServeStaticOptions,
): Promise<false | undefined | null | BodyInit> {
  if (event.req.method !== "GET" && event.req.method !== "HEAD") {
    if (options.fallthrough) {
      return;
    }
    event.res.headers.set("allow", "GET, HEAD");
    throw createError({
      statusMessage: "Method Not Allowed",
      statusCode: 405,
    });
  }

  const originalId = decodeURI(
    withLeadingSlash(withoutTrailingSlash(event.url.pathname)),
  );

  const acceptEncodings = parseAcceptEncoding(
    event.req.headers.get("accept-encoding") || "",
    options.encodings,
  );

  if (acceptEncodings.length > 1) {
    event.res.headers.set("vary", "accept-encoding");
  }

  let id = originalId;
  let meta: StaticAssetMeta | undefined;

  const _ids = idSearchPaths(
    originalId,
    acceptEncodings,
    options.indexNames || ["/index.html"],
  );

  for (const _id of _ids) {
    const _meta = await options.getMeta(_id);
    if (_meta) {
      meta = _meta;
      id = _id;
      break;
    }
  }

  if (!meta) {
    if (options.fallthrough) {
      return;
    }
    throw createError({
      statusMessage: "Cannot find static asset " + id,
      statusCode: 404,
    });
  }

  if (meta.etag && !event.res.headers.has("etag")) {
    event.res.headers.set("etag", meta.etag);
  }

  const ifNotMatch =
    meta.etag && event.req.headers.get("if-none-match") === meta.etag;
  if (ifNotMatch) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }

  if (meta.mtime) {
    const mtimeDate = new Date(meta.mtime);

    const ifModifiedSinceH = event.req.headers.get("if-modified-since");
    if (ifModifiedSinceH && new Date(ifModifiedSinceH) >= mtimeDate) {
      event.res.status = 304;
      event.res.statusText = "Not Modified";
      return "";
    }

    if (!event.res.headers.get("last-modified")) {
      event.res.headers.set("last-modified", mtimeDate.toUTCString());
    }
  }

  if (meta.type && !event.res.headers.get("content-type")) {
    event.res.headers.set("content-type", meta.type);
  }

  if (meta.encoding && !event.res.headers.get("content-encoding")) {
    event.res.headers.set("content-encoding", meta.encoding);
  }

  if (
    meta.size !== undefined &&
    meta.size > 0 &&
    !event.req.headers.get("content-length")
  ) {
    event.res.headers.set("content-length", meta.size + "");
  }

  if (event.req.method === "HEAD") {
    return "";
  }

  const contents = await options.getContents(id);
  return contents;
}

// --- Internal Utils ---

function parseAcceptEncoding(
  header?: string,
  encodingMap?: Record<string, string>,
): string[] {
  if (!encodingMap || !header) {
    return [];
  }
  return String(header || "")
    .split(",")
    .map((e) => encodingMap[e.trim()])
    .filter(Boolean);
}

function idSearchPaths(id: string, encodings: string[], indexNames: string[]) {
  const ids = [];

  for (const suffix of ["", ...indexNames]) {
    for (const encoding of [...encodings, ""]) {
      ids.push(`${id}${suffix}${encoding}`);
    }
  }

  return ids;
}
