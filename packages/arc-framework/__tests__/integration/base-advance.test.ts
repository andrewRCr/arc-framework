/**
 * Base-advance harness behavior, verified against the shipped overlap analyzer.
 *
 * The movement kinds this harness claims to produce are asserted by running the analyzer the
 * boundaries themselves use, over real git repositories, rather than by trusting the harness's own
 * path table.
 */

import { describe, expect, it, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { analyzeBaseOverlap } from "../../src/lib/git/base-overlap.js";
import { analyzeIntegrationEvidence } from "../../src/lib/git/base-integration-evidence.js";
import { runBaseDrift } from "../../src/lib/git/base-distance.js";
import { classifyPathTreatment } from "../../src/lib/evidence-applicability/index.js";
import { makeGitExec } from "../helpers/integration.js";
import { setupMultiClone, setupWorktreeSiblings } from "../helpers/multi-clone.js";
import {
  advanceBase,
  arrangeBranchSide,
  movementPaths,
  withUnavailableBaseRead,
  type BaseMovementKind,
} from "../helpers/base-advance.js";

const execFileAsync = promisify(execFile);
const WORK_UNIT = "sample-unit";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** A bare origin plus one clone sitting on a work-unit branch, as every caller here does. */
async function checkoutOnWorkUnitBranch(): Promise<{ cwd: string; origin: string }> {
  const clone = await setupMultiClone();
  cleanups.push(clone.cleanup);
  await git(clone.cloneA, ["switch", "-c", `feat/${WORK_UNIT}`]);
  return { cwd: clone.cloneA, origin: clone.origin };
}

/** Run the shipped analyzer over a checkout, deriving its own ahead/behind rather than asserting one. */
async function analyzeOverlapAt(cwd: string, baseOid: string) {
  const counts = await git(cwd, ["rev-list", "--left-right", "--count", `HEAD...${baseOid}`]);
  const [ahead = 0, behind = 0] = counts.split(/\s+/u).map((value) => Number.parseInt(value, 10));
  const overlap = await analyzeBaseOverlap({
    exec: makeGitExec(cwd),
    baseOid,
    ahead,
    behind,
    classify: (path) => classifyPathTreatment(path, { workUnit: WORK_UNIT }),
  });
  return { ahead, behind, overlap };
}

/** Arrange both sides of one movement kind and report what the analyzer makes of it. */
async function observeMovement(cwd: string, kind: BaseMovementKind) {
  const paths = movementPaths(kind, WORK_UNIT);
  await arrangeBranchSide({ cwd, paths: paths.branch });
  const advance = await advanceBase({ cwd, paths: paths.base });
  return await analyzeOverlapAt(cwd, advance.head);
}

describe("base advance", () => {
  it("pushes the advanced head onto the remote base ref", async () => {
    const { cwd, origin } = await checkoutOnWorkUnitBranch();

    const result = await advanceBase({ cwd, paths: ["src/base-only-surface.ts"] });

    expect(await git(origin, ["rev-parse", "refs/heads/main"])).toBe(result.head);
  });

  it("leaves the caller's remote-tracking ref for the base at the advanced head", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();

    const result = await advanceBase({ cwd, paths: ["src/base-only-surface.ts"] });

    expect(await git(cwd, ["rev-parse", "refs/remotes/origin/main"])).toBe(result.head);
  });

  it("leaves the caller's checked-out branch and working tree undisturbed", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();

    await advanceBase({ cwd, paths: ["src/base-only-surface.ts"] });

    expect(await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe(`feat/${WORK_UNIT}`);
    expect(await git(cwd, ["status", "--porcelain"])).toBe("");
  });
});

