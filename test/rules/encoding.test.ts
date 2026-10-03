import { describe, expect, it, vi } from "vitest";
import { H3 } from "../../src/index.ts";
import { routeRules } from "../../src/rules/middleware.ts";
import { proxy } from "../../src/rules/proxy.ts";
import {
  canOverrideRouteShape,
  createMatcherFromFind,
  createRouteRulesMatcher,
  createRulesRouter,
} from "../../src/rules/match.ts";
import type { FindRouteRules } from "../../src/rules/match.ts";
import type { RouteRuleLayer } from "../../src/rules/merge.ts";
import { normalizeRouteRules } from "../../src/rules/normalize.ts";
import { decodeRoutePattern } from "../../src/rules/internal/key.ts";
import { decodedPath, isPathInScope } from "../../src/rules/internal/scope.ts";
import { prepareRuleTarget } from "../../src/rules/handlers/_utils.ts";
import type { RuleTargetResolver } from "../../src/rules/handlers/_utils.ts";
import { canonicalPathname, normalizeRoute } from "../../src/utils/internal/path.ts";
import { findAllRoutes } from "rou3";
import { compileFindRouteRules } from "../../src/rules/compiler.ts";
import { ruleHandlers } from "../../src/rules/handlers/index.ts";
import type { RouteRulesMatcher } from "../../src/rules/match.ts";
import type {
  ProxyRuleOptions,
  RouteRuleConfig,
  RuleHandler,
  RuleHandlers,
} from "../../src/rules/types.ts";

// Count decode passes so the `decodedPath` bound can be asserted as an
// operation count instead of a wall clock. The mock only wraps the real
// function — every other consumer of the module is unaffected.
const decodePasses = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../src/utils/internal/path.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/internal/path.ts")>();
  return {
    ...actual,
    decodePreservingSeparators(value: string) {
      decodePasses.count++;
      return actual.decodePreservingSeparators(value);
    },
  };
});

// A rule pattern is written with the character itself (`/@admin/**`, the natural
// spelling), so it must also match the percent-encoded request spelling, which
// any decoding consumer — a proxied backend, a static asset store, nginx —
// resolves back to it. The matcher owns that: it resolves each path against its
// decoded reading (`decodedPath`) as well as the served one.
//
// Spelled with `redirect`: it short-circuits, so "the rule matched" is observable
// end to end as a 307 the route handler never got to answer.
const RULE = { redirect: "/elsewhere" } as const;

// `headers` does not type a `false` reset, but the matcher honours one.
const HEADERS_RESET = false as unknown as Record<string, string>;

// A restricting gate's options, for the gating tests below.
const RL = { restricted: { label: "gate" } };

// The runtime, preMerge and compiled matchers for one rule set — every
// behaviour below must hold in all three.
function allModes(
  config: Record<string, RouteRuleConfig>,
  opts: { handlers?: RuleHandlers; baseURL?: string } = {},
): Record<"runtime" | "preMerge" | "compiled", RouteRulesMatcher> {
  const handlers: RuleHandlers = { ...ruleHandlers, ...opts.handlers };
  const normalized = normalizeRouteRules(config);
  const custom = Object.keys(opts.handlers || {});
  const code = compileFindRouteRules(config, {
    baseURL: opts.baseURL,
    runtimeRules: Object.fromEntries(custom.map((name) => [name, "./" + name])),
  });
  const names = Object.keys(handlers);
  // eslint-disable-next-line no-new-func
  const find = new Function(
    ...names.map((name) => `__ruleHandlers__$${name}`),
    `return (${code});`,
  )(...Object.values(handlers)) as FindRouteRules;
  return {
    runtime: createRouteRulesMatcher(normalized, { handlers, baseURL: opts.baseURL }),
    preMerge: createRouteRulesMatcher(normalized, {
      handlers,
      baseURL: opts.baseURL,
      preMerge: true,
    }),
    compiled: createMatcherFromFind(find),
  };
}
const MATCHED = { to: "/elsewhere", status: 307 } as const;

// Escapes h3 *still serves opaque*: those the URL serializer would re-add, so
// `canonicalPathname` leaves them alone (`src/utils/internal/path.ts`). These are
// the ones the matcher's decoded reading has to carry on its own — they reach it
// encoded even through a real request, so they gate end to end.
const OPAQUE_ENCODABLE: Array<[raw: string, encoded: string]> = [
  [" ", "%20"],
  ["é", "%C3%A9"],
];

// Escapes h3 canonicalizes away before routing, so a real request never reaches
// the matcher still carrying one. Kept as matcher-level coverage: `h3/rules` is
// usable standalone (a compiled matcher, a non-h3 caller) and must not regress to
// matching only one spelling. `?`/`#` are omitted: they terminate the path, so
// neither can occur raw in a pathname.
const CANONICALIZED_ENCODABLE: Array<[raw: string, encoded: string]> = [
  ["@", "%40"],
  [";", "%3B"],
  ["&", "%26"],
  ["=", "%3D"],
  ["+", "%2B"],
  ["$", "%24"],
  [",", "%2C"],
];

const ENCODABLE = [...OPAQUE_ENCODABLE, ...CANONICALIZED_ENCODABLE];

