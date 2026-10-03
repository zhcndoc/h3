import type { PreMergedRouteRules } from "./internal/premerge.ts";
import { addReset, canReinstate, recordResets } from "./internal/resets.ts";
import type { ResetRoutes } from "./internal/resets.ts";
import type { MatchedRouteRule, MatchedRouteRules } from "./types.ts";

/** Decide whether an alternate path reading may override a matched rule. */
export type RouteOverridePredicate = (currentRoute: string, incomingRoute: string) => boolean;

/** One normalized rule registered for a route pattern. */
export interface RouteRuleEntry {
  name: string;
  route: string;
  options: unknown;
  handler?: MatchedRouteRule["handler"];
  /**
   * Pattern-containment depth. Required because rou3 result order is not
   * containment order for optional/modifier parameters.
   */
  rank?: number;
}

/** A matched route layer containing rule data and route parameters. */
export interface RouteRuleLayer {
  data: RouteRuleEntry[] | PreMergedRouteRules;
  params?: Record<string, string>;
}

/**
 * Merge served-path and alternate-reading layers. Alternate readings may add
 * rules but override existing ones only when `canOverride` permits it.
 */
export function mergeMatchedRouteRules(
  rawLayers: RouteRuleLayer[] | undefined,
  altLayers?: readonly (RouteRuleLayer[] | undefined)[],
  canOverride?: RouteOverridePredicate,
): MatchedRouteRules {
  if (!altLayers) {
    return resolveLayers(rawLayers); // No other reading for a reset to constrain.
  }
  // Every route that reset each rule name, from every reading — all of them are
  // resolved before any is unioned, so a reading cannot reinstate a rule ahead
  // of another reading's narrower reset (the result never depends on order).
  const resets: ResetRoutes = new Map();
  const routeRules = resolveLayers(rawLayers, resets, canOverride);
  const resolved = altLayers.map((layers) =>
    layers?.length ? resolveLayers(layers, resets, canOverride) : undefined,
  );
  for (const rules of resolved) {
    if (rules) {
      unionRules(routeRules, rules, resets, canOverride);
    }
  }
  return routeRules;
}

// Broader alternate readings cannot downgrade narrower served-path rules.
function unionRules(
  routeRules: MatchedRouteRules,
  resolved: MatchedRouteRules,
  resets: ResetRoutes,
  canOverride?: RouteOverridePredicate,
): void {
  for (const [name, rule] of Object.entries(resolved) as [string, MatchedRouteRule][]) {
    const current = routeRules[name as keyof MatchedRouteRules];
    if (current) {
      if (canOverride && !canOverride(current.route, rule.route)) {
        continue;
      }
    } else if (
      !rule.handler?.restricting &&
      !canReinstate(resets.get(name), rule.route, canOverride)
    ) {
      // Restricting handlers are re-added to fail closed; a permissive rule
      // stays reset unless the reading's pattern is inside every reset of it.
      continue;
    }
    mergeRouteRule(routeRules, name, rule, rule.params);
  }
}

// `resets` collects the reading's resets, when another reading needs them.
function resolveLayers(
  layers: RouteRuleLayer[] | undefined,
  resets?: ResetRoutes,
  canOverride?: RouteOverridePredicate,
): MatchedRouteRules {
  const firstData = layers?.[0]?.data;
  if (firstData && !Array.isArray(firstData)) {
    return resolvePreMergedLayers(layers!, resets);
  }
  const routeRules = emptyRouteRules();
  let resetEntries: RouteRuleEntry[] | undefined;
  for (const layer of orderedLayers(layers)) {
    for (const entry of layer.data as RouteRuleEntry[]) {
      if (resets && entry.options === false) {
        (resetEntries ||= []).push(entry);
      }
      mergeRouteRule(routeRules, entry.name, entry, layer.params);
    }
  }
  if (resetEntries) {
    recordResets(resets!, resetEntries, routeRules, canOverride);
  }
  return routeRules;
}

export function isMergeableObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

// Null prototype prevents rule names from reaching Object.prototype.
function emptyRouteRules(): MatchedRouteRules {
  return Object.create(null) as MatchedRouteRules;
}

export function mergeRuleOptions(current: unknown, incoming: unknown): unknown {
  return isMergeableObject(current) && isMergeableObject(incoming)
    ? { ...current, ...incoming }
    : incoming;
}

