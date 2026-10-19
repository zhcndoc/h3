import { describe, expect, it, vi } from "vitest";
import { H3 } from "../../src/index.ts";
import { compileFindRouteRules } from "../../src/rules/compiler.ts";
import {
  canOverrideRouteShape,
  createMatcherFromFind,
  createRouteRulesMatcher,
} from "../../src/rules/match.ts";
import type { FindRouteRules, RouteRulesMatcher } from "../../src/rules/match.ts";
import { mergeMatchedRouteRules } from "../../src/rules/merge.ts";
import { routeRules } from "../../src/rules/middleware.ts";
import type { RouteRuleLayer } from "../../src/rules/merge.ts";
import { normalizeRouteRules } from "../../src/rules/normalize.ts";
import type { RouteRuleConfig, RuleHandler } from "../../src/rules/types.ts";
import { FIXTURE_HANDLERS } from "./_fixture.ts";

// The cascades below include cache/swr rules; register the fixture handler set
// (the core registry ships no `cache` handler).
const matcher = (config: Record<string, RouteRuleConfig>) =>
  createRouteRulesMatcher(normalizeRouteRules(config), { handlers: FIXTURE_HANDLERS });

describe("merge algorithm", () => {
  it("more specific patterns win (specificity ordering)", () => {
    const match = matcher({
      "/api/**": { headers: { "x-a": "broad" } },
      "/api/x": { headers: { "x-a": "narrow" } },
    });
    expect(match("GET", "/api/x").routeRules.headers).toEqual({ "x-a": "narrow" });
    expect(match("GET", "/api/y").routeRules.headers).toEqual({ "x-a": "broad" });
  });

  // rou3's `findAllRoutes` order is containment order for plain patterns but not
  // for modifier params (`:x?`, `:x*`, `:x+`), and merging a chain in the wrong
  // order lets the BROADER pattern win — its options override the narrower
  // pattern's, and its `false` reset deletes the narrower pattern's rule outright.
  // This is the default (no `preMerge`, no compiler) path.
  describe("matched layers are merged in containment order, not findAllRoutes order", () => {
    // Two distinct upstream shapes: `/api/:id/**` subsumes `/api/:path+` and comes
    // back last in BOTH registration orders (rou3 sorts it there), while
    // `/admin/:page?` subsumes `/admin` and gets no specificity sort at all (both
    // weigh 0 in `pushSorted`, so config order survives) — hence both orders below.
    const SHAPES: Array<[string, string, string, string]> = [
      ["stable inversion", "/api/:path+", "/api/:id/**", "/api/v1/x"],
      ["unsorted (config order)", "/admin", "/admin/:page?", "/admin"],
    ];

    it.each(SHAPES)("%s: the narrower pattern's options win", (_l, narrow, broad, pathname) => {
      for (const config of [
        { [narrow]: { headers: { who: "narrow" } }, [broad]: { headers: { who: "broad" } } },
        { [broad]: { headers: { who: "broad" } }, [narrow]: { headers: { who: "narrow" } } },
      ]) {
        const rule = matcher(config)("GET", pathname).matchedRules.headers!;
        expect(rule.options, JSON.stringify(config)).toEqual({ who: "narrow" });
        expect(rule.route).toBe(narrow);
      }
    });

    const policy = { cors: { origin: ["https://a.example"] } } satisfies RouteRuleConfig;
    const reset = { cors: false } satisfies RouteRuleConfig;

    it.each(SHAPES)("%s: a broader `false` never resets the narrower rule", (_l, n, b, path) => {
      for (const config of [
        { [n]: policy, [b]: reset },
        { [b]: reset, [n]: policy },
      ]) {
        const { routeRules } = matcher(config)("GET", path);
        expect(routeRules.cors, JSON.stringify(config)).toMatchObject({
          origin: ["https://a.example"],
        });
      }
    });

    it.each(SHAPES)("%s: a narrower `false` still resets a broader rule", (_l, n, b, pathname) => {
      // The other direction must keep working: reordering may not turn a
      // legitimate narrow reset into a no-op.
      expect(matcher({ [b]: policy, [n]: reset })("GET", pathname).routeRules.cors).toBeUndefined();
    });
  });

  it("object options shallow-merge across layers", () => {
    const match = matcher({
      "/api/**": { headers: { "x-a": "1", "x-b": "1" } },
      "/api/x": { headers: { "x-b": "2", "x-c": "2" } },
    });
    expect(match("GET", "/api/x").routeRules.headers).toEqual({
      "x-a": "1",
      "x-b": "2",
      "x-c": "2",
    });
  });

  it("non-object options override", () => {
    const match = matcher({
      "/api/**": { custom: { nested: true } },
      "/api/x": { custom: "flat" },
    });
    expect(match("GET", "/api/x").routeRules.custom).toBe("flat");
  });

  it("`null` options override an inherited object (typeof null quirk)", () => {
    // `typeof null === "object"`: a spread-merge would silently keep the
    // inherited object; `null` must behave like any other non-object override.
    const match = matcher({
      "/api/**": { custom: { x: 1 } },
      "/api/x": { custom: null },
    });
    expect(match("GET", "/api/x").routeRules.custom).toBe(null);
    expect(match("GET", "/api/y").routeRules.custom).toEqual({ x: 1 });
  });

  it("`redirect: false` / `proxy: false` reset inherited rules", () => {
    const match = matcher({
      "/old/**": { redirect: "/new", proxy: "/upstream" },
      "/old/keep/**": { redirect: false, proxy: false },
    });
    const inherited = match("GET", "/old/x");
    expect(inherited.routeRules.redirect).toBeDefined();
    expect(inherited.routeRules.proxy).toBeDefined();
    const reset = match("GET", "/old/keep/x");
    expect(reset.routeRules.redirect).toBeUndefined();
    expect(reset.routeRules.proxy).toBeUndefined();
    expect(reset.routeRuleMiddleware).toHaveLength(0);
  });

  it("params stay undefined when no matched layer carries params", () => {
    // Multi-layer merges must not materialize a phantom `{}` (also keeps plain
    // and preMerge results structurally identical).
    const match = matcher({
      "/a": { headers: { x: "agnostic" } },
      "GET /a": { headers: { x: "get" } },
    });
    const rule = match("GET", "/a").matchedRules.headers!;
    expect(rule.options).toEqual({ x: "get" });
    expect(rule.params).toBeUndefined();
  });

  it("`false` resets an inherited rule (noncached cascade)", () => {
    // Mirrors the Nitro fixture `/rules/_/noncached/**` + `/rules/_/noncached/cached`
    const match = matcher({
      "/rules/_/noncached/cached": { swr: true },
      "/rules/_/noncached/**": { swr: false, cache: false },
      "/rules/_/cached/noncached": { cache: false, swr: false },
      "/rules/_/cached/**": { swr: true },
    });
    // `cache: false` on the subtree resets, the more specific rule re-adds
    expect(match("GET", "/rules/_/noncached/cached").routeRules.cache).toEqual({
      swr: true,
    });
    expect(match("GET", "/rules/_/noncached/other").routeRules.cache).toBeUndefined();
    // inherited cache reset by a more specific `false`
    expect(match("GET", "/rules/_/cached/noncached").routeRules.cache).toBeUndefined();
    expect(match("GET", "/rules/_/cached/other").routeRules.cache).toEqual({
      swr: true,
    });
  });

  it("bare `swr: false` disables an inherited swr cache rule", () => {
    // A broad rule expands `swr` -> `cache`; a more specific rule sets bare
    // `swr: false` WITHOUT an explicit `cache: false`. The reset must still fire.
    const match = matcher({
      "/**": { swr: 3600 },
      "/api/test": { swr: false },
    });
    expect(match("GET", "/api/other").routeRules.cache).toMatchObject({
      swr: true,
      maxAge: 3600,
    });
    expect(match("GET", "/api/test").routeRules.cache).toBeUndefined();
  });

  it("`false` on the most specific layer yields no middleware for that rule", () => {
    const match = matcher({
      "/policy/**": { cors: { origin: ["https://a.example"] } },
      "/policy/open/**": { cors: false },
    });
    const on = match("GET", "/policy/test");
    expect(on.routeRules.cors).toBeDefined();
    expect(on.routeRuleMiddleware).toHaveLength(1);
    const off = match("GET", "/policy/open/x");
    expect(off.routeRules.cors).toBeUndefined();
    expect(off.routeRuleMiddleware).toHaveLength(0);
  });

  it("route and params take the more specific match's values (params merged)", () => {
    const match = matcher({
      "/api/:section/**": { custom: { a: 1 } },
      "/api/:section/:id": { custom: { b: 2 } },
    });
    const { routeRules, matchedRules } = match("GET", "/api/users/42");
    expect(matchedRules.custom!.route).toBe("/api/:section/:id");
    expect(matchedRules.custom!.params).toMatchObject({ section: "users", id: "42" });
    expect(routeRules.custom).toEqual({ a: 1, b: 2 });
  });

  it("a matched rule carries no `name`/`method` (key is the name; scope is not one field)", () => {
    // `name` is the map key, and `method` would be meaningless on a rule merged
    // from a method-agnostic layer plus a method-scoped one (below: `x` comes
    // from the agnostic layer, `y` from the POST layer).
    const config = {
      "/api/**": { custom: { x: 1 } },
      "POST /api/**": { custom: { y: 2 } },
    } satisfies Record<string, RouteRuleConfig>;
    for (const preMerge of [false, true]) {
      const match = createRouteRulesMatcher(normalizeRouteRules(config), {
        handlers: FIXTURE_HANDLERS,
        preMerge,
      });
      const rule = match("POST", "/api/x").matchedRules.custom!;
      expect(Object.keys(rule).sort()).toEqual(["handler", "options", "params", "route"]);
      expect(rule.options).toEqual({ x: 1, y: 2 });
    }
  });

  it("middleware is sorted by handler order (cors first)", () => {
    const match = matcher({
      "/app/**": { redirect: "/login", cors: true },
    });
    const { matchedRules, routeRuleMiddleware } = match("GET", "/app/x");
    expect(routeRuleMiddleware).toHaveLength(2);
    // cors has order -3 (outermost): its middleware comes first, so a preflight
    // is answered before the redirect at the default 0.
    expect(matchedRules.cors!.handler!.order).toBe(-3);
    expect(routeRuleMiddleware[0]).toBe(
      routeRuleMiddleware.find((mw) => mw.name === "corsRouteRule"),
    );
  });

  it("sorts middleware by numeric handler order (ascending, custom bands mixed with defaults)", () => {
    const mk = (name: string) => ({
      // name the produced middleware so the resulting order is observable
      handler: () => Object.defineProperty(() => undefined, "name", { value: name }),
    });
    const match = createRouteRulesMatcher(
      normalizeRouteRules({
        "/x": { isr: true, custom: true, tags: true, shout: true, "my-rule": true },
      }),
      {
        handlers: {
          isr: { ...mk("isr"), order: 2 },
          custom: { ...mk("custom"), order: -5 }, // outer to all built-ins
          tags: { ...mk("tags"), order: -1 }, // the `headers` band
          shout: mk("shout"), // default 0
          "my-rule": { ...mk("my-rule"), order: 1 },
        },
      },
    );
    const { routeRuleMiddleware } = match("GET", "/x");
    expect(routeRuleMiddleware.map((mw) => mw.name)).toEqual([
      "custom", // -5
      "tags", // -1
      "shout", // 0
      "my-rule", // 1
      "isr", // 2
    ]);
  });

  it("data-only rules are merged but produce no middleware", () => {
    const match = matcher({
      "/blog/**": { prerender: true, isr: 60 },
    });
    const { routeRules, routeRuleMiddleware } = match("GET", "/blog/post");
    expect(routeRules.prerender).toBe(true);
    expect(routeRules.isr).toBe(60);
    expect(routeRuleMiddleware).toHaveLength(0);
  });
});