describe("encoded reserved characters cannot dodge a rule", () => {
  it.each(ENCODABLE)("`%s` written raw in the pattern still matches `%s`", (raw, encoded) => {
    const match = createRouteRulesMatcher(normalizeRouteRules({ [`/${raw}admin/**`]: RULE }));
    expect(match("GET", `/${raw}admin/data`).routeRules.redirect).toMatchObject(MATCHED);
    expect(match("GET", `/${encoded}admin/data`).routeRules.redirect).toMatchObject(MATCHED);
  });

  it.each(ENCODABLE)(
    "`%s` written encoded in the pattern still matches the raw path",
    (raw, enc) => {
      const match = createRouteRulesMatcher(normalizeRouteRules({ [`/${enc}admin/**`]: RULE }));
      expect(match("GET", `/${enc}admin/data`).routeRules.redirect).toMatchObject(MATCHED);
      expect(match("GET", `/${raw}admin/data`).routeRules.redirect).toMatchObject(MATCHED);
    },
  );

  // The escapes h3 serves opaque are the ones only the matcher can catch: nothing
  // upstream decodes them, so without the decoded reading these walk past the rule
  // and a proxied backend serves them as the raw spelling.
  it.each(OPAQUE_ENCODABLE)(
    "`%s` matches `%s` end to end, unaided by canonicalization",
    async (raw, encoded) => {
      const app = new H3();
      app.use(routeRules({ [`/${raw}admin/**`]: RULE }));
      app.all("/**", () => "from the handler");
      // Pin that h3 really did leave it encoded — otherwise this asserts nothing.
      app.get("/probe" + encoded, (event) => event.url.pathname);
      const probe = await app.fetch(new Request(`http://test/probe${encoded}`));
      expect(await probe.text()).toBe(`/probe${encoded}`);

      const res = await app.fetch(new Request(`http://test/${encoded}admin/data`));
      expect(res.status).toBe(307);
    },
  );

  it("matches a regex constraint written with non-ASCII text end to end", async () => {
    // rou3 encodes a pattern's literal text but not a regex constraint, so the
    // rule keeps a raw `é` that only the raw decoded reading can match.
    const app = new H3();
    app.use(routeRules({ "/(café|tea)/**": RULE }));
    app.get("/(café|tea)/**", () => "from the handler");
    const res = await app.fetch(new Request("http://test/caf%C3%A9/x"));
    expect(res.status).toBe(307);
  });

  it("matches a regex constraint written with encoded non-ASCII text end to end", async () => {
    // Pin: passes on HEAD too. The constraint keeps
    // `caf%C3%A9` as written, and the served and re-encoded readings reach it
    // from every spelling.
    const app = new H3();
    app.use(routeRules({ "/(caf%C3%A9|tea)/**": RULE }));
    app.all("/**", () => "from the handler");
    for (const path of ["/café/x", "/caf%C3%A9/x", "/caf%c3%a9/x", "/caf%25C3%25A9/x", "/tea/x"]) {
      const res = await app.fetch(new Request("http://test" + path));
      expect(res.status, path).toBe(307);
    }
  });

  it("matches a `%25`-nested spelling end to end", async () => {
    // `%2520` survives canonicalization (`%25` is never decoded), and only
    // `decodedPath`'s fixpoint unwraps it to the space the pattern is written with.
    const app = new H3();
    app.use(routeRules({ "/a admin/**": RULE }));
    app.all("/**", () => "from the handler");
    const res = await app.fetch(new Request("http://test/a%2520admin/data"));
    expect(res.status).toBe(307);
  });

  it("matches the encoded spelling end to end, for every method", async () => {
    const app = new H3();
    app.use(routeRules({ "/@admin/**": RULE }));
    app.all("/**", () => "from the handler");

    for (const path of ["/@admin/data", "/%40admin/data", "/%40admin/x/y"]) {
      const res = await app.fetch(new Request("http://test" + path));
      expect(res.status, path).toBe(307);
      expect(res.headers.get("location"), path).toBe("/elsewhere");
    }
    const post = await app.fetch(new Request("http://test/%40admin/action", { method: "POST" }));
    expect(post.status).toBe(307);
  });

  it("does not match a path that merely decodes to a different route", async () => {
    const app = new H3();
    app.use(routeRules({ "/@admin/**": RULE }));
    app.all("/**", () => "public");
    // `%40admin` only matters as the first segment here.
    const res = await app.fetch(new Request("http://test/public/%40admin"));
    expect(res.status).toBe(200);
  });

  it("an encoded reading may add a rule but never downgrade a narrower one", () => {
    const match = createRouteRulesMatcher(
      normalizeRouteRules({
        "/**": { redirect: "/broad" },
        "/@admin/**": RULE,
      }),
    );
    // Both spellings resolve the *narrow* rule, not the broad one.
    for (const path of ["/@admin/x", "/%40admin/x"]) {
      expect(match("GET", path).matchedRules.redirect, path).toMatchObject({
        route: "/@admin/**",
        options: MATCHED,
      });
    }
  });

  it("matches a `%25`-nested spelling a double-decoding downstream resolves", () => {
    // `%2540admin` survives h3's own decode as `%2540admin`; a proxy that decodes
    // and a backend that decodes again land on `/@admin`. The dot/separator
    // machinery already covers every `%25` depth (`%252e`, `%252f`), so the
    // decoded reading has to as well or the two disagree.
    const match = createRouteRulesMatcher(normalizeRouteRules({ "/@admin/**": RULE }));
    expect(match("GET", "/%2540admin/x").routeRules.redirect).toMatchObject(MATCHED);
    expect(match("GET", "/%25252540admin/x").routeRules.redirect).toMatchObject(MATCHED);
  });

  it("a `false` reset still applies through the encoded spelling", () => {
    const match = createRouteRulesMatcher(
      normalizeRouteRules({
        "/@admin/**": RULE,
        "/@admin/public/**": { redirect: false },
      }),
    );
    expect(match("GET", "/%40admin/public/x").routeRules.redirect).toBeUndefined();
    expect(match("GET", "/%40admin/private/x").routeRules.redirect).toBeDefined();
  });
});

