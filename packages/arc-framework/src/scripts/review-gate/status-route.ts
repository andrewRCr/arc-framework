/** Preserve the public review-status route across member targeting and recovery. */
import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import type { ChangeRequestTargetRef } from "./change-request.js";

/** The caller's original status scope, before delivery selects a member. */
export type ReviewStatusRoute = { readonly kind: "work-unit"; readonly workUnitId: string }
  | { readonly kind: "target"; readonly target: ChangeRequestTargetRef };

/** Compose the status command for the same public scope. */
export function reviewStatusRouteArgv(route: ReviewStatusRoute): string[] {
  return ["arc", "review", "status", ...(route.kind === "work-unit"
    ? ["--work-unit", route.workUnitId] : ["--target", JSON.stringify(route.target)])];
}

/** Render one executable status retry with literal argument quoting. */
export function reviewStatusRouteCommand(route: ReviewStatusRoute, options: readonly string[] = []): string {
  return [...reviewStatusRouteArgv(route), ...options].map(argument => /^[A-Za-z0-9_./:@+-]+$/u.test(argument)
    ? argument : quoteShellArgument(argument)).join(" ");
}