describe("method-scoped rules", () => {
  it("apply only to their method", () => {
    const match = matcher({
      "GET /api/**": { headers: { "x-m": "get" } },
    });
    expect(match("GET", "/api/x").routeRules.headers).toEqual({ "x-m": "get" });
    expect(match("POST", "/api/x").routeRules.headers).toBeUndefined();
  });

  it("merge after (override) method-agnostic rules for the same pattern", () => {
    const match = matcher({
      "/api/**": { headers: { "x-a": "all", "x-b": "all" } },
      "GET /api/**": { headers: { "x-b": "get" } },
    });
    // GET: agnostic merges first, method-scoped overrides on top
    expect(match("GET", "/api/x").routeRules.headers).toEqual({
      "x-a": "all",
      "x-b": "get",
    });
    // Other methods: agnostic rule only
    expect(match("POST", "/api/x").routeRules.headers).toEqual({
      "x-a": "all",
      "x-b": "all",
    });
  });

  it("method-scoped `false` resets an agnostic rule for that method only", () => {
    const match = matcher({
      "/api/**": { cors: { origin: ["https://a.example"] } },
      "GET /api/**": { cors: false },
    });
    expect(match("GET", "/api/x").routeRules.cors).toBeUndefined();
    expect(match("POST", "/api/x").routeRules.cors).toBeDefined();
  });

  it("method-agnostic-only rule sets behave identically for all methods", () => {
    const match = matcher({
      "/api/**": { headers: { "x-a": "1" } },
    });
    for (const method of ["GET", "POST", "PUT", "DELETE", ""]) {
      expect(match(method, "/api/x").routeRules.headers).toEqual({ "x-a": "1" });
    }
  });
});