describe("decodeRoutePattern", () => {
  it("normalizes a key exactly like a route", () => {
    // Needless escapes decode (as `canonicalPathname` does for routes and
    // requests), raw text the URL serializer would encode is encoded, and every
    // other escape stays exactly as written — as the route keeps it.
    expect(decodeRoutePattern("/%40admin/**")).toBe("/@admin/**");
    expect(decodeRoutePattern("/a%20b")).toBe("/a%20b");
    expect(decodeRoutePattern("/a b")).toBe("/a%20b");
    expect(decodeRoutePattern("/caf%C3%A9/x")).toBe("/caf%C3%A9/x");
    expect(decodeRoutePattern("/caf%c3%a9/x")).toBe("/caf%c3%a9/x");
    expect(decodeRoutePattern("/café/x")).toBe("/caf%C3%A9/x");
    expect(decodeRoutePattern("/plain/path")).toBe("/plain/path");
  });

  it("keeps escapes that would change the pattern's segment count", () => {
    // Separators, at any `%25`-nesting depth — decoding one would give the
    // pattern a boundary the router never matched on.
    expect(decodeRoutePattern("/a%2Fb")).toBe("/a%2Fb");
    expect(decodeRoutePattern("/a%2fb")).toBe("/a%2fb");
    expect(decodeRoutePattern("/a%5Cb")).toBe("/a%5Cb");
    // A `%` would fabricate a new escape.
    expect(decodeRoutePattern("/a%252fb")).toBe("/a%252fb");
  });

  it("resolves an escaped rou3 metacharacter exactly as h3 resolves it in a route", () => {
    // h3 canonicalizes a route pattern and every request path through the same
    // `canonicalPathname` pass, so an escaped metacharacter *becomes* that
    // metacharacter (`H3.route`). A rule key has to agree: holding `%3A` back
    // would leave the pattern matching only `/%3Aid`, a spelling no request can
    // carry anymore, so the rule would silently never fire.
    expect(decodeRoutePattern("/%3Aid/**")).toBe("/:id/**");
    expect(decodeRoutePattern("/f/%2A%2A")).toBe("/f/**");
    expect(decodeRoutePattern("/%28a%29")).toBe("/(a)");
    for (const pattern of ["/%3Aid/**", "/f/%2A%2A", "/%28a%29", "/a%2F%3Ab", "/%40admin/**"]) {
      expect(decodeRoutePattern(pattern)).toBe(canonicalPathname(pattern));
    }
  });

  it("keeps an escaped metacharacter reachable end to end", async () => {
    const app = new H3();
    app.use(routeRules({ "/a/%3Aid": { headers: { "x-hit": "1" } } }));
    app.all("/**", () => "ok");
    // Registered as the `:id` param route, so it matches any segment — and the
    // literal `/a/%3Aid` request arrives canonicalized to `/a/:id`, which it
    // also matches.
    for (const path of ["/a/anything", "/a/%3Aid"]) {
      const res = await app.fetch(new Request("http://test" + path));
      expect(res.headers.get("x-hit")).toBe("1");
    }
  });

  it("never decodes an escape into rou3 syntax (the original `%7B` bug)", () => {
    // `canonicalPathname` leaves these encoded in a route, so `app.get` matches
    // them literally — decoding one in the rule key would turn it into a group
    // (`{q}`), an optional / quantifier (`?`), a regex anchor or negation (`^`),
    // or a character rou3 rejects (tab, LF, CR, U+FFFD-U+FFFF).
    for (const key of [
      "/%7Bq%7D/a",
      "/%7bq%7d/a",
      "/a%3F",
      "/a%5Eb",
      "/a%09b%0A%0D%00",
      "/a%EF%BF%BD",
      "/%7B%C3%A9%7D%20x",
    ]) {
      expect(decodeRoutePattern(key), key).toBe(key);
    }
    // Nor into a param name: `:id` followed by the literal `é`, as in the route.
    expect(decodeRoutePattern("/:idé")).toBe("/:id%C3%A9");
    expect(decodeRoutePattern("/:id%c3%a9")).toBe("/:id%c3%a9");
  });

  it("leaves escapes inside a regex constraint as written", () => {
    // rou3 does not encode constraint text, so there `%5e` is three regex
    // characters — decoding or recasing it would change the regex.
    for (const key of [
      "/:id([%5e])",
      "/:id(a%3f+)",
      "/:id([%01])/%7b%20",
      "/:id(x%3fy)/a%3fb",
      "/:id([^A-Z]+)/%7d",
      "/(caf%C3%A9|tea)/caf%C3%A9",
      String.raw`/a\(%7b`,
    ]) {
      expect(decodeRoutePattern(key), key).toBe(key);
    }
    // Needless escapes still decode everywhere, as `canonicalPathname` does.
    expect(decodeRoutePattern("/:id(%40)")).toBe("/:id(@)");
  });

  it("is byte-identical to the route pattern (`normalizeRoute`)", () => {
    expect(decodeRoutePattern("/:id([>])")).toBe("/:id([%3E])");
    expect(decodeRoutePattern("/:id(é)/é")).toBe("/:id(%C3%A9)/%C3%A9");
    expect(decodeRoutePattern("/(café|tea)/**")).toBe("/(caf%C3%A9|tea)/**");
    expect(decodeRoutePattern("/café/a b/**")).toBe("/caf%C3%A9/a%20b/**");
    // Dot segments resolve as in a route (and in every request path).
    expect(decodeRoutePattern("/%2e%2e/**")).toBe("/**");
    // Normalization can itself produce a mix of hex cases, as in the route.
    expect(decodeRoutePattern("/bä/(x%c3%a9)/**")).toBe("/b%C3%A4/(x%c3%a9)/**");
    for (const key of [
      "/:id([>])",
      "/:id(é)/é",
      "/(café|tea)/**",
      "/%2e%2e/**",
      "/:id(%7d)/%7d",
      "/:idé",
      "/docs/a%2Fb/%c3%a9",
      "/caf%c3%a9/%2Fx/**",
      "/a%7d/%2525",
      "//:id%3f",
      "/%7bq%7d/a",
      "/a b/caf%c3%a9",
    ]) {
      expect(decodeRoutePattern(key), key).toBe(normalizeRoute(key));
    }
  });

  // Each case: [key, request paths the route serves, request paths it does not].
  // The route and the rule are registered from the same string, so the rule
  // must apply to exactly the requests that reach the route.
  const SYNTAX_PARITY: Array<[key: string, served: string[], other: string[]]> = [
    ["/%7Bq%7D/a", ["/%7Bq%7D/a"], ["/q/a"]],
    ["/a%7Bb%7D%3F", ["/a%7Bb%7D%3F"], ["/a", "/ab"]],
    ["/:id(x%3Fy)", ["/x%3Fy"], ["/y", "/xy"]],
    ["/:id(x%7B2%7D)", ["/x%7B2%7D"], ["/xx"]],
    ["/:id(%5B%5Ea%5D)", ["/a", "/E"], ["/b"]],
    ["/x%09y", ["/x%09y"], ["/xy"]],
    // Escapes inside a regex constraint are regex characters, never decoded.
    ["/:id([%5e])", ["/e", "/5"], ["/E"]],
    ["/:id(a%3f+)", ["/a%3f", "/a%3fff"], ["/a"]],
    ["/:id([%01])", ["/0", "/1"], ["/x"]],
    ["/:id(a%20+)", ["/a%200"], ["/a"]],
    ["/:slug([a-z%C3%A9]+)", ["/A9C3", "/café"], ["/Z"]],
    // A constraint escape and a literal escape of the same character.
    ["/:id(x%3fy)/a%3fb", ["/x%3fy/a%3fb"], ["/xy/ab"]],
    ["/:id(%7d)/%7d", ["/%7d/%7d"], ["/x/y"]],
    ["/:id(%c3%a9)/%c3%a9", ["/%c3%a9/%c3%a9"], ["/x/y"]],
    // Raw text in a constraint, which the route encodes.
    ["/:id([>])", ["/E", "/3"], ["/x"]],
    ["/:id(é)/é", ["/é/é", "/%C3%A9/%C3%A9"], ["/x/y"]],
    ["/a%5C(<)", ["/a%5C<", "/a%5C%3C"], ["/x"]],
    // Raw syntax stays syntax in both: the group matches `/ab`, not the literal.
    ["/a{b}", ["/ab", "/%61b"], ["/a%7Bb%7D"]],
    // An uppercased escape next to an opaque `%2F` / `%25` / `//` elsewhere in
    // the key, requested in the key's own (lowercase) spelling.
    ["/docs/a%2Fb/%c3%a9", ["/docs/a%2Fb/%c3%a9"], ["/docs/a/b/x"]],
    ["/caf%c3%a9/%2Fx/**", ["/caf%c3%a9/%2Fx/z"], ["/x"]],
    ["/%7bq%7d/%2F/**", ["/%7bq%7d/%2F/z"], ["/q/z"]],
    ["/a%7d/%2525", ["/a%7d/%2525"], ["/a/x"]],
    ["//:id%3f", ["//x%3f"], ["/x"]],
    // A constraint that matches escape text without containing a `%`.
    ["/:id([^A-Z]+)/%7d", ["/%7b/%7d"], ["/x/y"]],
    [String.raw`/:id(\x25[a-f0-9]+)/%7d`, ["/%3c/%7d"], ["/x/y"]],
    // A non-ASCII character right after a param name.
    ["/:idé", ["/xé", "/x%C3%A9"], ["/x"]],
    ["/:id%C3%A9", ["/x%C3%A9"], ["/x"]],
  ];

  it.each(SYNTAX_PARITY)(
    "`%s` gates exactly the requests its route serves",
    async (key, served, other) => {
      const app = new H3();
      app.use(routeRules({ [key]: { headers: { "x-hit": "1" } } }));
      app.get(key, () => "route");
      app.all("/**", () => "other");
      for (const path of served) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(await res.text(), path).toBe("route");
        expect(res.headers.get("x-hit"), path).toBe("1");
      }
      for (const path of other) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(await res.text(), path).toBe("other");
        expect(res.headers.get("x-hit"), path).toBeNull();
      }
    },
  );

  it("an encoded rou3 metacharacter cannot be dodged by another spelling", async () => {
    const app = new H3();
    app.use(routeRules({ "/%7bq%7d/**": RULE }));
    app.all("/**", () => "from the handler");
    for (const path of ["/%7Bq%7D/x", "/%7bq%7d/x", "/%257Bq%257D/x", "/%7Bq%7D/x/y"]) {
      const res = await app.fetch(new Request("http://test" + path));
      expect(res.status, path).toBe(307);
    }
    // The group reading of the key never applies.
    const res = await app.fetch(new Request("http://test/q/x"));
    expect(res.status).toBe(200);
  });

  // A key with a regex constraint keeps its escapes as written (no recasing,
  // see `decodeRoutePattern`), so a lowercase one is reached through the
  // lowercase-hex readings the matcher adds for such a rule set.
  const LOWERCASE_CONSTRAINT_KEYS: Array<[key: string, paths: string[]]> = [
    [
      "/(a|b)/caf%c3%a9/**",
      ["/a/caf%c3%a9/x", "/a/café/x", "/a/caf%C3%A9/x", "/b/caf%25C3%25A9/x"],
    ],
    [String.raw`/:id(\d+)/caf%c3%a9/**`, ["/1/caf%c3%a9/x", "/1/caf%C3%A9/x", "/1/café/x"]],
    ["/(caf%c3%a9|tea)/**", ["/caf%c3%a9/x", "/café/x", "/caf%C3%A9/x", "/caf%25C3%25A9/x"]],
  ];

  // Pin: passes on HEAD too — guards that recased readings keep covering lowercase constraint keys.
  it.each(LOWERCASE_CONSTRAINT_KEYS)(
    "`%s` (lowercase escapes in a constraint key) covers every case spelling",
    async (key, paths) => {
      const app = new H3();
      app.use(routeRules({ [key]: { headers: { "x-hit": "1" } } }));
      app.all("/**", () => "from the handler");
      for (const path of paths) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(res.headers.get("x-hit"), path).toBe("1");
      }
      // Still not a different resource.
      const res = await app.fetch(new Request("http://test/a/cafe/x"));
      expect(res.headers.get("x-hit")).toBeNull();
    },
  );

  it("a baseURL and key in one hex case are reached from every spelling", () => {
    const spellings = [
      "/b%C3%A4se/caf%C3%A9/22",
      "/b%c3%a4se/caf%c3%a9/22",
      "/b%C3%A4se/caf%c3%a9/22",
      "/b%C3%A4se/caf%25C3%25A9/22",
    ];
    // The base is registered as written, like the key; the request's uppercase
    // and lowercase recasings reach a base and key spelled in one case.
    for (const [baseURL, key] of [
      ["/b%c3%a4se", "/caf%c3%a9/**"],
      ["/b%c3%a4se", String.raw`/caf%c3%a9/:n(\d+)`],
      ["/b%C3%A4se", String.raw`/caf%C3%A9/:n(\d+)`],
    ]) {
      const match = createRouteRulesMatcher(normalizeRouteRules({ [key!]: RULE }), { baseURL });
      for (const path of spellings) {
        expect(match("GET", path).routeRules.redirect, `${baseURL} ${key} ${path}`).toMatchObject(
          MATCHED,
        );
      }
    }
    // A base and key in different hex cases register a mixed pattern, which
    // only its exact spelling reaches (documented).
    const mixed = createRouteRulesMatcher(
      normalizeRouteRules({ [String.raw`/caf%c3%a9/:n(\d+)`]: RULE }),
      { baseURL: "/b%C3%A4se" },
    );
    expect(mixed("GET", "/b%C3%A4se/caf%c3%a9/22").routeRules.redirect).toMatchObject(MATCHED);
  });

  // Pin: passes on HEAD too — guards the exact spelling of a case-sensitive constraint under a base.
  it("never recases a baseURL above a case-sensitive constraint", () => {
    // Recasing the base would leave the exact spelling reachable only through a
    // reading that also recases `%7b`, which `[a-f0-9%]+` rejects.
    const match = createRouteRulesMatcher(
      normalizeRouteRules({ "/:id([a-f0-9%]+)/x": { headers: { "x-hit": "1" } } }),
      { baseURL: "/b%c3%a4se" },
    );
    expect(match("GET", "/b%c3%a4se/%7b/x").routeRules.headers).toBeDefined();
  });

  it("a wildcard redirect under a lowercase constraint key applies to every spelling", async () => {
    const app = new H3();
    app.use(routeRules({ "/(caf%c3%a9|tea)/**": { redirect: { to: "/new/**" } } }));
    app.all("/**", () => "from the handler");
    for (const path of ["/caf%c3%a9/x", "/café/x", "/caf%C3%A9/x", "/caf%25C3%25A9/x"]) {
      const res = await app.fetch(new Request("http://test" + path));
      expect(res.status, path).toBe(307);
      expect(res.headers.get("location"), path).toBe("/new/x");
    }
  });

  it("reaches a lowercase constraint key through the served path's lowercase reading", () => {
    // `%2f` sends every decoded spelling through the canonical passes, which
    // decode it — only the served path recased verbatim keeps it a literal.
    const match = createRouteRulesMatcher(
      normalizeRouteRules({ "/(caf%c3%a9)/a%2fb": { headers: { "x-hit": "1" } } }),
    );
    for (const path of ["/caf%c3%a9/a%2fb", "/caf%C3%A9/a%2Fb", "/caf%C3%A9/a%2fb"]) {
      expect(match("GET", path).routeRules.headers, path).toBeDefined();
    }
  });

  // A broad `false` reset matched on the served path must not swallow the
  // narrower rule written for that exact path — whose key spells its escapes in
  // uppercase hex, so it only matches the served path's uppercase reading.
  // Pin: passes on HEAD too — regression guard for a bug an earlier iteration of this change introduced.
  it.each([
    ["/a%2fb/x", "/a%2fb/x"],
    ["/a%5cb/x", "/a%5cb/x"],
    ["/docs/a%2fb/**", "/docs/a%2fb/x"],
  ])(
    "a broad reset does not drop the narrower rule `%s` (all modes, and the app)",
    async (key, path) => {
      const config: Record<string, RouteRuleConfig> = {
        "/**": { headers: HEADERS_RESET },
        [key]: { headers: { "x-csp": "on" } },
      };
      for (const [mode, match] of Object.entries(allModes(config))) {
        expect(match("GET", path).routeRules.headers, mode).toEqual({ "x-csp": "on" });
        // The reset still holds everywhere else.
        expect(match("GET", "/other").routeRules.headers, mode).toBeUndefined();
      }
      for (const preMerge of [false, true]) {
        const app = new H3();
        app.use(routeRules(config, { preMerge }));
        app.get(key, () => "ok");
        const res = await app.fetch(new Request("http://test" + path));
        expect(await res.text()).toBe("ok");
        expect(res.headers.get("x-csp"), `preMerge: ${preMerge}`).toBe("on");
      }
    },
  );

  // A request's hex case is not meaningful (RFC 3986 §6.2.2.1), but a key keeps
  // the case it is written in: a `false` on it resets a broader permission on
  // its own spelling, and the request's other hex-case spellings are ordinary
  // alternate readings — they can add rules, never apply a reset.
  // Pin: passes on HEAD too — guards HEAD's semantics: the reset applies on its key's spelling, union-only elsewhere.
  it("a narrower reset protects its key's own written spelling (all modes)", () => {
    // The key keeps its spelling, like the route `app.get("/team%2fprivate/**")`,
    // so the reset applies on every request that route serves.
    const modes = allModes({
      "/**": { cors: { origin: "*" } },
      "/team%2fprivate/**": { cors: false },
    });
    for (const [mode, match] of Object.entries(modes)) {
      expect(match("GET", "/team%2fprivate/x").routeRules.cors, mode).toBeUndefined();
      expect(match("GET", "/team/x").routeRules.cors, mode).toBeDefined();
      // Another hex-case spelling (which that route does not serve) gets rules
      // union-only, as every alternate reading: the reset does not subtract
      // there — the same as HEAD (documented).
      expect(match("GET", "/team%2Fprivate/x").routeRules.cors, mode).toBeDefined();
    }
  });

  it("a broad constraint key cannot undo a narrower reset under a lowercase baseURL", () => {
    const modes = allModes(
      {
        "/(api|v2)/**": { cors: { origin: "*" } },
        "/api/private/**": { cors: false },
      },
      { baseURL: "/b%c3%a4" },
    );
    for (const [mode, match] of Object.entries(modes)) {
      for (const path of ["/b%c3%a4/api/private/x", "/b%C3%A4/api/private/x"]) {
        expect(match("GET", path).routeRules.cors, `${mode} ${path}`).toBeUndefined();
      }
      for (const path of ["/b%c3%a4/api/public", "/b%C3%A4/v2/x"]) {
        expect(match("GET", path).routeRules.cors, `${mode} ${path}`).toBeDefined();
      }
    }
  });

  // Pin: passes on HEAD too — guards HEAD's reset semantics in every mode.
  it("a canonical reading never resurrects a permission a partial-segment param reset", () => {
    // `/files/:name.:ext` matches the served segment; the canonical reading
    // `/files/report` must not bring `/**`'s permission back — in any mode,
    // including the compiled matcher's dependency-free shape guard.
    const modes = allModes({
      "/**": { headers: { "access-control-allow-origin": "*" } },
      "/files/:name.:ext": { headers: HEADERS_RESET },
      "/files/report": { headers: { "x-public": "1" } },
    });
    for (const [mode, match] of Object.entries(modes)) {
      expect(
        match("GET", "/files/x.y%2f..%2f..%2ffiles%2freport").routeRules.headers,
        mode,
      ).toBeUndefined();
      expect(match("GET", "/files/report").routeRules.headers, mode).toBeDefined();
    }
  });

  it("a constraint key's reset under a lowercase baseURL agrees across modes", () => {
    // `/**` and `/a/b` register under the uppercased base, `/(a|z)/**` under
    // the base as written — and also under the uppercased one, so the uppercase
    // reading sees the reset next to the broader rule it resets.
    const auth: RuleHandler<"restricted"> = {
      restricting: true,
      handler: () => (_event, next) => next(),
    };
    const modes = allModes(
      {
        "/**": { restricted: { label: "strict" } },
        "/(a|z)/**": { restricted: false },
        "/a/b": { headers: { "x-a": "1" } },
      },
      { handlers: { restricted: auth }, baseURL: "/b%c3%a4" },
    );
    for (const [mode, match] of Object.entries(modes)) {
      for (const path of ["/b%c3%a4/a/b", "/b%C3%A4/a/b"]) {
        const { routeRules } = match("GET", path);
        expect(routeRules.restricted, `${mode} ${path}`).toBeUndefined();
        expect(routeRules.headers, `${mode} ${path}`).toEqual({ "x-a": "1" });
      }
      expect(match("GET", "/b%c3%a4/q/b").routeRules.restricted, mode).toBeDefined();
    }
  });

  // Pin: passes on HEAD too — guards case coverage of escaped keys.
  it("covers every case spelling of an escaped key, either way", async () => {
    // A lowercase key gates the uppercase spelling a catch-all would serve, and
    // an uppercase key the lowercase one — neither is narrowed to its own case.
    for (const key of ["/caf%c3%a9/**", "/caf%C3%A9/**", "/café/**"]) {
      const app = new H3();
      app.use(routeRules({ [key]: RULE }));
      app.all("/**", () => "from the handler");
      for (const path of ["/café/x", "/caf%C3%A9/x", "/caf%c3%a9/x", "/caf%25C3%25A9/x"]) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(res.status, `${key} ${path}`).toBe(307);
      }
    }
  });

  it("leaves malformed encoding exactly as authored", () => {
    expect(decodeRoutePattern("/a%C3")).toBe("/a%C3");
  });

  it("is idempotent (byte-identical codegen depends on it)", () => {
    for (const pattern of [
      "/%40a/**",
      "/%3Aid",
      "/f/%2A%2A",
      "/a%252fb",
      "/caf%C3%A9",
      "/a%C3",
      "/%7bq%7d%3f",
      "/%7B%C3%A9%7D",
      "/:id(%7d)/%7d",
      "/(café|tea)/é",
      // An escape fabricated by decoding (`%2%31` → `%21`), next to a
      // constraint escape that skips the second pass.
      "/a%2%31(%25%20)",
      "/a%2%31/%c3%a9",
      "/:idé",
      "/docs/a%2fb/%c3%a9",
    ]) {
      expect(decodeRoutePattern(decodeRoutePattern(pattern))).toBe(decodeRoutePattern(pattern));
    }
  });

  it("merges rules whose keys collide once decoded", () => {
    const normalized = normalizeRouteRules({
      "/@admin/**": { headers: { "x-a": "1" } },
      "/%40admin/**": { headers: { "x-b": "2" } },
    });
    expect(Object.keys(normalized)).toEqual(["/@admin/**"]);
    expect(normalized["/@admin/**"]!.headers).toEqual({ "x-a": "1", "x-b": "2" });

    // `/café` encodes to the uppercase spelling a route registers; a key
    // spelled in lowercase hex stays its own pattern, like its route.
    const cafe = normalizeRouteRules({
      "/café/**": { headers: { "x-a": "1" } },
      "/caf%C3%A9/**": { headers: { "x-b": "2" } },
      "/caf%c3%a9/**": { headers: { "x-c": "3" } },
    });
    expect(Object.keys(cafe)).toEqual(["/caf%C3%A9/**", "/caf%c3%a9/**"]);
  });
});

