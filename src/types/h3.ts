import type { H3Event, H3EventContext } from "./event.ts";
import type { EventHandler, Middleware, MiddlewareOptions } from "./handler.ts";
import type { H3Error } from "../error.ts";
import type { MaybePromise } from "./_utils.ts";

// --- Misc ---

// https://www.rfc-editor.org/rfc/rfc7231#section-4.1
// prettier-ignore
export type HTTPMethod =  "GET" | "HEAD" | "PATCH" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE";

export interface H3Config {
  debug?: boolean;

  onError?: (error: H3Error, event: H3Event) => MaybePromise<void | unknown>;
  onRequest?: (event: H3Event) => MaybePromise<void>;
  onBeforeResponse?: (
    event: H3Event,
    response: Response | PreparedResponse,
  ) => MaybePromise<void>;
}

export type PreparedResponse = ResponseInit & { body?: BodyInit | null };

export interface H3Route {
  route?: string;
  method?: HTTPMethod;
  middleware?: Middleware[];
  handler: EventHandler;
}

// --- H3 App ---

type InputHandler = EventHandler | H3;

export declare class H3 {
  /**
   * H3 instance config.
   */
  readonly config: H3Config;

  /**
   * Create a new H3 app instance.
   */
  constructor(config?: H3Config);

  /**
   * A [fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)-like API allowing to fetch app routes.
   *
   * Input can be a URL, relative path or standard [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object.
   *
   * Returned value is a standard [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) or a promise resolving to a Response.
   */
  fetch(
    _request: Request | URL | string,
    options?: RequestInit,
    context?: H3EventContext,
  ): Response | Promise<Response>;

  /**
   * An h3 compatible event handler useful to compose multiple h3 app instances.
   */
  handler(event: H3Event): unknown | Promise<unknown>;

  /**
   * Register a global middleware.
   */
  use(input: Middleware | H3, opts?: MiddlewareOptions): H3;

  /**
   * Register a route handler for the specified HTTP method and route.
   */
  on(
    method: HTTPMethod | Lowercase<HTTPMethod> | "",
    route: string,
    handler: InputHandler,
    middleware?: Middleware[],
  ): H3;

  /**
   * Register a route handler for all HTTP methods.
   */
  all(route: string, handler: InputHandler, middleware?: Middleware[]): H3;

  get(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  post(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  put(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  delete(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  patch(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  head(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  options(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  connect(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
  trace(route: string, handler: InputHandler, middleware?: Middleware[]): H3;
}
