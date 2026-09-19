/**
 * What each boundary that computes a merge base returns when the history leaves more than one.
 *
 * A branch and its base can share two equally good common ancestors with neither reachable from the
 * other, and each reader here says so in its own terms rather than resolving to whichever side the
 * choice exposes: one refuses to collect at all, one refuses with a typed reason, and one reports the
 * cardinality as its overlap. Each case observes the reader the boundary actually runs, over a real
 * repository, against a control on the same arrangement with an unambiguous history.
 *
 * The attestation ceremony closes the file because it is where those readings reach an operator: it is
 * driven through its handler rather than called directly, and its case carries the recovery too, since a
 * refusal naming a remedy is worth only as much as the remedy actually clearing it.
 *
 * The subject collector is read twice, because it has two arms over one base read: the committed arm
 * diffs a named revision against the base, and the staged arm diffs the index. A change reaching only
 * one of them leaves the other unproven, so neither arm's coverage stands in for the other's.
 */

import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { createCandidateSubjectSnapshot } from "../../src/lib/work-unit/candidate-attestation.js";
import { handleAttest, LifecycleCommandRefusalSchema } from "../../src/handlers/lifecycle.js";
import { handleIntegrationCheckpoint } from "../../src/handlers/integration.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { runBaseDrift } from "../../src/lib/git/base-distance.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import {
  collectGitCandidateSubject,
  type CandidateSubjectCollection,
} from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  advanceBase,
  arrangeAmbiguousMergeBase,
  arrangeBranchSide,
} from "../helpers/base-advance.js";
import { createGitExec } from "../../src/lib/io-context.js";
import { checkpointIntegration } from "../../src/scripts/integration/checkpoint.js";
import { createIntegrationCheckpointDependencies } from "../../src/scripts/integration/checkpoint-composition.js";
import { runHandlerAt } from "../helpers/handler.js";
import {
  cleanupTempDir,
  DEFAULT_PROMPTS,
  initInTempRepo,
  makeGitExec,
} from "../helpers/integration.js";
import { setupMultiClone } from "../helpers/multi-clone.js";

const execFileAsync = promisify(execFile);

const WORK_UNIT = "sample-unit";
const BRANCH_PATH = "src/criss-cross-branch-side.ts";
const BASE_PATH = "src/criss-cross-base-side.ts";
const STAGED_PATH = "src/staged-work.ts";

// The criss-cross arrangement derives its commit messages from one root, and the content each side writes
// embeds that message. A control meant to isolate the history's shape has to reuse them, or its blobs differ
// from the ambiguous arm's and the comparison moves for a reason that has nothing to do with merge bases.
const ARRANGEMENT_MESSAGE = "ambiguous merge base";
const BRANCH_SIDE_MESSAGE = `${ARRANGEMENT_MESSAGE} branch ancestor`;

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

/** Collect the subject the boundary would attest, as the reader answers it — refusal included. */
async function collectSubject(
  cwd: string,
  baseRevision: string,
  revision?: string,
): Promise<CandidateSubjectCollection> {
  return collectGitCandidateSubject({
    cwd,
    name: WORK_UNIT,
    baseBranch: "main",
    baseRevision,
    ...(revision === undefined ? {} : { revision }),
    exec: makeGitExec(cwd),
  });
}

/**
 * The paths a collected subject carries, or the reason it carries none — so both outcomes read in one place.
 *
 * The paths are re-sorted by path. A subject orders its entries by their canonical bytes, which puts them in
 * digest order, so asserting the collector's own order would bind these cases to the fixture's blob content
 * rather than to which paths the subject carries.
 */
function collectedPathsOrReason(collection: CandidateSubjectCollection): readonly string[] | string {
  return collection.status === "collected"
    ? collection.target.subject.entries.map((entry) => entry.path).sort()
    : collection.reason;
}

/** Put one path in the index and leave it out of every commit, so the staged arm has something to read. */
async function stageWork(cwd: string, path: string): Promise<void> {
  await mkdir(join(cwd, dirname(path)), { recursive: true });
  await writeFile(join(cwd, path), `staged work\n${path}\n`, "utf-8");
  await git(cwd, ["add", "--", path]);
}

/** Run git with the fixture repository's own installed hooks out of the way. */
async function arcGit(cwd: string, args: readonly string[]): Promise<string> {
  return git(cwd, ["-c", "core.hooksPath=/dev/null", ...args]);
}