describe("hex-case spellings are union-only alternate readings", () => {
  // A request's hex case is not meaningful, but a key keeps the case it is
  // written in (like its route), so the matcher also looks up the served path
  // recased to uppercase and lowercase hex. Like every alternate reading these
  // only add rules — a restricting one is re-added (fail closed) — and never
  // apply a reset, so a gate is never lost to another spelling.
  const gate = (): { handlers: RuleHandlers; app: H3 } => {
    const restricted: RuleHandler<"restricted"> = {
      restricting: true,
      handler: () => (event, next) => {
        event.context.gated = true;
        return next();
      },
    };
    return { handlers: { restricted }, app: new H3() };
  };

  it.each([
    // [rules, route patterns, request paths that must stay gated]
    [
      {
        "/(caf%c3%a9)/**": { restricted: { label: "gate" } },
        "/caf%C3%A9/**": { restricted: false },
      },
      ["/(caf%c3%a9)/**", "/caf%C3%A9/**"],
      ["/caf%c3%a9/x"],
    ],
    [
      {
        "/d/:n([a-z0-9%]+)/**": { restricted: { label: "gate" } },
        "/d/:n([A-Z0-9%]+)/**": { restricted: false },
      },
      ["/d/:n([a-z0-9%]+)/**", "/d/:n([A-Z0-9%]+)/**"],
      // The uppercase spelling is exempt on its own route, but its lowercase
      // spelling is gated, so the gate is re-added there: fail closed.
      ["/d/%c3%a9/x", "/d/%C3%A9/x"],
    ],
    [
      {
        "/**": {},
        "/(caf%c3%a9)/**": { restricted: { label: "gate" } },
        "/caf%C3%A9/**": {},
        "/caf%C3%A9/x/**": { restricted: false },
      },
      ["/(caf%c3%a9)/**"],
      ["/caf%c3%a9/x/y"],
    ],
  ] satisfies [Record<string, RouteRuleConfig>, string[], string[]][])(
    "another spelling's `false` never drops a gate (%#)",
    async (rules, routes, paths) => {
      const { handlers, app } = gate();
      app.use(routeRules(rules, { handlers }));
      for (const route of routes) {
        app.all(route, (event) => `gated=${!!event.context.gated}`);
      }
      for (const path of paths) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(await res.text(), path).toBe("gated=true");
      }
    },
  );

  // Pin: passes on HEAD too — guards HEAD's union-only semantics for other spellings.
  it("a permission's reset applies on its key's spelling, union-only elsewhere", () => {
    const match = createRouteRulesMatcher(
      normalizeRouteRules({
        "/**": { headers: { "x-a": "1" } },
        "/d/:n([a-z0-9%]+)/**": { headers: HEADERS_RESET },
        "/d/:n([A-Z0-9%]+)/**": { headers: { "x-b": "1" } },
      }),
    );
    expect(match("GET", "/d/%c3%a9/x").routeRules.headers).toBeUndefined();
    expect(match("GET", "/d/%C3%A9/x").routeRules.headers).toMatchObject({ "x-b": "1" });
  });

  it("documented: a reset keyed in another hex case than its route does not subtract", () => {
    // `app.get("/café/**")` registers `/caf%C3%A9/**`; a rule keyed in lowercase
    // hex reaches that route's requests only through the lowercase reading, so
    // its gate is added there — but its reset of a broader permission is not.
    // Spell the key like the route (or raw) for the reset to apply.
    const match = createRouteRulesMatcher(
      normalizeRouteRules({
        "/**": { cors: { origin: "*" } },
        "/caf%c3%a9/**": { cors: false },
        "/café/gate/**": { headers: { "x-gate": "1" } },
      }),
    );
    expect(match("GET", "/caf%c3%a9/x").routeRules.cors).toBeUndefined();
    expect(match("GET", "/caf%C3%A9/x").routeRules.cors).toBeDefined();
    const raw = createRouteRulesMatcher(
      normalizeRouteRules({ "/**": { cors: { origin: "*" } }, "/café/**": { cors: false } }),
    );
    expect(raw("GET", "/caf%C3%A9/x").routeRules.cors).toBeUndefined();
  });

  // A registered pattern whose escapes mix hex cases — from a `baseURL` in the
  // other case, or a raw character (encoded uppercase) next to a lowercase
  // escape — would only match that exact mix, which no recased reading
  // produces. Without a constraint it is registered uppercased instead.
  // Pin: passes on HEAD too — regression guard (a mixed pattern was exact-spelling only in an earlier iteration).
  it.each([
    [
      "R1: baseURL in the other case",
      { "/caf%c3%a9/**": { restricted: { label: "gate" } } },
      "/b%C3%A4se",
      [
        "/b%C3%A4se/caf%c3%a9/x",
        "/b%C3%A4se/caf%C3%A9/x",
        "/bäse/café/x",
        "/b%c3%a4se/caf%c3%a9/x",
      ],
    ],
    [
      "R1: the key itself mixed",
      { "/b%C3%A4se/caf%c3%a9/**": { restricted: { label: "gate" } } },
      undefined,
      ["/b%C3%A4se/caf%c3%a9/x", "/b%C3%A4se/caf%C3%A9/x", "/bäse/café/x"],
    ],
    [
      "R2: raw character next to a lowercase escape",
      { "/é/caf%c3%a9/**": { restricted: { label: "gate" } } },
      undefined,
      ["/%C3%A9/caf%c3%a9/x", "/%C3%A9/caf%C3%A9/x", "/é/café/x"],
    ],
    [
      "R3: lowercase `%5e` next to a raw character",
      { "/%5e/café/**": { restricted: { label: "gate" } } },
      undefined,
      ["/%5e/caf%C3%A9/x", "/%5E/caf%C3%A9/x"],
    ],
  ] satisfies [string, Record<string, RouteRuleConfig>, string | undefined, string[]][])(
    "a mixed-case pattern gates every spelling (%s)",
    async (_label, rules, baseURL, paths) => {
      const { handlers, app } = gate();
      app.use(routeRules(rules, { handlers, baseURL }));
      app.all("/**", (event) => `gated=${!!event.context.gated}`);
      for (const path of paths) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(await res.text(), path).toBe("gated=true");
      }
    },
  );

  it("keys that only overlap once registered agree across modes (preMerge never drops a gate)", () => {
    // Under `/b%C3%A4se` the lowercase key is mixed with the base and registered
    // uppercased, so it overlaps (or coincides with) an uppercase key that is
    // disjoint as written — ranks and pre-merged chains must see that.
    const restricted: RuleHandler<"restricted"> = {
      restricting: true,
      handler: () => (_event, next) => next(),
    };
    const overlapConfig: Record<string, RouteRuleConfig> = {
      "/a%2fb/**": { restricted: { label: "gate" } },
      "/a%2Fb/:id?/**": { headers: { "x-b": "1" } },
    };
    // Registered, these two match the same paths, so preMerge rejects the set
    // at startup — as it does for any two such keys — instead of dropping one.
    expect(() =>
      createRouteRulesMatcher(normalizeRouteRules(overlapConfig), {
        handlers: { restricted },
        baseURL: "/b%C3%A4se",
        preMerge: true,
      }),
    ).toThrow(/match the same paths/);
    const code = compileFindRouteRules(overlapConfig, {
      baseURL: "/b%C3%A4se",
      runtimeRules: { restricted: "./restricted" },
    });
    const handlers = { ...ruleHandlers, restricted };
    const overlap = {
      runtime: createRouteRulesMatcher(normalizeRouteRules(overlapConfig), {
        handlers,
        baseURL: "/b%C3%A4se",
      }),
      compiled: createMatcherFromFind(
        // eslint-disable-next-line no-new-func
        new Function(
          ...Object.keys(handlers).map((name) => `__ruleHandlers__$${name}`),
          `return (${code});`,
        )(...Object.values(handlers)) as FindRouteRules,
      ),
    };
    const coincide = allModes(
      {
        "/caf%C3%A9/**": { headers: { "x-a": "1" } },
        "/caf%c3%a9/**": { headers: { "x-b": "2" } },
      },
      { baseURL: "/b%C3%A4se" },
    );
    for (const [mode, match] of Object.entries(overlap)) {
      const { routeRules } = match("GET", "/b%C3%A4se/a%2Fb/b/x");
      expect(routeRules.restricted, mode).toMatchObject({ label: "gate" });
      expect(routeRules.headers, mode).toEqual({ "x-b": "1" });
    }
    for (const [mode, match] of Object.entries(coincide)) {
      expect(match("GET", "/b%C3%A4se/caf%C3%A9/x").routeRules.headers, mode).toEqual({
        "x-a": "1",
        "x-b": "2",
      });
    }
  });

  // rou3 itself percent-encodes some text when it registers a pattern — a
  // literal `^`, the escapes `\{` `\}` `\?`, raw characters in a `baseURL` —
  // always in uppercase, so a key written in lowercase hex next to one is mixed
  // once registered too.
  // Pin: passes on HEAD too — regression guard (see `registeredPattern`).
  it.each([
    [
      "literal `^`",
      { "/a^b/caf%c3%a9/**": RL },
      undefined,
      ["/a%5Eb/caf%C3%A9/x", "/a^b/café/x", "/a%5Eb/caf%c3%a9/x"],
    ],
    [
      "escaped `{`",
      { [String.raw`/a\{b/caf%c3%a9/**`]: RL },
      undefined,
      ["/a%7Bb/caf%C3%A9/x", "/a%7Bb/caf%c3%a9/x"],
    ],
    [
      "escaped `?`",
      { [String.raw`/a\?b/caf%c3%a9/**`]: RL },
      undefined,
      ["/a%3Fb/caf%C3%A9/x", "/a%3Fb/caf%c3%a9/x"],
    ],
    [
      "method-scoped `^`",
      { "GET /a^b/caf%c3%a9/**": RL },
      undefined,
      ["/a%5Eb/caf%C3%A9/x", "/a^b/café/x"],
    ],
    [
      "`%5e` next to `^` under a base",
      { "/a%5eb/a^b": RL },
      "/base",
      ["/base/a%5Eb/a%5Eb", "/base/a^b/a^b"],
    ],
    [
      "raw baseURL",
      { "/caf%c3%a9/**": RL },
      "/bäse",
      ["/b%C3%A4se/caf%C3%A9/x", "/bäse/café/x", "/b%C3%A4se/caf%c3%a9/x"],
    ],
    [
      "raw `<` in a baseURL",
      { "/:id/%c3%a9/**": RL },
      "/a<b",
      ["/a%3Cb/x/%C3%A9/y", "/a<b/x/é/y", "/a%3Cb/x/%c3%a9/y"],
    ],
  ] satisfies [string, Record<string, RouteRuleConfig>, string | undefined, string[]][])(
    "text rou3 encodes counts as uppercase hex (%s)",
    async (_label, rules, baseURL, paths) => {
      const { handlers, app } = gate();
      app.use(routeRules(rules, { handlers, baseURL }));
      app.all("/**", (event) => `gated=${!!event.context.gated}`);
      for (const path of paths) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(await res.text(), path).toBe("gated=true");
      }
    },
  );

  it("a lowercase-hex baseURL: patterns under different base spellings agree across modes", () => {
    // `/caf%C3%A9/:id` is mixed with the lowercase base and registered under
    // the uppercased one; `/**` keeps the base as written. The two never meet in
    // one lookup, so preMerge must not chain them — and keep params.
    const modes = allModes(
      {
        "/**": { headers: { "x-a": "1" } },
        "/caf%C3%A9/:id": { headers: { "x-b": "1" } },
      },
      { baseURL: "/b%c3%a4se" },
    );
    const results = Object.fromEntries(
      Object.entries(modes).map(([mode, match]) => [
        mode,
        match("GET", "/b%C3%A4se/caf%C3%A9/42").matchedRules.headers,
      ]),
    );
    expect(results.runtime).toMatchObject({ options: { "x-b": "1" }, params: { id: "42" } });
    expect(results.preMerge).toEqual(results.runtime);
    expect(results.compiled).toEqual(results.runtime);
  });

  it("never recases a key spelled in one hex case (it stays its route's spelling)", () => {
    // A uniformly lowercase key keeps matching its own route's spelling
    // directly, so its reset applies there.
    const match = createRouteRulesMatcher(
      normalizeRouteRules({ "/**": { cors: { origin: "*" } }, "/caf%c3%a9/**": { cors: false } }),
    );
    expect(match("GET", "/caf%c3%a9/x").routeRules.cors).toBeUndefined();
    expect(match("GET", "/caf%c3%a9/x").matchedRules.cors).toBeUndefined();
    const router = createRulesRouter(
      normalizeRouteRules({ "/caf%c3%a9/**": { headers: { "x-a": "1" } } }),
      {},
    );
    expect(findAllRoutes(router, "GET", "/caf%c3%a9/x")).toHaveLength(1);
    expect(findAllRoutes(router, "GET", "/caf%C3%A9/x")).toHaveLength(0);
  });

  // Pin: passes on HEAD too — documents the trade-off for mixed-case keys.
  it("documented: on the exact mixed spelling a mixed key acts like an alternate reading", () => {
    // `/é/caf%c3%a9/**` is registered as `/%C3%A9/caf%C3%A9/**`; the mixed
    // spelling `/%C3%A9/caf%c3%a9/x` reaches it through the uppercase reading —
    // union-only, so its reset does not strip the broader permission there.
    const match = createRouteRulesMatcher(
      normalizeRouteRules({ "/**": { cors: { origin: "*" } }, "/é/caf%c3%a9/**": { cors: false } }),
    );
    expect(match("GET", "/%C3%A9/caf%C3%A9/x").routeRules.cors).toBeUndefined();
    expect(match("GET", "/%C3%A9/caf%c3%a9/x").routeRules.cors).toBeDefined();
  });

  // Pin: passes on HEAD too — regression guard (an earlier iteration serialized options per request).
  it("does not serialize rule options per request (circular and BigInt options)", async () => {
    const store: Record<string, unknown> = { name: "redis" };
    store.self = store;
    // Custom data-only rule names, not declared in `RouteRuleConfig`.
    for (const rules of [
      { "/x/**": { rl: { store } }, "POST /x/**": { rl: { max: 1 } } },
      { "/x/**": { rl: { max: 10n } }, "GET /x/**": { other: 1 } },
    ] as unknown as Record<string, RouteRuleConfig>[]) {
      const app = new H3();
      app.use(routeRules(rules, { handlers: { rl: undefined, other: undefined } }));
      app.all("/x/**", () => "ok");
      for (const [method, path] of [
        ["POST", "/x/%c3%a9"],
        ["GET", "/x/%C3%A9"],
        ["GET", "/x/plain"],
      ] as const) {
        const res = await app.fetch(new Request("http://test" + path, { method }));
        expect(res.status, `${method} ${path}`).toBe(200);
      }
    }
  });
});

