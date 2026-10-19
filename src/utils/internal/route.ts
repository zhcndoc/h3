import { createRouter, addRoute, findRoute } from "rou3";

/**
 * Verdict of a route-pattern match: `false` when the pattern does not match the
 * path, otherwise the params it bound — or `undefined` when it binds none, so a
 * param-less pattern costs no allocation on the hot path.
 */
export type RouteMatchResult = false | undefined | Record<string, string>;

export type RouteMatcher = (pathname: string) => RouteMatchResult;

// A route pattern whose every segment is a plain literal. rou3's group (`{}`),
// escape (`\`), regex (`()`), param (`:`), optional (`?`) and wildcard (`*`)
// syntax each key off one of these characters, and rou3 percent-encodes the
// rest of the excluded set (controls, space, `"#<>^\``, non-ASCII) in literal
// text — so a pattern matching this is spelled exactly as rou3 stores it. An
// empty segment (`//`) makes rou3's trailing slash handling non-obvious too.
// Such a pattern is a plain string comparison away from a verdict, and
// anything else goes to rou3 itself.
const LITERAL_ROUTE_RE = /^(?:\/[^/:*(){}\\?^\0- "#<>`\x7F-\uFFFF]+)*\/?$/;

// The same, followed by a trailing catch-all: `/api/**`.
const LITERAL_PREFIX_ROUTE_RE = /^((?:\/[^/:*(){}\\?^\0- "#<>`\x7F-\uFFFF]+)*)\/\*\*\/?$/;

/**
 * Compile a rou3 route pattern into a matcher over `event.url.pathname`.
 *
 * The two shapes route-scoped middleware almost always uses — `/api` and
 * `/api/**` — are matched by string comparison. Every other pattern is matched
 * by rou3 itself, one single-route router per pattern, so a middleware scope
 * can never disagree with the routes it is meant to guard: the general case
 * *is* the router, and the fast paths are exact reimplementations of it for
 * patterns with no dynamic segments.
 *
 * Trailing slashes follow rou3: `findRoute` drops at most one from the path,
 * so a literal `/api` is also reached by `/api/` (but not `/api//`).
 */
export function createRouteMatcher(route: string): RouteMatcher {
  if (route.charCodeAt(0) !== 47 /* / */) {
    route = `/${route}`; // rou3's `addRoute` does the same
  }

  const prefixMatch = LITERAL_PREFIX_ROUTE_RE.exec(route);
  if (prefixMatch) {
    // `/api/**`: everything at or below the prefix, on a segment boundary. A
    // `**` that takes no segment binds nothing; otherwise it is keyed `0` (plus
    // the deprecated `_` alias rou3 still sets).
    const base = prefixMatch[1];
    const prefix = `${base}/`;
    return (pathname) => {
      if (pathname === base || pathname === prefix) {
        return undefined;
      }
      if (!pathname.startsWith(prefix)) {
        return false;
      }
      const rest = trimTrailingSlash(pathname.slice(prefix.length));
      return { 0: rest, _: rest };
    };
  }

  if (LITERAL_ROUTE_RE.test(route)) {
    // `/api`: no params to bind, so a match reports `undefined`.
    const base = route.endsWith("/") ? route.slice(0, -1) : route;
    return (pathname) => (pathname === base || pathname === `${base}/` ? undefined : false);
  }

  const router = createRouter<true>();
  addRoute(router, "", route, true);
  return (pathname) => {
    // `params` is `undefined` for a pattern that binds none (an escape or a
    // group that expanded to literals), which is a match, not a miss.
    const match = findRoute(router, "", pathname);
    return match ? match.params : false;
  };
}

/**
 * Drop the one trailing slash rou3's `findRoute` drops before it binds a `**`
 * param.
 */
function trimTrailingSlash(rest: string): string {
  return rest.endsWith("/") ? rest.slice(0, -1) : rest;
}
