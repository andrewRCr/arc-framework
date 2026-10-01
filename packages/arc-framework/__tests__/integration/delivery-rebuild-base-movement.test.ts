/**
 * What the surfaces that rebuild a delivery chain return once the protected base has moved under it.
 *
 * A chain is cut from one base. When the base advances, the chain has to be rebuilt somewhere — at
 * initial authoring, at a bound correction's suffix, or at a replay over a landed predecessor — and
 * each of those surfaces reads the base differently. The probes here take the chain the ordinary
 * arrangement produces and move the base under it in the one way each surface is reached by.
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/git/exec.js";
import { closeDeliveryEligibility } from "../../src/lib/delivery/eligibility.js";
import { proveGitDeliveryContribution } from "../../src/lib/delivery/git-contribution-proof.js";
import { createTempRepoCore } from "../helpers/temp-repo.js";
import {
  advanceProtectedBase,
  arrangeCandidateChain,
  prepareWindow,
  prepareWindowResult,
  SHARED_PATH,
  type CandidateChainArrangement,
} from "../helpers/delivery-eligibility-arrangement.js";
import { removeGitBackedDir } from "../helpers/temp-repo.js";
import { expectPinnedObservation } from "../helpers/pinned-observation.js";

const execFileAsync = promisify(execFile);
const ORIGINATING_TOP = "refs/heads/candidate/top";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

async function arrange(): Promise<CandidateChainArrangement> {
  const arrangement = await arrangeCandidateChain("arc-delivery-rebuild-");
  roots.push(arrangement.repository);
  return arrangement;
}

/**
 * Recut the member chain on the current protected base, carrying the same member contributions.
 *
 * This is what an operator does by hand when the base has moved and no typed constructor exists: the
 * originating top is left where it is and the members are rebuilt on what `main` now points at.
 *
 * @param arrangement - The chain whose members are being rebuilt.
 * @returns Candidate references in plan order, for the recut chain.
 */
async function recutMembersOnCurrentBase(
  arrangement: CandidateChainArrangement,
): Promise<readonly { readonly deliverableId: string; readonly ref: string }[]> {
  const contributions = [
    { branch: "recut/first", path: "first.txt", contents: "reviewed first member\n" },
    { branch: "recut/top", path: "top.txt", contents: "reviewed terminal\n" },
  ];
  let start = "main";
  for (const contribution of contributions) {
    await arrangement.git(["switch", "-c", contribution.branch, start]);
    await writeFile(join(arrangement.repository, contribution.path), contribution.contents, "utf8");
    await arrangement.git(["add", contribution.path]);
    await arrangement.git(["commit", "-m", contribution.branch]);
    start = contribution.branch;
  }
  await arrangement.git(["switch", "main"]);
  return contributions.map((contribution, index) => ({
    deliverableId: arrangement.plan.members[index]!.deliverableId,
    ref: `refs/heads/${contribution.branch}`,
  }));
}

describe("initial authoring, once the base moved before the chain was published", () => {
  it("closes eligible for a chain still cut from the base its own top was cut from", async () => {
    const arrangement = await arrange();
    await advanceProtectedBase(arrangement, { [SHARED_PATH]: "shared after an independent landing\n" });
    const snapshot = await prepareWindow(arrangement);

    await expect(closeDeliveryEligibility(snapshot, arrangement.deps))
      .resolves.toMatchObject({ status: "eligible" });
  });

  it("admits a chain recut on the moved base, then refuses it after the gates would have run", async () => {
    const arrangement = await arrange();
    await advanceProtectedBase(arrangement, { [SHARED_PATH]: "shared after an independent landing\n" });
    const candidates = await recutMembersOnCurrentBase(arrangement);

    const outcome = await prepareThenClose(arrangement, candidates);

    expectPinnedObservation(outcome, {
      behavior: "Preparation holds every coordinate the completeness comparison needs — the originating top, "
        + "the recut final candidate, and both base trees — so a chain it cannot close should be refused "
        + "before it is admitted rather than after a full gate cycle has been spent on it.",
      observed: { preparation: "prepared", close: "refused", closeReason: "completeness-mismatched" },
      target: { preparation: "refused", close: "not-reached", closeReason: null },
    });
  });

  it("names a different reason for the same recut when the base added a path instead of changing one", async () => {
    const arrangement = await arrange();
    await advanceProtectedBase(arrangement, { "landed.txt": "an independent checkout added this\n" });
    const candidates = await recutMembersOnCurrentBase(arrangement);

    const outcome = await prepareThenClose(arrangement, candidates);

    // Same mistake, same surface, same moment — the reason follows what the base change touched, so the
    // one the field recorded is not the only one an operator can meet here.
    expect(outcome).toMatchObject({ preparation: "prepared", close: "refused", closeReason: "completeness-invented" });
  });
});