describe("dot segments in rule keys", () => {
  // Keys go through `normalizeRoute`, which resolves dot segments exactly as for
  // a route (and as the URL parser does for every request path).
  const KEYS: Array<[key: string, normalized: string, path: string]> = [
    ["/admin/../**", "/**", "/anything/x"],
    ["/a/./b", "/a/b", "/a/b"],
    ["/%2e%2e/**", "/**", "/x"],
    ["/a/%2E%2E/b", "/b", "/b"],
  ];

  it.each(KEYS)("`%s` normalizes like a route, in every mode", async (key, normalized, path) => {
    expect(Object.keys(normalizeRouteRules({ [key]: { headers: { "x-a": "1" } } }))).toEqual([
      normalized,
    ]);
    expect(normalized).toBe(normalizeRoute(key));
    for (const [mode, match] of Object.entries(allModes({ [key]: { headers: { "x-a": "1" } } }))) {
      expect(match("GET", path).routeRules.headers, mode).toEqual({ "x-a": "1" });
    }
    const app = new H3();
    app.use(routeRules({ [key]: { headers: { "x-a": "1" } } }));
    app.get(key, () => "route");
    const res = await app.fetch(new Request("http://test" + path));
    expect(await res.text()).toBe("route");
    expect(res.headers.get("x-a")).toBe("1");
  });

  it("the override guard never sees a dot segment through the matcher", () => {
    const seen: string[] = [];
    const config = Object.fromEntries(
      KEYS.map(([key], i) => [key, { headers: { [`x-${i}`]: "1" } }]),
    ) as Record<string, RouteRuleConfig>;
    // The runtime matcher's own router, with a spy on the override guard.
    const router = createRulesRouter(normalizeRouteRules(config), ruleHandlers);
    const match = createMatcherFromFind(
      (method, pathname) => findAllRoutes(router, method, pathname) as RouteRuleLayer[],
      (current, incoming) => {
        seen.push(current, incoming);
        return canOverrideRouteShape(current, incoming);
      },
    );
    for (const path of ["/a/b", "/a/..%2fb", "/admin/%2e%2e/x", "/a/x/..%2f..%2fb", "/b"]) {
      match("GET", path);
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((route) => /(^|\/)\.{1,2}(\/|$)/.test(route))).toEqual([]);
  });

  it("the guard itself fails closed on any dot segment (direct callers)", () => {
    for (const [current, incoming] of [
      ["/a/:x/**", "/a/../b"],
      ["/a/../**", "/a/b"],
      ["/**", "/a/./b"],
      ["/a/./b", "/a/./b"],
      ["/a/:x", "/a/%2e%2e"],
    ]) {
      expect(canOverrideRouteShape(current!, incoming!), `${current} -> ${incoming}`).toBe(false);
    }
  });
});

