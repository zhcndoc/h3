import type { H3Config, H3Event } from "./types";
import type { H3Error } from "./types/h3";
import { Response as SrvxResponse } from "srvx";
import { createError } from "./error";
import { isJSONSerializable } from "./utils/internal/object";

export const kNotFound = /* @__PURE__ */ Symbol.for("h3.notFound");
export const kHandled = /* @__PURE__ */ Symbol.for("h3.handled");

export function handleResponse(
  val: unknown,
  event: H3Event,
  config: H3Config,
): Response | Promise<Response> {
  if (val && val instanceof Promise) {
    return val
      .catch((error) => error)
      .then((resolvedVal) => handleResponse(resolvedVal, event, config));
  }

  const response = prepareResponse(val, event, config);
  if (response instanceof Promise) {
    return handleResponse(response, event, config);
  }

  const { onBeforeResponse } = config;
  return onBeforeResponse
    ? Promise.resolve(onBeforeResponse(event, response)).then(() => response)
    : response;
}

function prepareResponse(
  val: unknown,
  event: H3Event,
  config: H3Config,
  nested?: boolean,
): Response | Promise<Response> {
  if (val === kHandled) {
    return new SrvxResponse(null);
  }

  if (val === kNotFound) {
    val = createError({
      statusCode: 404,
      statusMessage: `Cannot find any route matching [${event.req.method}] ${event.url}`,
    });
  }

  if (val && val instanceof Error) {
    const error = createError(val); // todo: flag unhandled
    const { onError } = config;
    return onError && !nested
      ? Promise.resolve(onError(error, event))
          .catch((error) => error)
          .then((newVal) => prepareResponse(newVal ?? val, event, config, true))
      : errorResponse(error, config.debug);
  }

  // Only set if event.res.headers is accessed
  const eventHeaders = (event.res as { _headers?: Headers })._headers;

  if (!(val instanceof Response)) {
    const res = prepareResponseBody(val, event, config);
    const status = event.res.status;
    return new SrvxResponse(
      nullBody(event.req.method, status) ? null : res.body,
      {
        status,
        statusText: event.res.statusText,
        headers:
          res.headers && eventHeaders
            ? mergeHeaders(res.headers, eventHeaders)
            : res.headers || eventHeaders,
      },
    );
  }

  // Note: Only check _headers. res.status/statusText are not used as we use them from the response
  if (!eventHeaders) {
    return val; // Fast path: no headers to merge
  }
  return new SrvxResponse(
    nullBody(event.req.method, val.status) ? null : val.body,
    {
      status: val.status,
      statusText: val.statusText,
      headers: mergeHeaders(eventHeaders, val.headers),
    },
  ) as Response;
}

function mergeHeaders(base: HeadersInit, merge: Headers): Headers {
  const mergedHeaders = new Headers(base);
  for (const [name, value] of merge) {
    if (name === "set-cookie") {
      mergedHeaders.append(name, value);
    } else {
      mergedHeaders.set(name, value);
    }
  }
  return mergedHeaders;
}

const emptyHeaders = new Headers({ "content-length": "0" });

const jsonHeaders = new Headers({
  "content-type": "application/json;charset=UTF-8",
});

function prepareResponseBody(
  val: unknown,
  event: H3Event,
  config: H3Config,
): { body: BodyInit; headers?: HeadersInit } {
  // Empty Content
  if (val === null || val === undefined) {
    return { body: "", headers: emptyHeaders };
  }

  const valType = typeof val;

  // Text
  if (valType === "string") {
    // Default header is text/plain we don't set it for performance reasons
    // new Response("").headers.get('content-type') === "text/plain;charset=UTF-8"
    return { body: val as string };
  }

  // Buffer (should be before JSON)
  if (val instanceof Uint8Array) {
    event.res.headers.set("content-length", val.byteLength.toString());
    return { body: val };
  }

  // JSON
  if (isJSONSerializable(val, valType)) {
    return {
      body: JSON.stringify(val, undefined, config.debug ? 2 : undefined),
      headers: jsonHeaders,
    };
  }

  // BigInt
  if (valType === "bigint") {
    return { body: val.toString(), headers: jsonHeaders };
  }

  // Blob
  if (val instanceof Blob) {
    return {
      body: val.stream(),
      headers: {
        "content-type": val.type,
        "content-length": val.size.toString(),
      },
    };
  }

  // Symbol or Function
  if (valType === "symbol") {
    return { body: val.toString() };
  }
  if (valType === "function") {
    return { body: `${(val as () => unknown).name}()` };
  }

  return { body: val as BodyInit };
}

function nullBody(
  method: string,
  status: number | undefined,
): boolean | 0 | undefined {
  // prettier-ignore
  return (method === "HEAD" ||
    status === 100 || status === 101 || status === 102 ||
    status === 204 || status === 205 || status === 304
  )
}

function errorResponse(error: H3Error, debug?: boolean): Response {
  return new SrvxResponse(
    JSON.stringify(
      {
        statusCode: error.statusCode,
        statusMessage: error.statusMessage,
        data: error.data,
        stack:
          debug && error.stack
            ? error.stack.split("\n").map((l) => l.trim())
            : undefined,
      },
      null,
      2,
    ),
    {
      status: error.statusCode,
      statusText: error.statusMessage,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