/**
 * Prepare the recut chain against the originating top, then close it, reporting both results.
 *
 * Preparation is the signal to go run Tier 2 against each member, so what it admits is what a full gate
 * cycle is spent on, and the pair is what shows where the refusal lands relative to that spend.
 *
 * @param arrangement - The chain whose base has moved.
 * @param candidates - The recut candidate references, in plan order.
 * @returns What preparation returned, what the close then returned, and the close's reason.
 */
async function prepareThenClose(
  arrangement: CandidateChainArrangement,
  candidates: readonly { readonly deliverableId: string; readonly ref: string }[],
): Promise<Record<string, unknown>> {
  const prepared = await prepareWindowResult(arrangement, { candidates, topRef: ORIGINATING_TOP });
  if (prepared.status !== "prepared") {
    // Reported rather than thrown: preparation refusing is the outcome this pair is held against, and a
    // throw here would kill the run before the assertion could say the hold is spent.
    return { preparation: prepared.status, close: "not-reached", closeReason: null };
  }
  const closed = await closeDeliveryEligibility(prepared.snapshot, arrangement.deps);
  return {
    preparation: prepared.status,
    close: closed.status,
    closeReason: closed.status === "refused" ? closed.reason : null,
  };
}

/**
 * Point a separate originating-top branch at the chain's terminal member.
 *
 * The authoring locus a correction is authorized on is not the private candidate ref that carries the
 * member, so the two have to be distinct refs before either can move without the other.
 *
 * @param arrangement - The chain whose top locus is being named.
 * @returns The originating top reference.
 */
async function nameOriginatingTopLocus(arrangement: CandidateChainArrangement): Promise<string> {
  await arrangement.git(["branch", "top/locus", "candidate/top"]);
  return "refs/heads/top/locus";
}

/** Author the authorized correction on the top locus, changing a path the members already carry. */
async function correctTopLocus(arrangement: CandidateChainArrangement): Promise<void> {
  await arrangement.git(["switch", "top/locus"]);
  await writeFile(join(arrangement.repository, "top.txt"), "reviewed terminal, corrected\n", "utf8");
  await arrangement.git(["add", "top.txt"]);
  await arrangement.git(["commit", "-m", "authorized review-fix correction"]);
  await arrangement.git(["switch", "main"]);
}

describe("rematerialization, once an authorized correction moved what the suffix hangs off", () => {
  it("closes eligible while the top locus and the private candidates still agree", async () => {
    const arrangement = await arrange();
    const topRef = await nameOriginatingTopLocus(arrangement);

    const snapshot = await prepareWindow(arrangement, { topRef });

    await expect(closeDeliveryEligibility(snapshot, arrangement.deps))
      .resolves.toMatchObject({ status: "eligible" });
  });

  it("refuses the unchanged private candidates once the correction lands on the top", async () => {
    const arrangement = await arrange();
    const topRef = await nameOriginatingTopLocus(arrangement);
    await correctTopLocus(arrangement);

    // Rematerialization dispatches against the private candidate refs as they stand. Nothing moved them,
    // and nothing in the suite can: the correction was authorized on the locus, not on the suffix.
    const snapshot = await prepareWindow(arrangement, { topRef });
    const closed = await closeDeliveryEligibility(snapshot, arrangement.deps);

    expectPinnedObservation(closed, {
      behavior: "An authorized correction on the top locus is the moment the private suffix is supposed to be "
        + "rebuilt from it, so dispatching against the suffix should reach a result that names the rebuild owed "
        + "rather than a completeness comparison the suffix cannot satisfy until someone rebuilds it by hand.",
      observed: { status: "refused", reason: "completeness-mismatched" },
      target: { status: "refused", reason: "rebuild-required" },
    });
  });
});

describe("the two rebuild surfaces, read against each other", () => {
  it("refuses identically whether the members are stale or the top is", async () => {
    const recutOnMovedBase = await arrange();
    await advanceProtectedBase(recutOnMovedBase, { [SHARED_PATH]: "shared after an independent landing\n" });
    const candidates = await recutMembersOnCurrentBase(recutOnMovedBase);
    const authoring = await closeDeliveryEligibility(
      await prepareWindow(recutOnMovedBase, { candidates, topRef: ORIGINATING_TOP }),
      recutOnMovedBase.deps,
    );

    const correctedTop = await arrange();
    const topRef = await nameOriginatingTopLocus(correctedTop);
    await correctTopLocus(correctedTop);
    const rematerialization = await closeDeliveryEligibility(
      await prepareWindow(correctedTop, { topRef }),
      correctedTop.deps,
    );

    // Opposite conditions with opposite remedies: one wants the chain recut on the top's own base, the
    // other wants the suffix rebuilt from the corrected top. The refusal carries nothing that separates
    // them, so neither remedy can be derived from what the operator is handed.
    expect(authoring).toEqual(rematerialization);
    expect(authoring).toEqual({ status: "refused", reason: "completeness-mismatched" });
  });
});

