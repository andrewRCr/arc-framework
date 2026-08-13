/** Production composition for exact-target review status. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import type { GitExec } from "../../lib/git/exec.js";
import { branchToWorkUnitSlug } from "../../lib/work-unit/completed-index.js";
import { readSubmissionBoundary } from "../../lib/work-unit/submission-boundary-store.js";
import {
  resolveChangeRequest,
  type ChangeRequestTargetRef,
} from "./change-request.js";
import { createGhChangeRequestResolutionPort } from "./hosts/github/change-request.js";
import { createGhRequiredChecksPort } from "./hosts/github/checks-await.js";
import { hostedGhRunner } from "./hosted/gh-process.js";
import type {
  RequiredCheckStatus,
  ReviewStatusObservation,
  ReviewStatusPort,
  RoutedReviewObligation,
} from "./status.js";

function aggregateChecks(checks: readonly { state: "pending" | "green" | "failed" }[]): RequiredCheckStatus {
  if (checks.length === 0) return "not-required";
  if (checks.some(({ state }) => state === "failed")) return "failed";
  if (checks.every(({ state }) => state === "green")) return "green";
  return "pending";
}

async function readBasePosition(input: {
  cwd: string;
  exec: GitExec;
  headSha: string;
}): Promise<Pick<ReviewStatusObservation, "currentBaseOid" | "baseContained">> {
  try {
    const { settings } = await readConfigSettings(input.cwd);
    const base = settings["branch.base"];
    await input.exec("git", ["fetch", "origin", base], { cwd: input.cwd });
    const currentBaseOid = (await input.exec(
      "git",
      ["rev-parse", "--verify", `refs/remotes/origin/${base}`],
      { cwd: input.cwd, objectAccess: "local-only" },
    )).stdout.trim();
    if (!/^[0-9a-f]{40}$/u.test(currentBaseOid)) throw new Error("invalid base object ID");
    try {
      await input.exec("git", ["merge-base", "--is-ancestor", currentBaseOid, input.headSha], {
        cwd: input.cwd,
        objectAccess: "local-only",
      });
      return { currentBaseOid, baseContained: true };
    } catch {
      return { currentBaseOid, baseContained: false };
    }
  } catch {
    return { currentBaseOid: null, baseContained: false };
  }
}

async function readRoutedObligation(
  cwd: string,
  target: ChangeRequestTargetRef,
): Promise<RoutedReviewObligation> {
  const workUnit = branchToWorkUnitSlug(target.headRef);
  if (workUnit === null) {
    return { state: "blocked", detail: "The target branch does not identify a work unit." };
  }
  try {
    const boundary = await readSubmissionBoundary(cwd, workUnit);
    if (boundary === null) {
      return { state: "blocked", detail: "The publication boundary is unavailable." };
    }
    if (boundary.reservation !== null || boundary.locus === "hosted-review-pending") {
      return { state: "review-required", detail: "The routed hosted review obligation remains unsettled." };
    }
    return { state: "settled", detail: "The routed review obligation is settled." };
  } catch (error) {
    return {
      state: "blocked",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Bind GitHub, publication-boundary, and Git base reads to the status reducer. */
export function createReviewStatusPort(input: { cwd: string; exec: GitExec }): ReviewStatusPort {
  return {
    observe: async (target) => {
      const changeRequestPort = createGhChangeRequestResolutionPort(input.exec, input.cwd);
      const refs = await changeRequestPort.readHeadRef(target.headRef);
      const actualHeadSha = refs.remote ?? refs.local ?? target.headSha;
      const [base, routedObligation] = await Promise.all([
        readBasePosition({ cwd: input.cwd, exec: input.exec, headSha: target.headSha }),
        readRoutedObligation(input.cwd, target),
      ]);
      const resolution = await resolveChangeRequest(
        { headRef: target.headRef, headSha: target.headSha },
        changeRequestPort,
      );
      if (
        resolution.state !== "open"
        || resolution.targetRef.repository.toLowerCase() !== target.repository.toLowerCase()
      ) {
        return {
          actualHeadSha,
          requiredChecks: "unavailable",
          routedObligation: {
            state: "blocked",
            detail: `The exact target has no reusable open change request (${resolution.state}).`,
          },
          ...base,
        };
      }
      const checksPort = createGhRequiredChecksPort(hostedGhRunner);
      const repository = await checksPort.resolveRepository();
      if (repository.toLowerCase() !== target.repository.toLowerCase()) {
        return {
          actualHeadSha,
          requiredChecks: "unavailable",
          routedObligation: { state: "blocked", detail: "The required-check repository does not match the target." },
          ...base,
        };
      }
      const signal = new AbortController().signal;
      const checkedHead = await checksPort.readHead(repository, resolution.candidate.number, signal);
      const requiredChecks = aggregateChecks(
        await checksPort.readRequiredChecks(repository, resolution.candidate.number, signal),
      );
      return { actualHeadSha: checkedHead, requiredChecks, routedObligation, ...base };
    },
  };
}
