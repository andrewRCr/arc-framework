/**
 * `gh`-backed PR source for the work-unit completion sweep's mergeable-
 * sharpening tier.
 *
 * Resolves live PR disposition (merged / open / review decision / check
 * rollup) for the enumerated awaiting-review branches via a single
 * `gh pr list --json` call, mapping each PR onto the classifier's fact shape.
 * A `gh` failure — the binary is absent, unauthenticated, or the network is
 * unreachable — propagates as a rejection so the composer degrades the sweep to
 * the presence tier. A branch with no matching PR is simply absent from the
 * result map.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";

import type { WorkUnitPrFacts, WorkUnitPrSource } from "./work-unit-state.js";

/** Cap on PRs fetched in one list call — awaiting-review WUs are few and recent. */
const PR_LIST_LIMIT = "100";

/** `statusCheckRollup` conclusions / states that count as a failing check. */
const FAILING_CHECK_OUTCOMES = new Set([
  "FAILURE",
  "ERROR",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

/**
 * Build a {@link WorkUnitPrSource} backed by the GitHub CLI.
 *
 * @param exec - Injectable command executor (runs `gh`).
 * @returns A PR source that resolves live disposition facts for the given branches.
 */
export function createGhWorkUnitPrSource(exec: GitExec): WorkUnitPrSource {
  return async (branches) => {
    const result = new Map<string, WorkUnitPrFacts>();
    if (branches.length === 0) return result;

    const { stdout } = await exec("gh", [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      PR_LIST_LIMIT,
      "--json",
      "headRefName,state,reviewDecision,statusCheckRollup",
    ]);

    const wanted = new Set(branches);
    for (const pr of parsePrList(stdout)) {
      if (!wanted.has(pr.headRefName)) continue;
      result.set(pr.headRefName, toFacts(pr));
    }
    return result;
  };
}

interface GhPr {
  headRefName: string;
  state: string;
  reviewDecision: string;
  statusCheckRollup: readonly unknown[];
}

/** Map one `gh` PR record onto the classifier's disposition facts. */
function toFacts(pr: GhPr): WorkUnitPrFacts {
  return {
    merged: pr.state === "MERGED",
    hasOpenPr: pr.state === "OPEN",
    approved: pr.reviewDecision === "APPROVED",
    changesRequested: pr.reviewDecision === "CHANGES_REQUESTED",
    checksFailed: pr.statusCheckRollup.some(isFailingCheck),
  };
}

/** Whether a `statusCheckRollup` entry reports a failing outcome (CheckRun or StatusContext). */
function isFailingCheck(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const record = entry as Record<string, unknown>;
  const conclusion = typeof record["conclusion"] === "string" ? record["conclusion"] : "";
  const state = typeof record["state"] === "string" ? record["state"] : "";
  return FAILING_CHECK_OUTCOMES.has(conclusion) || FAILING_CHECK_OUTCOMES.has(state);
}

/** Parse and defensively narrow the `gh pr list --json` array. */
function parsePrList(stdout: string): GhPr[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) return [];
  const prs: GhPr[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const headRefName = record["headRefName"];
    if (typeof headRefName !== "string" || headRefName === "") continue;
    prs.push({
      headRefName,
      state: typeof record["state"] === "string" ? record["state"] : "",
      reviewDecision: typeof record["reviewDecision"] === "string" ? record["reviewDecision"] : "",
      statusCheckRollup: Array.isArray(record["statusCheckRollup"]) ? record["statusCheckRollup"] : [],
    });
  }
  return prs;
}