function machineContext() {
  return resolveProcessInteractionContext({ noInput: false, machineReadable: true, yes: "absent" });
}

function metaDocument(state: "Active" | "Integrating"): string {
  return [
    `# Metadata: ${WORK_UNIT}`,
    "",
    "| **State** | **Owner**   | **Branch**           | **Class** | **Priority** |",
    "| --------- | ----------- | -------------------- | --------- | ------------ |",
    `| \`${state}\` | \`test-user\` | \`feat/${WORK_UNIT}\` | \`Light\`   | \`P2\`         |`,
    "",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "- **Origin:** [internal]",
    "- **Design:** [none]",
    `- **Task List:** \`tasks-${WORK_UNIT}.md\``,
    "- **Review Rubric:** [none]",
    "",
    "- **Current Workflow:** [none]",
    "- **Last Completed:** verification",
    "- **Next Task:** [none]",
    "- **Blockers:** [none]",
    "",
    "- **Next Action:** verification complete",
    "",
    "- **PR URL:** [none]",
    "- **Completed:** [none]",
    "",
    "---",
    "",
  ].join("\n");
}

function taskDocument(): string {
  return "# Task List: Sample\n\n## **Phase 1:** Verification\n\n### `[x]` **1.1 Verification complete**\n";
}

/**
 * An Active work unit whose branch is ready to attest, in a repository ARC itself initialized.
 *
 * The readers above are reached directly, over a bare repository. The ceremony is reached through its
 * handler, so it needs everything attestation checks before it ever collects a subject — a resolvable
 * identity, an Active meta, a task list with nothing open, and no reviewable path the index is missing.
 */
async function attestableWorkUnit(state: "Active" | "Integrating" = "Active"): Promise<string> {
  const root = await initInTempRepo(DEFAULT_PROMPTS);
  cleanups.push(async () => cleanupTempDir(root));
  await arcGit(root, ["add", "-A"]);
  await arcGit(root, ["commit", "-m", "init"]);

  await arcGit(root, ["switch", "-c", `feat/${WORK_UNIT}`]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", `meta-${WORK_UNIT}.md`), metaDocument(state), "utf-8");
  await writeFile(join(root, ".arc", "active", `tasks-${WORK_UNIT}.md`), taskDocument(), "utf-8");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, BRANCH_PATH), "branch contribution\n", "utf-8");
  await arcGit(root, ["add", "-A"]);
  await arcGit(root, ["commit", "-m", "implementation"]);
  return root;
}

/**
 * Merge the same pair in opposite parent orders, leaving the branch and its base two best ancestors.
 *
 * Both merges name the two side commits rather than each other's result, which is what keeps neither
 * ancestor reachable from the other — a branch merging the base's own merge would collapse back to one.
 */
async function crossTheBase(root: string): Promise<void> {
  const branchSide = await arcGit(root, ["rev-parse", "HEAD"]);
  await arcGit(root, ["switch", "main"]);
  await mkdir(join(root, dirname(BASE_PATH)), { recursive: true });
  await writeFile(join(root, BASE_PATH), "base contribution\n", "utf-8");
  await arcGit(root, ["add", "-A"]);
  await arcGit(root, ["commit", "-m", "base side"]);
  const baseSide = await arcGit(root, ["rev-parse", "HEAD"]);
  await arcGit(root, ["switch", `feat/${WORK_UNIT}`]);
  await arcGit(root, ["merge", "--no-ff", "-m", "branch merge", baseSide]);
  await arcGit(root, ["switch", "main"]);
  await arcGit(root, ["merge", "--no-ff", "-m", "base merge", branchSide]);
  await arcGit(root, ["switch", `feat/${WORK_UNIT}`]);
}

async function attest(root: string): Promise<{ exitCode: number | undefined; result: unknown }> {
  const run = await runHandlerAt(root, async () => {
    await handleAttest(WORK_UNIT, { json: true }, machineContext());
  });
  return { exitCode: run.exitCode, result: JSON.parse(run.stdout) };
}

