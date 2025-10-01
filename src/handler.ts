import type { ServerRequest } from "srvx";
import { H3Event } from "./event.ts";
import { callMiddleware } from "./middleware.ts";
import { kNotFound, toResponse } from "./response.ts";

import type {
  EventHandler,
  EventHandlerObject,
  EventHandlerRequest,
  EventHandlerResponse,
  DynamicEventHandler,
  EventHandlerWithFetch,
  FetchableObject,
  HTTPHandler,
  Middleware,
} from "./types/handler.ts";
import type {
  InferOutput,
  StandardSchemaV1,
} from "./utils/internal/standard-schema.ts";
import type { TypedRequest } from "fetchdts";
import type { H3Core } from "./h3.ts";
import { validatedRequest, validatedURL } from "./utils/internal/validate.ts";

// --- event handler ---

export function defineHandler<
  Req extends EventHandlerRequest = EventHandlerRequest,
  Res = EventHandlerResponse,
>(handler: EventHandler<Req, Res>): EventHandlerWithFetch<Req, Res>;

export function defineHandler<
  Req extends EventHandlerRequest = EventHandlerRequest,
  Res = EventHandlerResponse,
>(def: EventHandlerObject<Req, Res>): EventHandlerWithFetch<Req, Res>;

export function defineHandler(
  input: EventHandler | EventHandlerObject,
): EventHandlerWithFetch {
  if (typeof input === "function") {
    return handlerWithFetch(input as EventHandler);
  }
  const handler: EventHandler =
    input.handler ||
    (input.fetch ? (event) => input.fetch!(event.req) : () => {});

  return Object.assign(
    handlerWithFetch(
      input.middleware?.length
        ? (event) => callMiddleware(event, input.middleware!, handler)
        : handler,
    ),
    input,
  );
}

type StringHeaders<T> = {
  [K in keyof T]: Extract<T[K], string>;
};

/**
 * @experimental defineValidatedHandler is an experimental feature and API may change.
 */
export function defineValidatedHandler<
  RequestBody extends StandardSchemaV1,
  RequestHeaders extends StandardSchemaV1,
  RequestQuery extends StandardSchemaV1,
  Res extends EventHandlerResponse = EventHandlerResponse,
>(
  def: Omit<EventHandlerObject, "handler"> & {
    validate?: {
      body?: RequestBody;
      headers?: RequestHeaders;
      query?: RequestQuery;
    };
    handler: EventHandler<
      {
        body: InferOutput<RequestBody>;
        query: StringHeaders<InferOutput<RequestQuery>>;
      },
      Res
    >;
  },
): EventHandlerWithFetch<
  TypedRequest<InferOutput<RequestBody>, InferOutput<RequestHeaders>>,
  Res
> {
  if (!def.validate) {
    return defineHandler(def) as any;
  }
  return defineHandler({
    ...def,
    handler: (event) => {
      (event as any) /* readonly */.req = validatedRequest(
        event.req,
        def.validate!,
      );
      (event as any) /* readonly */.url = validatedURL(
        event.url,
        def.validate!,
      );
      return def.handler(event as any);
    },
  }) as any;
}

// --- handler .fetch ---

function handlerWithFetch<
  Req extends EventHandlerRequest = EventHandlerRequest,
  Res = EventHandlerResponse,
>(handler: EventHandler<Req, Res>): EventHandlerWithFetch<Req, Res> {
  if ("fetch" in handler) {
    return handler as EventHandlerWithFetch<Req, Res>;
  }
  return Object.assign(handler, {
    fetch: (req: ServerRequest | URL | string): Promise<Response> => {
      if (typeof req === "string") {
        req = new URL(req, "http://_");
      }
      if (req instanceof URL) {
        req = new Request(req);
      }
      const event = new H3Event(req) as H3Event<Req>;
      try {
        return Promise.resolve(toResponse(handler(event), event));
      } catch (error: any) {
        return Promise.resolve(toResponse(error, event));
      }
    },
  });
}

//  --- dynamic event handler ---

export function dynamicEventHandler(
  initial?: EventHandler | FetchableObject,
): DynamicEventHandler {
  let current: EventHandler | undefined = toEventHandler(initial);
  return Object.assign(
    defineHandler((event: H3Event) => current?.(event)),
    {
      set: (handler: EventHandler | FetchableObject) => {
        current = toEventHandler(handler);
      },
    },
  );
}

// --- lazy event handler ---

type MaybePromise<T> = T | Promise<T>;

export function defineLazyEventHandler(
  loader: () => MaybePromise<HTTPHandler>,
): EventHandlerWithFetch {
  let handler: EventHandler | undefined;
  let promise: Promise<EventHandler> | undefined;
  const resolve = () => {
    if (handler) {
      return Promise.resolve(handler);
    }
    return (promise ??= Promise.resolve(loader()).then((r: any) => {
      handler = toEventHandler(r) || toEventHandler(r.default);
      if (typeof handler !== "function") {
        // @ts-expect-error
        throw new TypeError("Invalid lazy handler", { cause: { resolved: r } });
      }
      return handler;
    }));
  };
  return defineHandler((event) =>
    handler ? handler(event) : resolve().then((r) => r(event)),
  );
}

export function defineLazyMiddleware(
  loader: () => MaybePromise<HTTPHandler | Middleware | undefined>,
): Middleware {
  let middleware: Middleware | undefined;
  let promise: Promise<Middleware> | undefined;
  const resolve = () => {
    if (middleware) {
      return Promise.resolve(middleware);
    }
    return (promise ??= Promise.resolve(loader()).then((r: any) => {
      middleware = toMiddleware(r) || toMiddleware(r.default);
      if (typeof middleware !== "function") {
        // @ts-expect-error
        throw new TypeError("Invalid lazy middleware", {
          cause: { resolved: r },
        });
      }
      return middleware;
    }));
  };
  return (event, next) =>
    middleware
      ? middleware(event, next)
      : resolve().then((r) => r(event, next));
}

// --- normalization utils ---

export function toEventHandler(
  handler: HTTPHandler | undefined,
): EventHandler | undefined {
  if (typeof handler === "function") {
    return handler;
  }
  if (typeof (handler as H3Core)?.handler === "function") {
    return (handler as H3Core).handler;
  }
  if (typeof (handler as FetchableObject)?.fetch === "function") {
    return (event: H3Event) => (handler as FetchableObject).fetch!(event.req);
  }
}

export function toMiddleware(
  handler: HTTPHandler | Middleware | undefined,
): Middleware {
  const fn = toEventHandler(handler as HTTPHandler) as Middleware | undefined;
  if (!fn) {
    return (_event, next) => next();
  }
  if (fn.length > 1 || fn.constructor?.name === "AsyncFunction") {
    return fn; // Fast path: async or with explicit next()
  }
  return (event, next) => {
    const res = fn(event, next);
    return res === undefined || res === kNotFound ? next() : res;
  };
}
