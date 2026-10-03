import type { RouteOverridePredicate, RouteRuleEntry } from "../merge.ts";
import type { MatchedRouteRules } from "../types.ts";

/** Rule name → the route of every `false` that counts as its reset in some reading. */
export type ResetRoutes = Map<string, string[]>;

/**
 * Record the `false` entries a reading merged (`resetEntries`, given its
 * resolved `routeRules`). A reset counts unless a pattern inside it re-added
 * the rule later in the same reading (as in preMerge, where every matched
 * pattern forms a chain). One re-added by a partially overlapping pattern,
 * which won only by layer order, still counts: on an alternate reading it then
 * keeps that re-add out too, unless the rule is already matched.
 */
export function recordResets(
  resets: ResetRoutes,
  resetEntries: RouteRuleEntry[],
  routeRules: MatchedRouteRules,
  canOverride: RouteOverridePredicate | undefined,
): void {
  for (const entry of resetEntries) {
    const rule = routeRules[entry.name as keyof MatchedRouteRules];
    if (!rule || !canOverride?.(entry.route, rule.route)) {
      addReset(resets, entry.name, entry.route);
    }
  }
}

export function addReset(resets: ResetRoutes, name: string, route: string): void {
  const routes = resets.get(name);
  if (!routes) {
    resets.set(name, [route]);
  } else if (!routes.includes(route)) {
    routes.push(route);
  }
}

/**
 * Whether `route` may bring back a rule reset at `resetRoutes`: only when it is
 * equal to or more specific than every one of them, as a narrower pattern wins
 * over a reset on a single path. Without a predicate nothing is provable.
 */
export function canReinstate(
  resetRoutes: string[] | undefined,
  route: string,
  canOverride: RouteOverridePredicate | undefined,
): boolean {
  return (
    !resetRoutes ||
    (canOverride !== undefined && resetRoutes.every((resetRoute) => canOverride(resetRoute, route)))
  );
}