describe("the subject a work unit's own verification binds", () => {
  it("reports the branch's own contribution when one merge base is the only one", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd, paths: [BRANCH_PATH] });
    const advance = await advanceBase({ cwd, paths: [BASE_PATH] });

    const collection = await collectSubject(cwd, advance.head, await git(cwd, ["rev-parse", "HEAD"]));

    expect(collectedPathsOrReason(collection)).toEqual([BRANCH_PATH]);
  });

  it("collects no subject at all when the history leaves two equally good merge bases", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    const arrangement = await arrangeAmbiguousMergeBase({ cwd });

    // Not a choice between the two halves the two ancestors expose: either half would be bound as the
    // branch's contribution on the strength of a selection the result does not carry and nobody made.
    await expect(collectSubject(cwd, arrangement.base, arrangement.head)).resolves.toEqual({
      status: "refused",
      reason: "merge-base-ambiguous",
      detail: "The revisions have more than one best merge base.",
    });
  });

  it("separates on the shape of the history rather than on anything the branch contributed", async () => {
    const ambiguous = await checkoutOnWorkUnitBranch();
    const arrangement = await arrangeAmbiguousMergeBase({ cwd: ambiguous, message: ARRANGEMENT_MESSAGE });
    const unambiguous = await checkoutOnWorkUnitBranch();
    await arrangeBranchSide({ cwd: unambiguous, paths: [BRANCH_PATH], message: BRANCH_SIDE_MESSAGE });
    const advance = await advanceBase({
      cwd: unambiguous, paths: [BASE_PATH], message: ARRANGEMENT_MESSAGE,
    });

    // The two arrangements write identical content deliberately, so the same branch work reaches both
    // readings and only the shape of the history they sit in tells the outcomes apart.
    expect(collectedPathsOrReason(await collectSubject(ambiguous, arrangement.base, arrangement.head)))
      .toBe("merge-base-ambiguous");
    expect(collectedPathsOrReason(
      await collectSubject(unambiguous, advance.head, await git(unambiguous, ["rev-parse", "HEAD"])),
    )).toEqual([BRANCH_PATH]);
  });

  it("reports the branch's own contribution and its staged work when one merge base is the only one",
    async () => {
      const cwd = await checkoutOnWorkUnitBranch();
      await arrangeBranchSide({ cwd, paths: [BRANCH_PATH] });
      const advance = await advanceBase({ cwd, paths: [BASE_PATH] });
      await stageWork(cwd, STAGED_PATH);

      const collection = await collectSubject(cwd, advance.head);

      expect(collectedPathsOrReason(collection)).toEqual([BRANCH_PATH, STAGED_PATH]);
    });

  it("collects no staged subject either, rather than diffing the index against a chosen ancestor", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    const arrangement = await arrangeAmbiguousMergeBase({ cwd });
    await stageWork(cwd, STAGED_PATH);

    // Read separately from the committed arm above: the two share one base read, so a fix reaching only
    // one of them would leave the other diffing the index against an ancestor chosen without saying so.
    expect(collectedPathsOrReason(await collectSubject(cwd, arrangement.base))).toBe("merge-base-ambiguous");
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

    // Either ancestor would prove a contribution, and the pinned pair carries nothing naming which was
    // meant — so the classification stops instead of resolving to whichever side the pick exposes.
    expect(projected).toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "merge-base-ambiguous",
      detail: "Multiple baseline-to-current merge bases are available.",
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

  it("reports a history leaving two bases as ambiguous rather than as an unreadable one", async () => {
    const cwd = await checkoutOnWorkUnitBranch();
    await arrangeAmbiguousMergeBase({ cwd });

    const drift = await runBaseDrift({ exec: makeGitExec(cwd), baseBranch: "main", mode: "authoritative" });

    expect({ verdict: drift.verdict, movement: drift.movement, overlap: drift.overlap }).toEqual({
      verdict: "reconcile",
      movement: "unknown",
      overlap: { status: "ambiguous" },
    });
  });
});

describe("the Candidate attestation ceremony over an ambiguous history", () => {

  it("names the ambiguous history from Integrating too, where a record read runs ahead of it", async () => {
    const root = await attestableWorkUnit("Integrating");
    await crossTheBase(root);

    const refused = await attest(root);

    expect(refused.exitCode).toBe(1);
    const refusal = LifecycleCommandRefusalSchema.parse(refused.result);
    // In this state the public delivery renewal evidence is read before the subject is collected, and that
    // read examines records rather than history — so a work unit carrying no delivery plan passes it, and
    // what the operator is told is the shape of the branch rather than an unavailable renewal.
    expect(refusal.reason).toContain("cannot derive");
    expect(refusal.reason).toContain("merge-base-ambiguous");
    expect(refusal.reason).not.toContain("renewal");
  });

  it("refuses over two equally good bases, and attests once the base is merged in", async () => {
    const root = await attestableWorkUnit();
    await crossTheBase(root);

    const refused = await attest(root);

    expect(refused.exitCode).toBe(1);
    const refusal = LifecycleCommandRefusalSchema.parse(refused.result);
    expect(refusal.reason).toContain("merge-base-ambiguous");
    expect(refusal.remedy.argv).toEqual(["arc", "attest", WORK_UNIT]);

    // The remedy the refusal names, run as an operator would run it: one merge leaves the advanced base an
    // ancestor of the branch, so the pair has one best ancestor again and the same ceremony goes through.
    await arcGit(root, ["merge", "--no-ff", "-m", "merge the base in", "main"]);

    const attested = await attest(root);

    expect(attested.exitCode).toBe(0);
    expect(attested.result).toMatchObject({ status: "attested", operation: "root" });
  });
});