/**
 * A landed predecessor and a pinned pre-landing member that conflict on one path.
 *
 * This is the post-land settlement's arrangement: the predecessor landed on the base carrying its own
 * change to a path the pinned member also changed, so replaying the pinned contribution onto what
 * landed cannot compose.
 *
 * @returns The repository, a raw exec over it, and the coordinates each replay endpoint reads.
 */
async function arrangePostLandConflict(): Promise<{
  readonly repository: string;
  readonly exec: RawGitExec;
  readonly git: (args: readonly string[]) => Promise<string>;
  readonly coordinate: (head: string) => Promise<{ head: string; tree: string }>;
  readonly chainBase: string;
  readonly pinnedMember: string;
  readonly landedPredecessor: string;
}> {
  const repository = await createTempRepoCore({ prefix: "arc-delivery-post-land-" });
  roots.push(repository);
  const git = async (args: readonly string[]): Promise<string> => (
    await execFileAsync("git", [...args], { cwd: repository })
  ).stdout.trim();
  const exec: RawGitExec = async (args) => {
    const result = await execFileAsync("git", [...args], { cwd: repository, encoding: "buffer" });
    return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
  };
  const coordinate = async (head: string) => ({ head, tree: await git(["rev-parse", `${head}^{tree}`]) });

  await writeFile(join(repository, SHARED_PATH), "before either member\n", "utf8");
  await git(["add", SHARED_PATH]);
  await git(["commit", "-m", "chain base"]);
  const chainBase = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "suffix/member"]);
  await writeFile(join(repository, SHARED_PATH), "the suffix member's line\n", "utf8");
  await git(["commit", "-am", "pinned pre-landing member"]);
  const pinnedMember = await git(["rev-parse", "HEAD"]);

  await git(["switch", "-c", "landed/predecessor", chainBase]);
  await writeFile(join(repository, SHARED_PATH), "the landed predecessor's line\n", "utf8");
  await git(["commit", "-am", "predecessor landed on the base"]);
  const landedPredecessor = await git(["rev-parse", "HEAD"]);

  return { repository, exec, git, coordinate, chainBase, pinnedMember, landedPredecessor };
}

describe("post-land settlement, replaying a pinned contribution onto a landed predecessor", () => {
  it("refuses the replay with the conflicted path", async () => {
    const arrangement = await arrangePostLandConflict();

    const proof = await proveGitDeliveryContribution({
      exec: arrangement.exec,
      before: {
        predecessor: await arrangement.coordinate(arrangement.chainBase),
        member: await arrangement.coordinate(arrangement.pinnedMember),
      },
      after: {
        predecessor: await arrangement.coordinate(arrangement.landedPredecessor),
        member: await arrangement.coordinate(arrangement.landedPredecessor),
      },
    });

    expect(proof).toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: [SHARED_PATH],
    });
  });

  it("returns the identical refusal after the operator resolves the conflicted path", async () => {
    const arrangement = await arrangePostLandConflict();
    const before = {
      predecessor: await arrangement.coordinate(arrangement.chainBase),
      member: await arrangement.coordinate(arrangement.pinnedMember),
    };
    const afterPredecessor = await arrangement.coordinate(arrangement.landedPredecessor);

    // The operator does exactly what the settlement's guidance directs: resolves the listed path and
    // produces a new member head over the landed predecessor.
    await arrangement.git(["switch", "-c", "suffix/resolved", arrangement.landedPredecessor]);
    await writeFile(
      join(arrangement.repository, SHARED_PATH),
      "the landed predecessor's line\nthe suffix member's line\n",
      "utf8",
    );
    await arrangement.git(["commit", "-am", "resolve the conflicted suffix path"]);
    const resolved = await arrangement.git(["rev-parse", "HEAD"]);

    const unresolved = await proveGitDeliveryContribution({
      exec: arrangement.exec,
      before,
      after: { predecessor: afterPredecessor, member: afterPredecessor },
    });
    const afterResolution = await proveGitDeliveryContribution({
      exec: arrangement.exec,
      before,
      after: { predecessor: afterPredecessor, member: await arrangement.coordinate(resolved) },
    });

    // The conflict is composed from the pinned predecessor, the pinned member, and the landed
    // predecessor. The resolved head is not one of those, so resolving cannot reach the outcome —
    // which is what leaves the instruction to resolve and retry with no completing input.
    expect(afterResolution).toEqual(unresolved);
    expect(afterResolution).toMatchObject({ reason: "contribution-conflicted" });
  });
});