describe("movement kinds, as the shipped analyzer classifies them", () => {
  it("classifies an advance sharing no path with the branch as no intersection at all", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();

    const observed = await observeMovement(cwd, "disjoint");

    // Both counts must be positive, or the analyzer short-circuits and the empty result below
    // says nothing about what the advance touched.
    expect(observed.ahead).toBeGreaterThan(0);
    expect(observed.behind).toBeGreaterThan(0);
    expect(observed.overlap).toStrictEqual({
      status: "available",
      substantivePaths: [],
      regenerablePaths: [],
    });
  });

  it("classifies an advance over a reviewable path the branch also changed as substantive", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();

    const observed = await observeMovement(cwd, "overlapping-substantive");

    expect(observed.overlap).toStrictEqual({
      status: "available",
      substantivePaths: ["src/shared-surface.ts"],
      regenerablePaths: [],
    });
  });

  it("classifies an advance over the tracked readiness projection as regenerable only", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();

    const observed = await observeMovement(cwd, "overlapping-regenerable-only");

    expect(observed.overlap).toStrictEqual({
      status: "available",
      substantivePaths: [],
      regenerablePaths: [".arc/backlog/ROADMAP.md"],
    });
  });

  it("drops an intersection that is only the work unit's own artifacts", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();

    const observed = await observeMovement(cwd, "evidence-neutral-intersection");

    expect(observed.ahead).toBeGreaterThan(0);
    expect(observed.behind).toBeGreaterThan(0);
    expect(observed.overlap).toStrictEqual({
      status: "available",
      substantivePaths: [],
      regenerablePaths: [],
    });
  });
});

describe("reaching a second checkout", () => {
  it("reaches a sibling worktree through the ref store it already shares", async () => {
    const siblings = await setupWorktreeSiblings({ siblingBranch: `feat/${WORK_UNIT}` });
    cleanups.push(siblings.cleanup);

    const result = await advanceBase({ cwd: siblings.primary, paths: ["src/base-only-surface.ts"] });

    // No observer entry and no fetch in the sibling: one common dir holds both checkouts' refs.
    expect(await git(siblings.sibling, ["rev-parse", "refs/remotes/origin/main"])).toBe(result.head);
  });

  it("leaves a separate clone's tracking ref behind until it is named as an observer", async () => {
    const clone = await setupMultiClone();
    cleanups.push(clone.cleanup);
    const before = await git(clone.cloneB, ["rev-parse", "refs/remotes/origin/main"]);

    const unobserved = await advanceBase({ cwd: clone.cloneA, paths: ["src/base-only-surface.ts"] });

    expect(await git(clone.cloneB, ["rev-parse", "refs/remotes/origin/main"])).toBe(before);
    expect(await git(clone.cloneB, ["rev-parse", "refs/remotes/origin/main"])).not.toBe(unobserved.head);
  });

  it("reaches a separate clone named as an observer", async () => {
    const clone = await setupMultiClone();
    cleanups.push(clone.cleanup);

    const result = await advanceBase({
      cwd: clone.cloneA,
      paths: ["src/base-only-surface.ts"],
      observers: [clone.cloneB],
    });

    expect(await git(clone.cloneB, ["rev-parse", "refs/remotes/origin/main"])).toBe(result.head);
  });
});

describe("an unavailable base read", () => {
  it("surfaces as the analyzer's typed unavailable verdict rather than a thrown error", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd, paths: ["src/branch-only-surface.ts"] });

    const drift = await runBaseDrift({
      exec: withUnavailableBaseRead(makeGitExec(cwd)),
      baseBranch: "main",
      mode: "authoritative",
    });

    expect(drift.verdict).toBe("unavailable");
    expect(drift.baseOid).toBeNull();
  });

  it("leaves every read other than the base fetch working", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();
    const exec = withUnavailableBaseRead(makeGitExec(cwd));

    const head = await exec("git", ["rev-parse", "HEAD"]);

    expect(head.stdout.trim()).toMatch(/^[0-9a-f]{40}$/u);
  });
});

describe("the shape of the advancing commit, as the shipped evidence scan reads it", () => {
  it("leaves a direct advance unclassifiable", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd, paths: ["src/branch-only-surface.ts"] });

    const advance = await advanceBase({ cwd, paths: ["src/base-only-surface.ts"] });

    expect(await analyzeIntegrationEvidence({ exec: makeGitExec(cwd), baseOid: advance.head })).toMatchObject({
      coverage: "partial",
      unclassifiedCommitCount: 1,
      limitations: expect.arrayContaining(["unclassified-commits"]),
    });
  });

  it("proves a landed advance from topology alone", async () => {
    const { cwd } = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd, paths: ["src/branch-only-surface.ts"] });

    const advance = await advanceBase({
      cwd,
      paths: ["src/base-only-surface.ts"],
      landing: "merge",
    });

    expect(await analyzeIntegrationEvidence({ exec: makeGitExec(cwd), baseOid: advance.head })).toMatchObject({
      coverage: "complete",
      unclassifiedCommitCount: 0,
      limitations: [],
      events: [{ proof: "topology" }],
    });
  });
});
