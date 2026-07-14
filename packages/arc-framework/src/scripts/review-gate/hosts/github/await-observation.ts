/** Exact-source parsing for the App-owned aggregate await projection. */

import type { ReviewAwaitState } from "../../runtime/await.js";
import { parseGateStateMarker } from "./check-runs.js";

export interface AggregateAwaitScope {
  expectedAppId: string;
  contextName: "merge-ok" | "review-gate-shadow";
  pullRequestNumber: number;
  headSha: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Read one exact aggregate marker without interpreting any human/provider prose. */
export function parseAggregateAwaitState(checks: unknown[], scope: AggregateAwaitScope): ReviewAwaitState {
  const externalId = new RegExp(
    `^arc-review-gate:${scope.pullRequestNumber}:[a-f0-9]{64}:${scope.contextName}$`,
    "u",
  );
  const matches = checks.filter((value) => {
    const check = record(value);
    const app = record(check?.app);
    return check?.name === scope.contextName
      && check.head_sha === scope.headSha
      && typeof check.external_id === "string"
      && externalId.test(check.external_id)
      && String(app?.id) === scope.expectedAppId;
  });
  if (checks.length === 0) {
    return {
      conclusion: "pending",
      blockerCodes: ["projection-pending"],
      ledgerVersion: null,
      receiptRefs: [],
    };
  }
  if (matches.length !== 1) throw new Error("malformed-or-ambiguous-aggregate-projection");
  try {
    const output = record(record(matches[0])?.output);
    if (typeof output?.summary !== "string") throw new Error("missing-summary");
    const state = parseGateStateMarker(output.summary);
    return {
      conclusion: state.conclusion,
      blockerCodes: state.blockerCodes,
      ledgerVersion: state.ledgerVersion,
      receiptRefs: state.receiptRefs,
    };
  } catch {
    throw new Error("malformed-or-ambiguous-aggregate-projection");
  }
}