describe("the integration checkpoint over an ambiguous history", () => {
  /**
   * A checkpoint reached the way an operator reaches it, over a Candidate attested before the base crossed.
   *
   * The ceremony above refuses to attest while the pair leaves two ancestors, so this is the order that
   * actually produces the pairing: attest over one ancestor, then let the base acquire a second. The record
   * the checkpoint reads therefore exists, which is what carries the read past the missing-Candidate arm and
   * into the projection that resolves the pair again.
   */
  async function attestedThenCrossed(): Promise<string> {
    const root = await attestableWorkUnit();
    const attested = await attest(root);
    expect(attested.exitCode).toBe(0);
    // Attestation stages its managed record and meta projection rather than committing them; they ride the
    // verification commit, which is what has to exist before the branch can move.
    await arcGit(root, ["add", "-A"]);
    await arcGit(root, ["commit", "-m", "verification"]);
    await crossTheBase(root);
    // Base drift reads the branch against its published base, so the pair only exists once main is published.
    // It is pushed after the crossing, which is the state an operator is actually in when they checkpoint.
    const origin = await mkdtemp(join(tmpdir(), "arc-ambiguous-origin-"));
    cleanups.push(async () => cleanupTempDir(origin));
    await git(origin, ["init", "--bare", "--initial-branch=main", "."]);
    await arcGit(root, ["remote", "add", "origin", origin]);
    await arcGit(root, ["push", "origin", "main"]);
    await arcGit(root, ["fetch", "origin", "main"]);
    return root;
  }


  /**
   * Supply the exact-coordinate observation a hosted change request carries, and nothing else.
   *
   * Everything the pairing is about — the drift reading, the movement plan it feeds, the projection the
   * reconcile route consults next — stays the production composition's own. Only the host admission is
   * arranged, because it is read from a change request no local repository has, and it is upstream of the
   * two readings that have to disagree here.
   */
  function withHostedObservation(root: string) {
    const exec = createGitExec();
    return async (_cwd: string, workUnit: string) => checkpointIntegration(
      { schemaVersion: 1, workUnit },
      {
        ...createIntegrationCheckpointDependencies({ cwd: root, exec }),
        readMovementObservation: async (_name, drift) => {
          const coordinates = { base: drift.baseOid ?? "", head: drift.headOid ?? "" };
          return {
            feasibility: { state: "clean" as const, ...coordinates },
            admission: {
              state: "mergeable" as const,
              repository: "example/repository",
              changeRequest: 1,
              ...coordinates,
            },
          };
        },
      },
    );
  }

  it("names the merge that collapses the pair, not a rerun of the checkpoint that stopped", async () => {
    const root = await attestedThenCrossed();

    const run = await runHandlerAt(root, async () => {
      await handleIntegrationCheckpoint(WORK_UNIT, {}, machineContext(), {
        checkpoint: withHostedObservation(root),
      });
    });

    // The whole point of the pairing: the drift read answers this pair with a reconciliation, and the
    // projection the composition consults next resolves the same two revisions and refuses for the same
    // reason. A rerun would read the identical history, so the refusal has to name the merge instead.
    const result = JSON.parse(run.stdout) as {
      state: string;
      reason: string;
      detail: string;
      remedy: { text: string; argv: readonly string[] };
    };
    expect({ state: result.state, reason: result.reason, detail: result.detail }).toEqual({
      state: "blocked",
      reason: "composition-unavailable",
      detail: "The revisions have more than one best merge base.",
    });
    expect(result.remedy.text).toContain("Merge the configured base into the branch, then re-run");
    expect(result.remedy.argv).toEqual(["arc", "integrate", "checkpoint", WORK_UNIT]);
  });
});