describe("decodedPath", () => {
  it("decodes every escape except the path separators", () => {
    expect(decodedPath("/%40admin/x")).toBe("/@admin/x");
    expect(decodedPath("/a%20b/caf%C3%A9")).toBe("/a b/café");
    // Separators stay opaque — decoding one here would reintroduce a `/` the
    // router never matched on (`canonicalPath`'s `decodeSlashes` owns that).
    expect(decodedPath("/a%2Fb")).toBe("/a%2Fb");
    expect(decodedPath("/a%252Fb")).toBe("/a%252Fb");
  });

  it("decodes to a fixpoint, without ever collapsing a separator", () => {
    expect(decodedPath("/%2540admin/x")).toBe("/@admin/x");
    expect(decodedPath("/%25252540admin/x")).toBe("/@admin/x");
    // A separator is at its fixpoint from the first pass, at any `%25` depth.
    expect(decodedPath("/a%2525252Fb")).toBe("/a%2525252Fb");
    // Hex-of-hex resolves to the *encoded* separator, never a raw one.
    expect(decodedPath("/a%25%32%66b")).toBe("/a%2fb");
  });

  it("is a no-op without escapes, and on malformed encoding", () => {
    const plain = "/plain/path";
    expect(decodedPath(plain)).toBe(plain);
    expect(decodedPath("/foo%")).toBe("/foo%");
    expect(decodedPath("/%ZZ")).toBe("/%ZZ");
  });

  // `%25` nesting is a *pass multiplier*: one level is unwrapped per pass and
  // every pass rescans the whole string, so a sequentially nested chain cost one
  // full pass per level — O(n²), ~72 ms of blocking time for a 14 KB path, on a
  // request that need not match any rule at all. The bound is asserted as a
  // *pass count* rather than a wall clock: the bound is what regresses, elapsed
  // time is what flakes.
  it("unwraps a deeply nested chain in a bounded number of passes", () => {
    const deep = "/%" + "25".repeat(4000) + "40x";
    decodePasses.count = 0;
    expect(decodedPath(deep)).toBe("/@x");
    expect(decodePasses.count).toBeLessThanOrEqual(12);

    // 4x the depth must not cost 16x the work: the pass count is bounded by a
    // constant, not by the nesting depth.
    const deeper = "/%" + "25".repeat(16_000) + "40x";
    decodePasses.count = 0;
    expect(decodedPath(deeper)).toBe("/@x");
    expect(decodePasses.count).toBeLessThanOrEqual(12);

    // Same for a chain that unwraps onto a malformed escape rather than a
    // decodable one (`%25…25zz` -> `%zz`), which shrinks two chars per pass too.
    const malformed = "/%" + "25".repeat(4000) + "zz";
    decodePasses.count = 0;
    expect(decodedPath(malformed)).toBe("/%zz");
    expect(decodePasses.count).toBeLessThanOrEqual(12);
  });

  it("gives a deeply nested spelling the same reading as a shallow one", () => {
    // Nesting depth is not information: every depth decodes to the same
    // character, so the reading must not depend on how deep the chain was — a
    // bound that truncated the unwrapping would show up here.
    for (const depth of [1, 2, 3, 7, 8, 9, 64, 4000]) {
      const nest = "%" + "25".repeat(depth);
      expect(decodedPath(`/a${nest}20b`), `%20 at depth ${depth}`).toBe("/a b");
      expect(decodedPath(`/${nest}40admin/x`), `%40 at depth ${depth}`).toBe("/@admin/x");
      // A separator is at its fixpoint from the first pass, at every depth.
      expect(decodedPath(`/a${nest}2Fb`), `%2F at depth ${depth}`).toBe(`/a${nest}2Fb`);
      expect(decodedPath(`/a${nest}5Cb`), `%5C at depth ${depth}`).toBe(`/a${nest}5Cb`);
    }
  });

  it("matches a spelling nested far past any pass bound", () => {
    // The security property the bound must not buy performance with: a chain
    // deeper than the bound may not silently degrade to "no alternate reading",
    // which would walk past the rule. Every depth still resolves it.
    const match = createRouteRulesMatcher(normalizeRouteRules({ "/@admin/**": RULE }));
    for (const depth of [1, 7, 8, 9, 64, 4000]) {
      const path = "/%" + "25".repeat(depth) + "40admin/x";
      expect(match("GET", path).routeRules.redirect, `depth ${depth}`).toMatchObject(MATCHED);
    }
  });
});