describe("dual-path union (Nitro #4396)", () => {
  it("canonical-path match adds a rule the raw path missed", () => {
    // `/app/admin%2fpanel` is served by the broad rule on the raw path but
    // canonicalizes to `/app/admin/panel`, where the narrower rule lives.
    const match = matcher({
      "/app/**": { headers: { "x-app": "1" } },
      "/app/admin/**": { cors: { origin: ["https://admin.example"] } },
    });
    const { routeRules } = match("GET", "/app/admin%2fpanel");
    expect(routeRules.headers).toEqual({ "x-app": "1" });
    expect(routeRules.cors).toMatchObject({ origin: ["https://admin.example"] });
  });

  it("a %5c separator is canonicalized at the matcher level too", () => {
    // `%5c` is opaque in `event.url.pathname` (canonicalization never decodes a
    // separator), so this branch *is* reachable e2e — see rules.test.ts. Pinned
    // here at the matcher level too, since `h3/rules` is usable standalone.
    const match = matcher({
      "/app/**": { headers: { "x-app": "1" } },
      "/app/admin/**": { cors: { origin: ["https://admin.example"] } },
    });
    const { routeRules } = match("GET", "/app/admin%5cpanel");
    expect(routeRules.headers).toEqual({ "x-app": "1" });
    expect(routeRules.cors).toMatchObject({ origin: ["https://admin.example"] });
  });

  it("canonical rule overrides raw on overlap (more specific wins)", () => {
    // Mirrors `/policy-nested/**` + `/policy-nested/admin/**`: the narrower
    // canonical policy must win.
    const match = matcher({
      "/policy-nested/**": { cors: { origin: ["https://broad.example"] } },
      "/policy-nested/admin/**": { cors: { origin: ["https://admin.example"] } },
    });
    const { routeRules } = match("GET", "/policy-nested/admin%2fpanel");
    expect(routeRules.cors).toMatchObject({ origin: ["https://admin.example"] });
  });

  it("a `false` reset on the canonical path never strips a rule the raw path resolved", () => {
    // Mirrors `/policy-strip/**` + `/policy-strip/off/**`: the served path
    // (single opaque segment) matches the broad rule; the canonical path's
    // `false` (targeting the two-segment subtree) must not delete it.
    const match = matcher({
      "/policy-strip/**": { cors: { origin: ["https://strip.example"] } },
      "/policy-strip/off/**": { cors: false },
    });
    const { routeRules } = match("GET", "/policy-strip/off%2fx");
    expect(routeRules.cors).toMatchObject({ origin: ["https://strip.example"] });
    // genuine two-segment path: the rule is reset as configured
    expect(match("GET", "/policy-strip/off/x").routeRules.cors).toBeUndefined();
  });

  it("a `..` next to an encoded separator cannot dodge a narrower rule on a slash-merging downstream", () => {
    // Report vuln-12006 (HackerOne #3721382): h3's canonical form keeps the
    // empty segment a `..` adjacent to an encoded separator produces
    // (`/api/foo/%2e%2e/%2fadmin/secret` → `/api//admin/secret`), so rou3's
    // per-segment match misses `/api/admin/**` and its rule never runs — yet a
    // downstream that decodes `%2f` then merges slashes resolves it to
    // `/api/admin/secret`. The matcher must also match the slash-merged canonical
    // reading (`/api/admin/secret`), like `isPathInScope` already does for scope.
    //
    // Payloads below are pre-h3 wire forms fed straight to the matcher. Through
    // real h3 the `%2e%2e` is decoded and resolved first, so e.g.
    // `/api/foo/%2e%2e/%2fadmin/secret` arrives as `/api/%2fadmin/secret` — which
    // reaches the same canonical (`/api//admin/secret`) and slash-merged
    // (`/api/admin/secret`) readings, so the invariant and these assertions hold
    // either way. `%2f` is the only part of these payloads h3 leaves opaque, and
    // it is the part that makes the bypass real; see `test/h3-decode.test.ts`.
    const match = matcher({
      "/api/**": { headers: { "x-app": "1" } },
      "/api/admin/**": { cors: { origin: ["https://admin.example"] } },
    });
    // Baseline: the raw and canonical-only variants already fire.
    expect(match("GET", "/api/admin/secret").routeRules.cors).toBeDefined();
    expect(match("GET", "/api/foo/%2e%2e%2fadmin/secret").routeRules.cors).toBeDefined();
    expect(match("GET", "/api/foo/..%2fadmin/secret").routeRules.cors).toBeDefined();
    // The surviving bypass: `..` separated from `%2f` by a literal `/`.
    for (const payload of [
      "/api/foo/%2e%2e/%2fadmin/secret",
      "/api/foo/..%2f%2fadmin/secret",
      "/api/foo/%2e%2e%2f%2fadmin/secret",
      "/api/foo/%2e%2e/%5cadmin/secret",
      "/api/foo/%252e%252e/%252fadmin/secret",
    ]) {
      const { routeRules } = match("GET", payload);
      expect(routeRules.cors, payload).toBeDefined();
      expect(routeRules.cors, payload).toMatchObject({ origin: ["https://admin.example"] });
      // union-only: the broad rule the raw path resolved is never stripped.
      expect(routeRules.headers, payload).toEqual({ "x-app": "1" });
    }
  });

  it("the slash-merged lookup never strips a rule the raw path resolved (union-only)", () => {
    // A benign doubled slash whose merged canonical form lands on a `false`-reset
    // subtree must not delete the rule the served path resolved.
    const match = matcher({
      "/api/**": { cors: { origin: ["https://broad.example"] } },
      "/api/off/**": { cors: false },
    });
    // Raw path stays a single opaque segment under `/api/**`; the merged reading
    // (`/api/off/x`) hits the reset but union-only must keep the broad rule.
    const { routeRules } = match("GET", "/api/off%2f%2fx");
    expect(routeRules.cors).toMatchObject({ origin: ["https://broad.example"] });
  });

  it("a SIBLING-scope `false` reading never strips a rule the served (raw) path resolved", () => {
    // The mutation-tight strip case: unlike an ancestor `false` (which deletes
    // within its own reading before the union, so it can't test cross-reading
    // leakage), a *sibling* `false` is matched ONLY by the crafted canonical
    // reading — no co-matching protector deletes it first. `/app/admin/**`
    // matches the payload as given, while its canonical reading `/app/public/x`
    // matches only the `cors: false` sibling. The union must NOT let that
    // sibling `false` delete the rule the served path resolved. (The delete
    // branch keys off `options === false`, never the rule name, so this holds
    // for every rule.)
    //
    // SYNTHETIC INPUT — defense-in-depth for non-h3 callers of the exported
    // matchers (compiled matchers, other frameworks), NOT h3 traffic. h3 decodes
    // `%2e` and resolves the dots *before* dispatch (see `test/h3-decode.test.ts`),
    // so a real h3 request for `/app/admin/%2e%2e/public/x` reaches the matcher as
    // `/app/public/x` and is legitimately served under the `false` sibling — the
    // encoded `..` does NOT stay opaque in dispatch. Feeding the pre-decode wire
    // form directly is what makes the `%2e` climb testable at all here.
    const match = matcher({
      "/app/admin/**": { cors: { origin: ["https://trusted.example"] } },
      "/app/public/**": { cors: false },
    });
    for (const payload of [
      "/app/admin/%2e%2e/public/x", // encoded `..` climbs to the sibling
      "/app/admin/%252e%252e/public/x", // double-encoded `..`
      "/app/admin/x/%2e%2e/%2e%2e/public/y", // deeper climb
    ]) {
      const { routeRules } = match("GET", payload);
      expect(routeRules.cors, payload).toMatchObject({ origin: ["https://trusted.example"] });
    }
    // Control: a request genuinely served under the sibling is reset.
    expect(match("GET", "/app/public/x").routeRules.cors).toBeUndefined();
  });

  it("no encoding of a path ever weakens or drops its narrowest rule (over-decode invariant)", () => {
    // The core safety property behind pessimistic decoding, stated adversarially:
    // for ANY alternate reading of a genuinely-admin path, the resolved rule must
    // be at least as specific as the raw reading — never the broad `/app/**`
    // policy, never absent, never the sibling `off` reset. Encodes the fan-out an
    // attacker controls (encoded separators/dots at any nesting, empty segments,
    // no-op `..`) as an enumerated matrix so a regression in any single reading
    // (canonical, merged, or the union direction) trips this.
    const match = matcher({
      "/app/**": { cors: { origin: ["https://broad.example"] } },
      "/app/admin/**": { cors: { origin: ["https://admin.example"] } },
      "/app/admin/off/**": { cors: false },
    });
    // Every payload below is an encoding of the genuinely-admin `/app/admin/panel`
    // — none resolves into the `off` subtree — so all must keep the admin policy.
    for (const payload of [
      "/app/admin/panel", // baseline
      "/app/admin%2fpanel", // encoded separator
      "/app/admin%252fpanel", // double-encoded separator
      "/app/admin/pane%6c", // encoded non-separator byte (opaque)
      "/app/admin/./panel", // no-op dot segment
      "/app/admin//panel", // interior empty segment
      "/app/admin/x/%2e%2e/panel", // encoded `..` that resolves back inside admin
      "/app/%2e/admin/panel", // leading no-op dot
      "/app/admin/off%2f..%2fpanel", // brushes `off` then climbs back out — still admin
    ]) {
      const { routeRules } = match("GET", payload);
      expect(routeRules.cors, payload).toMatchObject({ origin: ["https://admin.example"] });
    }
    // Control: a path that genuinely resolves into the `off` subtree is reset,
    // proving the matrix above passes because the paths stay admin — not because
    // the reset is inert.
    expect(match("GET", "/app/admin/off/x").routeRules.cors).toBeUndefined();
  });

  // A `false` reset is implemented as a `delete`, so a reset rule would otherwise
  // be indistinguishable from one that never matched and a broader alternate
  // reading would take the unguarded ADD branch, restoring it at full breadth.
  // `/app/private/x%2f..%2f..%2fy` is served by h3 under `/app/private/**` (the
  // `%2f` stays opaque in dispatch, so the private handler really runs), yet its
  // canonical reading `/app/y` matches only `/**` — re-adding `cors: *` there
  // makes the private response cross-origin readable.
  //
  // Gating the ADD on `canOverride(resetRoute, incomingRoute)` cannot fix this:
  // this config is isomorphic (under pattern containment) to the `restricting`
  // one in the next test — both are `{broad B, narrow N carrying the reset}` with
  // the served path matching `{B, N}` and the alternate reading matching `{B}`
  // only. What separates them is the *rule*, not the patterns: re-adding a
  // restriction is fail-closed, re-adding a permission undoes the exemption.
  // Hence `RuleHandler.restricting`.
  it("an alternate reading never RESURRECTS a permission the served path reset", () => {
    const match = matcher({
      "/**": { cors: { origin: "*" } },
      "/app/private/**": { cors: false },
    });
    // Control: the reset holds on an uncrafted path.
    expect(match("GET", "/app/private/x").routeRules.cors).toBeUndefined();
    expect(match("GET", "/app/private/x%2f..%2f..%2fy").routeRules.cors).toBeUndefined();
  });

  it("…but a `restricting` rule is still re-added, so a reset cannot widen itself", () => {
    // The isomorphic counterpart. No built-in rule is `restricting` — it is the
    // extension point for a custom rule that can only ever *tighten* a response,
    // where re-adding is fail-closed — so this uses one: the exemption written
    // for a single segment must not survive into a reading with two.
    const restricted: RuleHandler<"restricted"> = {
      restricting: true,
      handler: () => (_event, next) => next(),
    };
    const match = createRouteRulesMatcher(
      normalizeRouteRules({
        "/app/r/**": { restricted: { label: "strict" } },
        "/app/r/:seg": { restricted: false },
      }),
      { handlers: { restricted } },
    );
    expect(match("GET", "/app/r/a").routeRules.restricted).toBeUndefined();
    expect(match("GET", "/app/r/a%2fb").routeRules.restricted).toMatchObject({ label: "strict" });
  });

  it("an alternate reading reinstates a permission only from a pattern inside the reset", () => {
    // A reset is route-aware: `/private/x` is contained in the `/private/**`
    // that reset `cors`, so it wins over the reset exactly as it would on one
    // path. The broader `/**` (the RESURRECTS test above) never does.
    const layer = (route: string, options: unknown): RouteRuleLayer => ({
      data: [{ name: "cors", route, options }],
    });
    const merged = mergeMatchedRouteRules(
      [layer("/**", { origin: "*" }), layer("/private/**", false)],
      [[layer("/private/x", { origin: "x" })]],
      canOverrideRouteShape,
    );
    expect(merged.cors?.options).toEqual({ origin: "x" });
    // Without a predicate there is no way to prove containment: stays reset.
    expect(
      mergeMatchedRouteRules(
        [layer("/**", { origin: "*" }), layer("/private/**", false)],
        [[layer("/private/x", { origin: "x" })]],
      ).cors,
    ).toBeUndefined();
  });

  it("a reset re-resolved later in the same reading is not treated as a reset", () => {
    // `false` then a narrower re-enable: the rule is present, so the union takes
    // the ordinary override path and the reset must not linger as a veto.
    const match = matcher({
      "/**": { cors: { origin: "*" } },
      "/app/**": { cors: false },
      "/app/ok/**": { cors: { origin: ["https://ok.example"] } },
    });
    expect(match("GET", "/app/ok/x").routeRules.cors).toMatchObject({
      origin: ["https://ok.example"],
    });
  });

  it("a broader canonical rule never DOWNGRADES a narrower rule the served path resolved", () => {
    // Encoded-dot escalation: a crafted `%2e%2e` path is served (raw) under a
    // strict narrow rule but canonicalizes *up* to a broad lax one. The union may
    // only override with an equal-or-more-specific pattern, so the broad rule must
    // NOT replace the strict policy the served admin path hits.
    // Raw `/app/admin/x/%2e%2e/%2e%2e/%2e%2e/y` matches `/app/admin/**` (h3 serves
    // the admin handler on this literal path); canonical collapses to `/y`, which
    // matches only `/**`.
    const match = matcher({
      "/**": { cors: { origin: "*" } },
      "/app/admin/**": { cors: { origin: ["https://admin.example"] } },
    });
    const { routeRules } = match("GET", "/app/admin/x/%2e%2e/%2e%2e/%2e%2e/y");
    // The strict allowlist must survive — not be shallow-merged down to `*`.
    expect(routeRules.cors).toMatchObject({ origin: ["https://admin.example"] });
  });

  it("a narrower canonical rule still OVERRIDES a broader raw rule (strengthen path intact)", () => {
    // Guard the other direction: the specificity check must not block a legitimate
    // strengthen. `/app/admin%2fpanel` is served under `/app/**` (headers) on the
    // raw path; the canonical `/app/admin/panel` reveals the narrower rule.
    const match = matcher({
      "/app/**": { headers: { "x-app": "1" } },
      "/app/admin/**": { cors: { origin: ["https://admin.example"] } },
    });
    const { routeRules } = match("GET", "/app/admin%2fpanel");
    expect(routeRules.cors).toMatchObject({ origin: ["https://admin.example"] });
    expect(routeRules.headers).toEqual({ "x-app": "1" });
  });

  it("a single-wildcard rule still applies to a raw path with an encoded separator", () => {
    // Mirrors `/single-headers/:id`: h3 serves the raw single-segment path, so
    // rules matched there must not be dropped by canonicalization.
    const match = matcher({
      "/single-headers/:id": { headers: { "x-single": "single" } },
    });
    const { routeRules } = match("GET", "/single-headers/a%2fb");
    expect(routeRules.headers).toEqual({ "x-single": "single" });
  });

  it("skips the second lookup when canonical === raw (fast path)", () => {
    const findRouteRules = vi.fn(() => [] as RouteRuleLayer[]);
    const match = createMatcherFromFind(findRouteRules);
    match("GET", "/plain/path");
    expect(findRouteRules).toHaveBeenCalledTimes(1);
    findRouteRules.mockClear();
    match("GET", "/enc%2foded");
    // The served path recased to the other hex case (a key keeps the case it
    // is written in), then the canonical reading.
    expect(findRouteRules).toHaveBeenCalledTimes(3);
    expect(findRouteRules).toHaveBeenNthCalledWith(2, "GET", "/enc%2Foded");
    expect(findRouteRules).toHaveBeenNthCalledWith(3, "GET", "/enc/oded");
  });
});