/**
 * Re-order a reading's matched layers broad → narrow, so resolution does not
 * depend on the order `findAllRoutes` happened to produce — that order is not
 * containment order for modifier params, and merging out of order drops gates
 * (see {@link RouteRuleEntry.rank}).
 *
 * A stable insertion sort on the entries' build-time {@link RouteRuleEntry.rank}
 * (containment depth, ascending). Deliberately **not** a containment predicate
 * evaluated here: ordering must not depend on a per-request comparison at all —
 * `createMatcherFromFind`'s dependency-free default (`canOverrideRouteShape`) is
 * conservative *and* not exact for modifier params, which is precisely the shape
 * this ordering exists for, so a compiled matcher without a baked predicate
 * would drop the very gates the rank preserves. A number decided once at build
 * time is exact for every matcher, costs nothing per request, and keeps `rou3`
 * out of compiled bundles. Equal ranks (incomparable patterns, or a registration
 * without ranks) keep the order `findAllRoutes` produced.
 */
function orderedLayers(layers: RouteRuleLayer[] | undefined): RouteRuleLayer[] {
  if (!layers || layers.length < 2) {
    return layers || [];
  }
  let ordered = layers;
  for (let i = 1; i < ordered.length; i++) {
    const layer = ordered[i]!;
    const rank = layerRank(layer);
    let j = i - 1;
    while (j >= 0 && layerRank(ordered[j]!) > rank) {
      if (ordered === layers) {
        ordered = [...layers];
      }
      ordered[j + 1] = ordered[j]!;
      j--;
    }
    if (j + 1 !== i) {
      ordered[j + 1] = layer;
    }
  }
  return ordered;
}

function layerRank(layer: RouteRuleLayer): number {
  return (layer.data as RouteRuleEntry[])[0]?.rank ?? 0;
}

// preMerge mode: the matched layer already carries the merged chain result;
// only attach per-rule params here, merged from exactly the layers whose
// pattern contributed to that rule (`paramRoutes`).
//
// The complete result is the *most specific* matched layer, which is the
// highest-ranked one and not necessarily the last one (`PreMergedRouteRules.rank`,
// and {@link RouteRuleEntry.rank} for why position is unusable). Sorting by rank
// (rather than scanning for the maximum) also puts the per-rule `params` merge
// below in broad → narrow order, so a narrower contributor's params win.
function resolvePreMergedLayers(
  rawLayers: RouteRuleLayer[],
  resets?: ResetRoutes,
): MatchedRouteRules {
  const layers =
    rawLayers.length < 2
      ? rawLayers
      : [...rawLayers].sort(
          (a, b) => (a.data as PreMergedRouteRules).rank - (b.data as PreMergedRouteRules).rank,
        );
  const routeRules = emptyRouteRules();
  const winning = layers[layers.length - 1]!.data as PreMergedRouteRules;
  // The chain resolved its resets at build time, so the pattern that reset a
  // rule is gone — record the winning route instead: it is inside every pattern
  // of its chain, so preMerge can only reinstate less than plain mode, never more.
  if (resets && winning.resets) {
    for (const name of winning.resets) {
      addReset(resets, name, winning.route);
    }
  }
  for (const entry of winning.rules) {
    const paramRoutes = entry.paramRoutes;
    let params: Record<string, string> | undefined;
    for (const layer of layers) {
      const layerParams = layer.params;
      if (!layerParams) {
        continue;
      }
      const layerRoute = (layer.data as PreMergedRouteRules).route;
      if (paramRoutes ? paramRoutes.includes(layerRoute) : layerRoute === entry.route) {
        params = params ? { ...params, ...layerParams } : layerParams;
      }
    }
    routeRules[entry.name as keyof MatchedRouteRules] = {
      route: entry.route,
      options: entry.options,
      handler: entry.handler,
      params,
    } as never;
  }
  return routeRules;
}

function mergeRouteRule(
  routeRules: MatchedRouteRules,
  ruleName: string,
  rule: Omit<RouteRuleEntry, "name">,
  params: Record<string, string> | undefined,
): void {
  const name = ruleName as keyof MatchedRouteRules;
  const currentRule = routeRules[name];
  if (currentRule) {
    if (rule.options === false) {
      delete routeRules[name];
      return;
    }
    currentRule.options = mergeRuleOptions(currentRule.options, rule.options) as never;
    currentRule.route = rule.route;
    if (currentRule.params || params) {
      currentRule.params = { ...currentRule.params, ...params };
    }
  } else if (rule.options !== false) {
    routeRules[name] = {
      route: rule.route,
      options: rule.options,
      handler: rule.handler,
      params,
    } as never;
  }
}
