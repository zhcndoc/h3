import type { CookieSerializeOptions, SetCookie } from "cookie-es";
import type { H3Event } from "../types";
import {
  parse as parseCookie,
  serialize as serializeCookie,
  parseSetCookie,
} from "cookie-es";

/**
 * Parse the request to get HTTP Cookie header string and returning an object of all cookie name-value pairs.
 * @param event {H3Event} H3 event or req passed by h3 handler
 * @returns Object of cookie name-value pairs
 * ```ts
 * const cookies = parseCookies(event)
 * ```
 */
export function parseCookies(event: H3Event): Record<string, string> {
  return parseCookie(event.request.headers.get("cookie") || "");
}

/**
 * Get a cookie value by name.
 * @param event {H3Event} H3 event or req passed by h3 handler
 * @param name Name of the cookie to get
 * @returns {*} Value of the cookie (String or undefined)
 * ```ts
 * const authorization = getCookie(request, 'Authorization')
 * ```
 */
export function getCookie(event: H3Event, name: string): string | undefined {
  return parseCookies(event)[name];
}

/**
 * Set a cookie value by name.
 * @param event {H3Event} H3 event or res passed by h3 handler
 * @param name Name of the cookie to set
 * @param value Value of the cookie to set
 * @param options {CookieSerializeOptions} Options for serializing the cookie
 * ```ts
 * setCookie(res, 'Authorization', '1234567')
 * ```
 */
export function setCookie(
  event: H3Event,
  name: string,
  value: string,
  options?: CookieSerializeOptions,
) {
  // Serialize cookie
  const newCookie = serializeCookie(name, value, { path: "/", ...options });

  // Check and add only not any other set-cookie headers already set
  const currentCookies = event.response.headers.getSetCookie();
  if (currentCookies.length === 0) {
    event.response.headers.set("set-cookie", newCookie);
    return;
  }

  // Merge and deduplicate unique set-cookie headers
  const newCookieKey = _getDistinctCookieKey(
    name,
    (options || {}) as SetCookie,
  );
  event.response.headers.delete("set-cookie");
  for (const cookie of currentCookies) {
    const _key = _getDistinctCookieKey(
      cookie.split("=")?.[0],
      parseSetCookie(cookie),
    );
    if (_key === newCookieKey) {
      continue;
    }
    event.response.headers.append("set-cookie", cookie);
  }
  event.response.headers.append("set-cookie", newCookie);
}

/**
 * Remove a cookie by name.
 * @param event {H3Event} H3 event or res passed by h3 handler
 * @param name Name of the cookie to delete
 * @param serializeOptions {CookieSerializeOptions} Cookie options
 * ```ts
 * deleteCookie(res, 'SessionId')
 * ```
 */
export function deleteCookie(
  event: H3Event,
  name: string,
  serializeOptions?: CookieSerializeOptions,
) {
  setCookie(event, name, "", {
    ...serializeOptions,
    maxAge: 0,
  });
}

function _getDistinctCookieKey(name: string, options: Partial<SetCookie>) {
  return [
    name,
    options.domain || "",
    options.path || "/",
    Boolean(options.secure),
    Boolean(options.httpOnly),
    Boolean(options.sameSite),
  ].join(";");
}