describe("scope checks see the decoded reading", () => {
  it("rejects a traversal whose dot is hex-of-hex encoded", () => {
    // `%25%32%65` decodes to `%2e`, which a second decode turns into `.` —
    // `resolveDotSegments` documents this as out of its reach on its own. h3's
    // own pathname decode already folds this particular spelling into `%252e`
    // (which `resolveDotSegments` does catch), so this is hardening for callers
    // that hand the matcher a path h3 did not serve — not a live h3 gap.
    expect(isPathInScope("/base/%25%32%65%25%32%65/secret", "/base")).toBe(false);
    expect(isPathInScope("/base/ok", "/base")).toBe(true);
    expect(isPathInScope("/base/a%40b", "/base")).toBe(true);
  });
});

describe("proxy/redirect base stripping through the encoded spelling", () => {
  // Resolve the forwarded target directly (as rules.test.ts does), so the
  // assertion is on the target URL rather than on a mocked fetch. `base` comes
  // from normalization, exactly as the handler receives it.
  const target = (path: string, to: string) => {
    const options = normalizeRouteRules({ "/@admin/**": { proxy: to } })["/@admin/**"]!.proxy;
    const event = { url: new URL("http://test" + path) } as Parameters<RuleTargetResolver>[0];
    return prepareRuleTarget(options as ProxyRuleOptions)?.(event);
  };

  it("strips the rule's base from the encoded spelling, forwarding raw bytes", () => {
    // The pattern prefix is `/@admin`, which `/%40admin/data` never literally
    // starts with — the base is taken by segment count instead, and the
    // remainder keeps its original encoding.
    expect(target("/@admin/data", "http://backend/**")).toBe("http://backend/data");
    expect(target("/%40admin/data", "http://backend/**")).toBe("http://backend/data");
    expect(target("/%40admin/a%2Fb", "http://backend/**")).toBe("http://backend/a%2Fb");
    expect(target("/%40admin/data?q=a%2Bb", "http://backend/**")).toBe(
      "http://backend/data?q=a%2Bb",
    );
  });

  it("fails closed when the base cannot be faithfully stripped", async () => {
    // The rule matches through the decoded path's canonical reading
    // (`/@admin/x`), but no reading of the *raw* path literally sits under
    // `/@admin` — an encoded separator sits exactly on the base boundary — so
    // the remainder can't be stripped and the request is rejected rather than
    // forwarded unstripped.
    const app = new H3();
    app.use(routeRules({ "/@admin/**": { proxy: "http://backend/**" } }, { handlers: { proxy } }));
    const res = await app.fetch(new Request("http://test/%40admin%2fx"));
    expect(res.status).toBe(400);
  });

  describe("under a base that keeps an escape (`/%7Bq%7D/**`)", () => {
    // The base stays encoded (`{` is rou3 syntax), while the decoded reading of
    // the request carries a raw `{` — scope has to be checked reading for
    // reading, not the decoded path against the encoded base.
    const SPELLINGS = ["/%7Bq%7D/x", "/%7bq%7d/x", "/%257Bq%257D/x"];
    const TRAVERSALS = [
      "/%7Bq%7D/..%2f..%2fetc/passwd",
      "/%7Bq%7D/%2e%2e%2fsecret",
      "/%7Bq%7D/%252e%252e%252fsecret",
    ];

    it("redirects every spelling and rejects traversal", async () => {
      const app = new H3();
      app.use(routeRules({ "/%7Bq%7D/**": { redirect: { to: "/new/**" } } }));
      app.all("/**", () => "from the handler");
      for (const path of SPELLINGS) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(res.status, path).toBe(307);
        expect(res.headers.get("location"), path).toBe("/new/x");
      }
      const root = await app.fetch(new Request("http://test/%7Bq%7D"));
      expect(root.status).toBe(307);
      expect(root.headers.get("location")).toBe("/new");
      const authority = await app.fetch(new Request("http://test/%7Bq%7D//evil.com"));
      expect(authority.headers.get("location")).toBe("/new/evil.com");
      for (const path of TRAVERSALS) {
        const res = await app.fetch(new Request("http://test" + path));
        expect(res.status, path).toBe(400);
      }
      // Only the canonical reading of a non-served spelling is matched, and it
      // resolves outside the base, so the rule does not apply and nothing is
      // redirected.
      const lower = await app.fetch(new Request("http://test/%7bq%7d/..%2f..%2fetc/passwd"));
      expect(lower.headers.get("location")).toBeNull();
    });

    it("forwards every spelling to the proxy target and rejects traversal", () => {
      const options = normalizeRouteRules({ "/%7Bq%7D/**": { proxy: "http://backend/**" } })[
        "/%7Bq%7D/**"
      ]!.proxy;
      const resolve = prepareRuleTarget(options as ProxyRuleOptions)!;
      const at = (path: string) =>
        resolve({ url: new URL("http://test" + path) } as Parameters<RuleTargetResolver>[0]);
      for (const path of SPELLINGS) {
        expect(at(path), path).toBe("http://backend/x");
      }
      for (const path of [...TRAVERSALS, "/%7bq%7d/..%2f..%2fetc/passwd"]) {
        expect(() => at(path), path).toThrow();
      }
    });
  });

  it("rejects a path that traverses out of the rule's base", async () => {
    // `/%40admin/...` is served as `/@admin/...` (`%40` is a needless escape), so
    // the rule matches on the raw path. `..%2f..%2f` then walks above `/@admin`
    // under every canonical reading, so the scope check rejects rather than
    // forwarding — nothing reaches the backend either way.
    const app = new H3();
    app.use(routeRules({ "/@admin/**": { proxy: "http://backend/**" } }, { handlers: { proxy } }));
    const res = await app.fetch(new Request("http://test/%40admin/..%2f..%2fetc/passwd"));
    expect(res.status).toBe(400);
  });
});

