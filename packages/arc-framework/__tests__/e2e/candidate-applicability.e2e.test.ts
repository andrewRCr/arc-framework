/** Real-CLI coverage for exact-bound Candidate applicability selection and replay. */

import { mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRawGitExec, gitExec } from "../../src/lib/io-context.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import { reduceCandidateDurableBaseline } from "../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecordVersioned } from "../../src/lib/work-unit/candidate-record-store.js";
import { projectGitCandidateApplicability } from "../../src/lib/work-unit/git-candidate-applicability.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { CandidateManagedRecordV1Schema } from "../../src/lib/work-unit/candidate-attestation.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
  runArcWithStdin,
} from "./store-default.js";

const META = makeMetaFixture("example", {
  owner: "test-user",
  branch: "feat/example",
  workClass: "Light",
  priority: "P2",
  taskList: "tasks-example.md",
  lastCompleted: "verification",
  nextAction: "verification complete",
});

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => cleanupTempDir(root)));
});

// The case commits its meta, task list, and Candidate record as tracked files and stages the selection it writes, which
// only the in-repo store keeps; the store holds them as records, and its case follows.
describe("arc candidate applicability resolve", () => {
  useInRepoStoreForEach();
  it("binds and replays one owned selection, then refuses a foreign active owner", async () => {
    const root = await createTempRepo("arc-candidate-applicability-");
    roots.push(root);
    const initialized = await runArc(["init", "--yes", "--name", "example"], root);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await writeFile(join(root, "reviewed.txt"), "base\n", "utf8");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "install ARC"]);
    const localBase = await git(root, ["rev-parse", "main^{commit}"]);

    await git(root, ["switch", "-c", "feat/example"]);
    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await writeFile(join(root, ".arc", "active", "meta-example.md"), META, "utf8");
    await writeFile(
      join(root, ".arc", "active", "tasks-example.md"),
      "# Task List: Example\n\n- [x] Verification complete\n",
      "utf8",
    );
    await writeFile(join(root, "reviewed.txt"), "feature\n", "utf8");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "feature implementation"]);
    const attested = await runArc(["attest", "example", "--json"], root);
    expect(attested.exitCode, attested.stderr || attested.stdout).toBe(0);
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "record candidate"]);

    await git(root, ["switch", "main"]);
    await writeFile(join(root, "reviewed.txt"), "base moved\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "move base"]);
    const currentBase = await git(root, ["rev-parse", "HEAD^{commit}"]);
    await git(root, ["switch", "feat/example"]);
    await git(root, ["update-ref", "refs/remotes/origin/main", currentBase]);
    await git(root, ["branch", "-f", "main", localBase]);
    await expect(git(root, ["merge", "--no-ff", currentBase, "-m", "merge base"])).rejects.toThrow();
    await writeFile(join(root, "reviewed.txt"), "base moved and feature\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "--no-edit"]);

    const versioned = await readCandidateRecordVersioned(root, "example");
    if (versioned.record === null || versioned.version === null) throw new Error("missing Candidate record");
    const baseline = reduceCandidateDurableBaseline(versioned.record);
    const currentTarget = await collectCandidateSubjectTarget({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec: gitExec,
    });
    expect(await git(root, ["rev-parse", "main^{commit}"])).toBe(localBase);
    expect(await git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"])).toBe(currentBase);
    const decision = await projectGitCandidateApplicability({
      request: {
        candidateId: baseline.candidateId,
        baselineTarget: baseline.target,
        currentTarget,
        currentBase,
      },
      exec: createRawGitExec(root),
      observeEndpoints: async () => ({
        candidateHead: await git(root, ["rev-parse", "HEAD^{commit}"]),
        baseHead: await git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"]),
      }),
    });
    expect(decision.state).toBe("decision-required");
    if (decision.state !== "decision-required") throw new Error("expected a bounded applicability decision");
    const request = {
      schemaVersion: 1,
      expectedRecordVersion: versioned.version,
      candidateId: baseline.candidateId,
      priorTarget: baseline.target,
      currentTarget,
      currentBase,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
      selectedBy: "test-user",
      choice: "covered",
    };

    const carrierParent = await mkdtemp(join(tmpdir(), "arc-candidate-carrier-"));
    const original = join(carrierParent, "original");
    const carrier = join(carrierParent, "replacement");
    await git(root, ["switch", "main"]);
    await git(root, ["worktree", "add", original, "feat/example"]);
    await writeWorktreeOwnershipMarker(original, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "example" },
      spawningIdentity: "test-user",
      now: Date.parse("2026-08-29T00:00:00.000Z"),
    });
    await git(original, ["switch", "--detach"]);
    await git(root, ["worktree", "add", carrier, "feat/example"]);
    try {
      const locus = await runArc(["locus", "--json"], carrier);
      expect(locus.exitCode, locus.stderr || locus.stdout).toBe(0);
      expect(JSON.parse(locus.stdout)).toMatchObject({
        entering: {
          kind: "selected",
          row: {
            kind: "unresolved-checkout",
            checkout: { path: carrier },
          },
        },
        active: null,
      });

      const candidatePath = join(carrier, ".arc", "system", ".internal", "candidates", "example.json");
      const candidateBefore = await readFile(candidatePath, "utf8");
      const refusedCarrier = await runArcWithStdin(
        ["candidate", "applicability", "resolve", "example", "-"],
        carrier,
        `${JSON.stringify(request)}\n`,
      );
      expect(refusedCarrier.exitCode).toBe(1);
      expect(JSON.parse(refusedCarrier.stdout)).toMatchObject({
        state: "execution-unavailable",
        nextAction: "stop",
        reason: "active-work-unit-unavailable",
      });
      expect(await readFile(candidatePath, "utf8")).toBe(candidateBefore);
      expect(await git(carrier, ["diff", "--cached", "--name-only", "--", candidatePath])).toBe("");
    } finally {
      await git(root, ["worktree", "remove", "--force", carrier]).catch(() => undefined);
      await git(root, ["worktree", "remove", "--force", original]).catch(() => undefined);
      await cleanupTempDir(carrierParent);
      await git(root, ["switch", "feat/example"]);
    }

    const first = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(request)}\n`,
    );
    expect(first.exitCode, first.stderr || first.stdout).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ state: "resolved", nextAction: "commit-selection" });
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe(
      ".arc/system/.internal/candidates/example.json",
    );

    const replay = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(request)}\n`,
    );
    expect(replay.exitCode, replay.stderr || replay.stdout).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ state: "exact-replay", nextAction: "commit-selection" });
    expect((await readCandidateRecordVersioned(root, "example")).record?.transitions).toHaveLength(1);
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe(
      ".arc/system/.internal/candidates/example.json",
    );

    await git(root, ["commit", "-m", "record applicability selection"]);
    const committedReplay = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(request)}\n`,
    );
    expect(committedReplay.exitCode, committedReplay.stderr || committedReplay.stdout).toBe(0);
    expect(JSON.parse(committedReplay.stdout)).toMatchObject({ state: "exact-replay", nextAction: "continue" });
    expect(await git(root, ["diff", "--cached", "--name-only"])).toBe("");

    await rename(
      join(root, ".arc", "active", "meta-example.md"),
      join(root, ".arc", "active", "meta-active-owner.md"),
    );
    const currentVersion = await readCandidateRecordVersioned(root, "example");
    if (currentVersion.version === null) throw new Error("missing current Candidate version");
    const foreignRequest = {
      ...request,
      expectedRecordVersion: currentVersion.version,
      selectedBy: "another-reviewer",
    };
    const candidatePath = join(root, ".arc", "system", ".internal", "candidates", "example.json");
    const candidateBefore = await readFile(candidatePath, "utf8");
    const foreign = await runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"],
      root,
      `${JSON.stringify(foreignRequest)}\n`,
    );
    expect(foreign.exitCode).toBe(1);
    expect(JSON.parse(foreign.stdout)).toMatchObject({
      state: "execution-unavailable",
      nextAction: "stop",
      reason: "active-work-unit-mismatch",
    });
    expect(await readFile(candidatePath, "utf8")).toBe(candidateBefore);
    expect(await git(root, ["diff", "--cached", "--name-only", "--", candidatePath])).toBe("");
  }, 60_000);
});

describe("arc candidate applicability resolve on the store", () => {
  it("binds and replays one owned selection, then refuses an unbound carrier and a foreign active owner", async () => {
    const root = await createTempRepo("arc-candidate-applicability-store-");
    roots.push(root);
    const initialized = await runArc(["init", "--yes", "--name", "example"], root);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await writeFile(join(root, "reviewed.txt"), "base\n", "utf8");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "install ARC"]);
    const localBase = await git(root, ["rev-parse", "main^{commit}"]);

    await git(root, ["switch", "-c", "feat/example"]);
    const { meta } = await seedWorkUnit(root, "example", { identity: "test-user", branch: "feat/example", bind: root,
      meta: { owner: "test-user", branch: "feat/example", workClass: "Light", priority: "P2", taskList: "tasks-example.md",
        lastCompleted: "verification", nextAction: "verification complete" },
      taskList: "# Task List: Example\n\n- [x] Verification complete\n" });
    await writeFile(join(root, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    await writeFile(join(root, "reviewed.txt"), "feature\n", "utf8");
    await git(root, ["add", "-A"]);
    await git(root, ["commit", "-m", "feature implementation"]);
    const attested = await runArc(["attest", "example", "--json"], root);
    expect(attested.exitCode, attested.stderr || attested.stdout).toBe(0);

    await git(root, ["switch", "main"]);
    await writeFile(join(root, "reviewed.txt"), "base moved\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "-m", "move base"]);
    const currentBase = await git(root, ["rev-parse", "HEAD^{commit}"]);
    await git(root, ["switch", "feat/example"]);
    await git(root, ["update-ref", "refs/remotes/origin/main", currentBase]);
    await git(root, ["branch", "-f", "main", localBase]);
    await expect(git(root, ["merge", "--no-ff", currentBase, "-m", "merge base"])).rejects.toThrow();
    await writeFile(join(root, "reviewed.txt"), "base moved and feature\n", "utf8");
    await git(root, ["add", "reviewed.txt"]);
    await git(root, ["commit", "--no-edit"]);

    const candidateReference = recordReferences["review/candidate"](meta.reference.owner);
    const readCandidate = async () => {
      const stored = await readStoreRecord(root, SlugSchema.parse("test-user"), candidateReference);
      return { version: stored.version, record: CandidateManagedRecordV1Schema.parse(JSON.parse(stored.content)) };
    };
    const versioned = await readCandidate();
    const baseline = reduceCandidateDurableBaseline(versioned.record);
    const currentTarget = await collectCandidateSubjectTarget({ cwd: root, name: "example", baseBranch: "main", exec: gitExec });
    const decision = await projectGitCandidateApplicability({
      request: { candidateId: baseline.candidateId, baselineTarget: baseline.target, currentTarget, currentBase },
      exec: createRawGitExec(root),
      observeEndpoints: async () => ({
        candidateHead: await git(root, ["rev-parse", "HEAD^{commit}"]),
        baseHead: await git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"]),
      }),
    });
    expect(decision.state).toBe("decision-required");
    if (decision.state !== "decision-required") throw new Error("expected a bounded applicability decision");
    const request = {
      schemaVersion: 1,
      expectedRecordVersion: versioned.version,
      candidateId: baseline.candidateId,
      priorTarget: baseline.target,
      currentTarget,
      currentBase,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
      selectedBy: "test-user",
      choice: "covered",
    };
    const resolve = (cwd: string, input: unknown) => runArcWithStdin(
      ["candidate", "applicability", "resolve", "example", "-"], cwd, `${JSON.stringify(input)}\n`);

    // A checkout on the work unit's branch that no marker binds has no work unit to select.
    const carrierParent = await mkdtemp(join(tmpdir(), "arc-candidate-carrier-"));
    const carrier = join(carrierParent, "carrier");
    await git(root, ["switch", "main"]);
    await git(root, ["worktree", "add", carrier, "feat/example"]);
    try {
      const refusedCarrier = await resolve(carrier, request);
      expect(refusedCarrier.exitCode).toBe(1);
      expect(JSON.parse(refusedCarrier.stdout)).toMatchObject({
        state: "execution-unavailable",
        nextAction: "stop",
        reason: "active-work-unit-unavailable",
      });
      expect((await readCandidate()).version).toBe(versioned.version);
    } finally {
      await git(root, ["worktree", "remove", "--force", carrier]).catch(() => undefined);
      await cleanupTempDir(carrierParent);
      await git(root, ["switch", "feat/example"]);
    }

    const first = await resolve(root, request);
    expect(first.exitCode, first.stderr || first.stdout).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ state: "resolved", nextAction: "continue" });
    expect(await git(root, ["status", "--porcelain"])).toBe("");

    const replay = await resolve(root, request);
    expect(replay.exitCode, replay.stderr || replay.stdout).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ state: "exact-replay", nextAction: "continue" });
    const selected = await readCandidate();
    expect(selected.record.transitions).toHaveLength(1);

    // The checkout's marker now binds another work unit, which cannot select for this one.
    await seedWorkUnit(root, "active-owner", { identity: "test-user", bind: root,
      meta: { owner: "test-user", workClass: "Light", priority: "P2" } });
    const foreign = await resolve(root, { ...request, expectedRecordVersion: selected.version, selectedBy: "another-reviewer" });
    expect(foreign.exitCode).toBe(1);
    expect(JSON.parse(foreign.stdout)).toMatchObject({
      state: "execution-unavailable",
      nextAction: "stop",
      reason: "active-work-unit-mismatch",
    });
    expect((await readCandidate()).version).toBe(selected.version);
  }, 60_000);
});