// A reset is route-aware across readings: a later reading may bring a reset
// permission back only from a pattern equal to, or more specific than, every
// pattern that reset it — the same thing a narrower pattern does on one path.
describe("resets across readings are route-aware", () => {
  const CSP = { "content-security-policy": "default-src 'self'" };
  const DOCS: Record<string, RouteRuleConfig> = {
    "/docs/**": { headers: false },
    "/docs/x/**": { headers: CSP },
  };
  const PUBLIC_CORS = { origin: ["https://public.example"] };
  const API: Record<string, RouteRuleConfig> = {
    "/api/**": { cors: false },
    "/api/public/:f": { cors: PUBLIC_CORS },
  };

  // Every matcher flavor: runtime (exact guard), preMerge, and compiled with the
  // default dependency-free shape guard, plain and pre-merged.
  const compiled = (config: Record<string, RouteRuleConfig>, preMerge: boolean) => {
    const params = Object.keys(FIXTURE_HANDLERS).map((name) => `__ruleHandlers__$${name}`);
    const code = compileFindRouteRules(config, { preMerge });
    // eslint-disable-next-line no-new-func
    const find = new Function(...params, `return (${code});`)(
      ...Object.values(FIXTURE_HANDLERS),
    ) as FindRouteRules;
    return createMatcherFromFind(find);
  };
  const flavors = (
    config: Record<string, RouteRuleConfig>,
    preMerge = true,
  ): [string, RouteRulesMatcher][] => {
    const rules = normalizeRouteRules(config);
    const plain: [string, RouteRulesMatcher][] = [
      ["runtime", createRouteRulesMatcher(rules, { handlers: FIXTURE_HANDLERS })],
      ["compiled", compiled(config, false)],
    ];
    return preMerge
      ? [
          ...plain,
          ["preMerge", createRouteRulesMatcher(rules, { handlers: FIXTURE_HANDLERS, preMerge })],
          ["compiled preMerge", compiled(config, true)],
        ]
      : plain;
  };

  it("an encoded separator cannot strip a header a narrower pattern sets", () => {
    for (const [flavor, match] of flavors(DOCS)) {
      // `/docs/x%2fy` is one opaque segment, so the served path matches only the
      // `/docs/**` reset; its canonical reading `/docs/x/y` matches `/docs/x/**`.
      expect(match("GET", "/docs/x%2fy").routeRules.headers, flavor).toEqual(CSP);
      expect(match("GET", "/docs/x%2Fy").routeRules.headers, flavor).toEqual(CSP);
      // Served nothing at all — the canonical reading's own narrower re-add wins.
      expect(match("GET", "/docs%2fx%2fy").routeRules.headers, flavor).toEqual(CSP);
      // Controls: the uncrafted path, and readings that stay outside `/docs/x/**`.
      expect(match("GET", "/docs/x/y").routeRules.headers, flavor).toEqual(CSP);
      expect(match("GET", "/docs/y").routeRules.headers, flavor).toBeUndefined();
      expect(match("GET", "/docs/a%2fb").routeRules.headers, flavor).toBeUndefined();
    }
  });

  it("through the app: the CSP header survives a `%2f` request", async () => {
    const app = new H3();
    app.use(routeRules(DOCS));
    app.all("/**", () => "ok");
    for (const path of ["/docs/x/y", "/docs/x%2fy", "/docs/x%2Fy"]) {
      const res = await app.fetch(new Request("http://localhost" + path));
      expect(await res.text(), path).toBe("ok");
      expect(res.headers.get("content-security-policy"), path).toBe("default-src 'self'");
    }
    const res = await app.fetch(new Request("http://localhost/docs/a%2fb"));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("a narrower permission is reinstated on the reading a decoding downstream sees", () => {
    // Deliberate: `/api/public%2fsecret` dispatches as one segment, but its
    // canonical reading is `/api/public/secret`, which `/api/public/:f` grants.
    for (const [flavor, match] of flavors(API)) {
      expect(match("GET", "/api/public%2fsecret").routeRules.cors, flavor).toEqual(PUBLIC_CORS);
      expect(match("GET", "/api/public/secret").routeRules.cors, flavor).toEqual(PUBLIC_CORS);
      // Controls: readings `/api/public/:f` does not contain stay reset.
      expect(match("GET", "/api/private%2fsecret").routeRules.cors, flavor).toBeUndefined();
      expect(match("GET", "/api/public%2fa%2fb").routeRules.cors, flavor).toBeUndefined();
      expect(match("GET", "/api/x").routeRules.cors, flavor).toBeUndefined();
    }
  });

  // Pin: passes on HEAD too.
  it("a broader or partially-overlapping pattern never reinstates a narrower reset", () => {
    const config: Record<string, RouteRuleConfig> = {
      "/**": { cors: { origin: "*" } },
      "/app/:page": { cors: false },
      "/:x/a/**": { cors: { origin: ["https://partial.example"] } },
    };
    // Partially overlapping keys: preMerge rejects this rule set.
    for (const [flavor, match] of flavors(config, false)) {
      // Canonical `/app/a/b` matches `/**` and `/:x/a/**`, neither of which is
      // contained in the `/app/:page` that reset `cors` on the served path.
      expect(match("GET", "/app/a%2fb").routeRules.cors, flavor).toBeUndefined();
    }
  });

  // Pin: passes on HEAD too.
  it("a re-add that won a reading only by layer order does not reinstate a reset", () => {
    // `/:x/b/**` and `/a/(b|c)/**` partially overlap, so on `/a/b/c` the
    // permission wins by layer order alone, not by being inside the reset.
    // The served `/a%2fb/c` matches neither, and its canonical reading is not
    // allowed to bring the permission back on that basis.
    const config: Record<string, RouteRuleConfig> = {
      "/:x/b/**": { cors: false },
      "/a/(b|c)/**": { cors: { origin: ["https://partial.example"] } },
    };
    for (const [flavor, match] of flavors(config, false)) {
      expect(match("GET", "/a/b/c").routeRules.cors, flavor).toBeDefined();
      expect(match("GET", "/a%2fb/c").routeRules.cors, flavor).toBeUndefined();
    }
  });

  // Pin: passes on HEAD too (HEAD never reinstates).
  it("a compiled matcher's shape guard never reinstates what runtime keeps reset", () => {
    // `/a//:q?/:s*` matches `/a` and `/a/`, which `/a//:q?/**` does not (rou3
    // matches no empty segment there), so the shape guard must not call it
    // contained — or the compiled matcher alone brings `cors` back.
    const config: Record<string, RouteRuleConfig> = {
      "/a//:q?/**": { cors: false },
      "/a//:q?/:s*": { cors: { origin: "*" } },
    };
    const [[, runtime], ...rest] = flavors(config, false);
    for (const path of ["/a//", "/a///", "/a/%2fb/c"]) {
      expect(runtime("GET", path).routeRules.cors, path).toBeUndefined();
      for (const [flavor, match] of rest) {
        expect(match("GET", path).routeRules.cors, `${flavor} ${path}`).toBeUndefined();
      }
    }
  });

  it("does not depend on reading order: every reading's resets are known first", () => {
    const layer = (route: string, options: unknown): RouteRuleLayer => ({
      data: [{ name: "cors", route, options }],
    });
    const served = [layer("/a/**", false)];
    // One reading re-adds under `/a/b/**`; another resets narrower, at `/a/b/c`.
    const adds = [layer("/a/b/**", { origin: "x" })];
    const resets = [layer("/a/b/**", { origin: "x" }), layer("/a/b/c", false)];
    for (const readings of [
      [adds, resets],
      [resets, adds],
    ]) {
      expect(mergeMatchedRouteRules(served, readings, canOverrideRouteShape).cors).toBeUndefined();
    }
    // Control: without the narrower reset the re-add is inside `/a/**` and wins.
    expect(mergeMatchedRouteRules(served, [adds], canOverrideRouteShape).cors?.options).toEqual({
      origin: "x",
    });
  });
});

describe("mergeMatchedRouteRules (pure)", () => {
  const layer = (
    route: string,
    entries: Array<{ name: string; options: unknown }>,
    params?: Record<string, string>,
  ): RouteRuleLayer => ({
    data: entries.map((e) => ({ ...e, route })),
    params,
  });

  it("merges layers least → most specific", () => {
    const merged = mergeMatchedRouteRules([
      layer("/a/**", [{ name: "headers", options: { a: "1" } }]),
      layer("/a/b", [{ name: "headers", options: { a: "2", b: "2" } }]),
    ]);
    expect(merged.headers!.options).toEqual({ a: "2", b: "2" });
    expect(merged.headers!.route).toBe("/a/b");
  });

  it("unions canonical layers without deleting raw rules", () => {
    const merged = mergeMatchedRouteRules(
      [layer("/a/**", [{ name: "headers", options: { a: "raw" } }])],
      [
        [
          layer("/a/**", [{ name: "headers", options: { a: "raw" } }]),
          layer("/a/b/**", [
            { name: "headers", options: false },
            { name: "cors", options: { origin: ["https://a.example"] } },
          ]),
        ],
      ],
    );
    // canonical `false` resolved within its own pass deletes there, but the
    // union can never delete what the raw path resolved
    expect(merged.headers!.options).toEqual({ a: "raw" });
    expect(merged.cors!.options).toEqual({ origin: ["https://a.example"] });
  });

  it("orders matched layers by `rank`, with no override predicate involved", () => {
    // Layer ordering must be decided by the build-time rank alone: the only
    // predicate a compiled matcher has by default is `canOverrideRouteShape`,
    // which is conservative but *not* exact for modifier params (it cannot see
    // that `/api/:id/**` subsumes the `/api/:path+` it appears to sit under, so
    // it decides neither direction), leaving a predicate-driven order to fall
    // back on arrival order — which fails open exactly here. No `canOverride`
    // is passed below.
    const narrow = {
      data: [{ name: "cors", route: "/api/:path+", options: { origin: ["https://a"] }, rank: 1 }],
    };
    const reset = {
      data: [{ name: "cors", route: "/api/:id/**", options: false, rank: 0 }],
    };
    // Either arrival order — rou3 hands the broader `:id/**` layer over last.
    for (const layers of [
      [narrow, reset],
      [reset, narrow],
    ]) {
      expect(mergeMatchedRouteRules(layers).cors!.options).toEqual({ origin: ["https://a"] });
    }
    // The legitimate direction is untouched: a *narrower* `false` still resets.
    const broad = {
      data: [{ name: "cors", route: "/api/:id/**", options: { origin: ["https://a"] }, rank: 0 }],
    };
    const narrowReset = {
      data: [{ name: "cors", route: "/api/:path+", options: false, rank: 1 }],
    };
    expect(mergeMatchedRouteRules([narrowReset, broad]).cors).toBeUndefined();
  });

  it("returns empty map for no layers", () => {
    expect(mergeMatchedRouteRules(undefined)).toEqual({});
    expect(mergeMatchedRouteRules([], [])).toEqual({});
  });

  it("a `__proto__` / `constructor` rule name cannot pollute Object.prototype", () => {
    // Rule names are attacker-influenceable config keys. The merge accumulator is
    // a null-prototype object, so `routeRules["__proto__"]` is a plain own key
    // rather than the inherited `Object.prototype` getter — otherwise the update
    // branch would assign `currentRule.options/route/method` onto Object.prototype
    // (a process-wide DoS). This path bypasses `normalizeRouteRules` (compiled /
    // hand-built matchers), so the runtime merge must be self-defending.
    for (const name of ["__proto__", "constructor"]) {
      const layers = [
        { data: [{ name, route: "/x", options: { polluted: true } }], params: undefined },
      ];
      const merged = mergeMatchedRouteRules(layers as never);
      expect(Object.hasOwn(Object.prototype, "options")).toBe(false);
      expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
      expect(({} as Record<string, unknown>).options).toBeUndefined();
      // the rule is still carried as an own key of the (null-proto) result
      expect(Object.keys(merged)).toContain(name);
    }
  });
});