describe("alternate-reading lookups", () => {
  const findNothing: FindRouteRules = () => [] as RouteRuleLayer[];

  it("costs no extra lookup for a plain path", () => {
    const find = vi.fn(findNothing);
    createMatcherFromFind(find)("GET", "/plain/path");
    expect(find).toHaveBeenCalledTimes(1);
  });

  it("adds exactly one decoded lookup for an encoded path", () => {
    const find = vi.fn(findNothing);
    createMatcherFromFind(find)("GET", "/%40admin/data");
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenNthCalledWith(2, "GET", "/@admin/data");
  });

  it("looks up each distinct reading once", () => {
    const find = vi.fn(findNothing);
    // Both spellings canonicalize to `/a/b`, so the decoded reading adds no
    // lookup of its own.
    createMatcherFromFind(find)("GET", "/a/%40x/../b");
    expect(find.mock.calls.map((c) => c[1])).toEqual(["/a/%40x/../b", "/a/b"]);
  });
});

describe("routeRules middleware over the encoded spelling", () => {
  it("runs the matched rule middleware exactly once per request", async () => {
    const app = new H3();
    app.use(routeRules({ "/@admin/**": { headers: { "x-rule": "1" } } }));
    app.all("/**", () => "ok");
    const res = await app.fetch(new Request("http://test/%40admin/x"));
    expect(res.headers.get("x-rule")).toBe("1");
  });
});
