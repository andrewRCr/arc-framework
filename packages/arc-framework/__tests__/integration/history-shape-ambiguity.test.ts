/**
 * What each boundary that computes a merge base returns when the history leaves more than one.
 *
 * A branch and its base can share two equally good common ancestors with neither reachable from the
 * other, and the readers here disagree about what to do: one picks a side without saying so, one
 * refuses with a typed reason, and one reports its evidence unavailable. Each case observes the
 * reader the boundary actually runs, over a real repository, against a control on the same
 * arrangement with an unambiguous history.
 */

import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../src/lib/work-unit/candidate-attestation.js";
import { runBaseDrift } from "../../src/lib/git/base-distance.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  advanceBase,
  arrangeAmbiguousMergeBase,
  arrangeBranchSide,
} from "../helpers/base-advance.js";
import { makeGitExec } from "../helpers/integration.js";
import { setupMultiClone } from "../helpers/multi-clone.js";
import { expectPinnedObservation } from "../helpers/pinned-observation.js";

const execFileAsync = promisify(execFile);

const WORK_UNIT = "sample-unit";
const BRANCH_PATH = "src/criss-cross-branch-side.ts";
const BASE_PATH = "src/criss-cross-base-side.ts";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd });
  return stdout.trim();
}

/** A bare origin plus one clone sitting on a work-unit branch. */
async function checkoutOnWorkUnitBranch(): Promise<string> {
  const clone = await setupMultiClone();
  cleanups.push(clone.cleanup);
  await git(clone.cloneA, ["switch", "-c", `feat/${WORK_UNIT}`]);
  return clone.cloneA;
}

/** The paths the collected subject reports, which is what an attestation goes on to bind. */
async function subjectPaths(cwd: string, revision: string, baseRevision: string): Promise<string[]> {
  const target = await collectGitCandidateTarget({
    cwd,
    name: WORK_UNIT,
    baseBranch: "main",
    baseRevision,
    revision,
    exec: makeGitExec(cwd),
  });
  return target.subject.entries.map((entry) => entry.path);
}

describe("the subject a work unit's own verification binds", () => {
  it("reports the branch's own contribution when one merge base is the only one", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd, paths: [BRANCH_PATH] });
    const advance = await advanceBase({ cwd, paths: [BASE_PATH] });

    const paths = await subjectPaths(cwd, await git(cwd, ["rev-parse", "HEAD"]), advance.head);

    expect(paths).toEqual([BRANCH_PATH]);
  });

  it("reports the base's own change as the contribution when two merge bases exist", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    const arrangement = await arrangeAmbiguousMergeBase({ cwd });

    const paths = await subjectPaths(cwd, arrangement.head, arrangement.base);

    expectPinnedObservation({ paths }, {
      behavior: "A branch whose history leaves two equally good merge bases still contributed exactly "
        + "what its own commits changed, so collecting its subject should report that contribution "
        + "rather than whichever side one silently chosen ancestor happens to expose.",
      observed: { paths: [BASE_PATH] },
      target: { paths: [BRANCH_PATH] },
    });
  });

  it("digests a subject that differs from the one the same branch work produces unambiguously", async () => {
    const ambiguous = await checkoutOnWorkUnitBranch();
    const arrangement = await arrangeAmbiguousMergeBase({ cwd: ambiguous });
    const unambiguous = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd: unambiguous, paths: [BRANCH_PATH] });
    const advance = await advanceBase({ cwd: unambiguous, paths: [BASE_PATH] });

    const digest = async (cwd: string, revision: string, base: string): Promise<string> => (
      await collectGitCandidateTarget({
        cwd, name: WORK_UNIT, baseBranch: "main", baseRevision: base, revision, exec: makeGitExec(cwd),
      })
    ).subject.subjectDigest;

    expect(await digest(ambiguous, arrangement.head, arrangement.base)).not.toBe(
      await digest(unambiguous, await git(unambiguous, ["rev-parse", "HEAD"]), advance.head),
    );
  });
});

describe("Candidate applicability over an ambiguous history", () => {
  it("refuses with a typed reason rather than choosing one of the two bases", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    const arrangement = await arrangeAmbiguousMergeBase({ cwd });
    const exec: RawGitExec = async (args) => {
      const output = await execFileAsync("git", [...args], { cwd, encoding: "buffer" });
      return { stdout: new Uint8Array(output.stdout), stderr: new Uint8Array(output.stderr) };
    };
    const snapshot = (source: string) => createCandidateSubjectSnapshot([{
      path: BRANCH_PATH,
      mode: "100644",
      digest: canonicalDigest({ source }),
      treatment: "reviewable",
    }]);

    const projected = await projectGitCandidateApplicability({
      request: {
        candidateId: canonicalDigest({ candidate: "ambiguous-history" }),
        baselineTarget: { revision: arrangement.head, subject: snapshot("baseline") },
        currentTarget: { revision: arrangement.head, subject: snapshot("current") },
        currentBase: arrangement.base,
      },
      exec,
      observeEndpoints: async () => ({
        candidateHead: arrangement.head,
        baseHead: arrangement.base,
      }),
    });

    expectPinnedObservation(projected, {
      behavior: "Two equally good merge bases leave the contribution provable from either one, so "
        + "applicability should classify the Candidate rather than report that it cannot be classified at all.",
      observed: {
        state: "classification-unavailable",
        nextAction: "stop",
        reason: "merge-base-ambiguous",
        detail: "Multiple baseline-to-current merge bases are available.",
      },
      target: { state: "applicable" },
    });
  });
});

describe("authoritative base drift over an ambiguous history", () => {
  it("classifies the overlap when one merge base is the only one", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd, paths: [BRANCH_PATH] });
    await advanceBase({ cwd, paths: [BASE_PATH] });

    const drift = await runBaseDrift({ exec: makeGitExec(cwd), baseBranch: "main", mode: "authoritative" });

    expect(drift.verdict).toBe("reconcile");
    expect(drift.overlap).toMatchObject({ status: "available", substantivePaths: [] });
  });

  it("reports the overlap unavailable rather than proving it from one of the two bases", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    await arrangeAmbiguousMergeBase({ cwd });

    const drift = await runBaseDrift({ exec: makeGitExec(cwd), baseBranch: "main", mode: "authoritative" });

    expectPinnedObservation({ verdict: drift.verdict, overlap: drift.overlap }, {
      behavior: "Two equally good merge bases leave the changed-path intersection the same from either "
        + "one, so drift should report the overlap it can establish rather than none at all.",
      observed: { verdict: "reconcile", overlap: { status: "unavailable", reason: "merge-base-failed" } },
      target: { overlap: { status: "available" } },
    });
  });
});
