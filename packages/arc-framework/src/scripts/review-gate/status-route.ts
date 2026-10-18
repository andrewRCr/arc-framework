/** Preserve the public review-status route across member targeting and recovery. */
import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import type { ChangeRequestTargetRef } from "./change-request.js";
import type { ReviewCoverageSelectionAction } from "./policy/review-coverage-selection.js";
import type { HostedReservationDischarge } from "./policy/hosted-reservation-support.js";

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

/** Add executable continuations for the listed choices using the caller's original scope. */
export function routeReviewCoverageOffer(action: ReviewCoverageSelectionAction, route: ReviewStatusRoute): ReviewCoverageSelectionAction {
  const retries = action.choices.map(choice => `For ${choice.coverage === "incremental" ? "a fix check" : "a complete pass"}, re-run `
    + `\`${reviewStatusRouteCommand(route, ["--source", choice.sourceId, "--coverage", choice.coverage])}\`.`).join(" ");
  const paragraphs = action.interactionText.split("\n\n");
  const question = paragraphs.length > 1 ? paragraphs.pop() : undefined;
  return { ...action, interactionText: [...paragraphs, retries, question].join("\n\n").trim() };
}

/** Preserve discharge evidence while routing any pending coverage offer at the status boundary. */
export function routeDischargeCoverageOffer<T extends HostedReservationDischarge>(discharge: T, route?: ReviewStatusRoute): T {
  const action = discharge.coverageSelectionAction;
  return action === undefined ? discharge : { ...discharge, coverageSelectionAction: routeReviewCoverageOffer(action,
    route ?? { kind: "work-unit", workUnitId: action.workUnitId }) };
}
