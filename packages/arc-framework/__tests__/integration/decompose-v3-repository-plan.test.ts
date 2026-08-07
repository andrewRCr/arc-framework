import { execFile } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { createRawGitExec, type RawGitExec } from "../../src/lib/change-facts.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import {
  resolveConfiguredBaseDecompositionAnchor,
  resolveConfiguredBaseDecompositionAnchorByReceiptId,
} from "../../src/lib/work-unit/configured-base-decomposition-anchor.js";
import { discardGitV3DecomposeCandidate } from "../../src/lib/work-unit/git-decompose-v3-candidate-discard.js";
import { finalizeGitV3DecomposeOperation } from "../../src/lib/work-unit/git-decompose-v3-finalization.js";
import {
  advanceGitV3DecomposeBase,
  prepareGitV3DecomposeBaseAdvancement,
} from "../../src/lib/work-unit/git-decompose-v3-base-advancement.js";
import { createGitV3DecomposePreflight } from "../../src/lib/work-unit/git-decompose-v3-preflight.js";
import { v3DecomposeReceiptPath } from "../../src/lib/work-unit/decompose-v3-preparation.js";
import { classifyGitDecompositionPlanningLane } from "../../src/lib/work-unit/git-decomposition-planning-lane.js";
import {
  executeGitV3DecomposeCommand,
  executeGitV3DecomposeOperation,
} from "../../src/lib/work-unit/git-decompose-v3-operation.js";
import { composeGitV3RepositoryPlan } from "../../src/lib/work-unit/git-decompose-v3-repository-plan.js";
import {
  cleanupGitLandedDecompositionLocally,
} from "../../src/lib/work-unit/git-decomposition-local-cleanup.js";
import { createNodeTeardownSelectionReader } from "../../src/lib/work-unit/teardown-selection.js";
import { createNodeTeardownWorktreeTransactionDriver } from "../../src/lib/work-unit/teardown-worktree-transaction.js";
import { runRoadmapRegenerationAssert } from "../../src/scripts/assert-roadmap-regenerated.js";
import { runRoadmapConflictAutoRemedy } from "../../src/scripts/remedy-roadmap-conflict.js";
import { runCli } from "../helpers/run-cli.js";

const execFileAsync = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");
const roots: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}

function gitExec(): GitExec {
  return async (command, args, options) => {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return { stdout };
  };
}

async function readBlob(repo: string, ref: string, path: string): Promise<Uint8Array | null> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${ref}:${path}`], {
      cwd: repo,
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    });
    return new Uint8Array(stdout);
  } catch {
    return null;
  }
}

async function write(repo: string, path: string, content: string): Promise<void> {
  const target = join(repo, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function repositoryDependencies(repo: string) {
  const exec = gitExec();
  const cohortTemplate = await readFile("arc/reference/templates/arc/work-unit/template-cohort.md");
  return {
    cwd: repo,
    exec,
    readBlob: async (ref: string, path: string) => await readBlob(repo, ref, path),
    readObject: async (oid: string) => {
      const { stdout } = await execFileAsync("git", ["cat-file", "-p", oid], {
        cwd: repo,
        encoding: "buffer",
        maxBuffer: 20 * 1024 * 1024,
      });
      return new Uint8Array(stdout);
    },
    cohortTemplate,
  };
}

async function startedRepository() {
  const repo = await mkdtemp(join(tmpdir(), "arc-v3-repository-plan-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  await git(repo, ["commit", "--allow-empty", "-m", "seed"]);
  const draft = `# Draft: origin

- **Origin:** [internal]
- **Purpose:** Split the concern.

---

## Problem / Motivation

One concern.

## Alternatives

One alternative.

## Unknowns and Assumptions

One unknown.

## Scope Estimate

Medium.
`;
  const plannedMeta = renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  });
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap before\n");
  await write(
    repo,
    ".arc/system/arc-config.yml",
    "branch.base: main\nbranch.protection: full\npm.mode: arc-in-git\n",
  );
  await write(repo, ".arc/backlog/planned/origin/draft-origin.md", draft);
  await write(repo, ".arc/backlog/planned/origin/meta-origin.md", plannedMeta);
  await write(repo, ".arc/reference/shared.txt", "shared\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "base"]);
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  await git(repo, ["switch", "-c", "plan/origin"]);
  await mkdir(join(repo, ".arc/active"), { recursive: true });
  await git(repo, ["mv", ".arc/backlog/planned/origin/draft-origin.md", ".arc/active/draft-origin.md"]);
  await git(repo, ["mv", ".arc/backlog/planned/origin/meta-origin.md", ".arc/active/meta-origin.md"]);
  await rm(join(repo, ".arc/backlog/planned/origin"), { recursive: true, force: true });
  await write(repo, ".arc/active/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    branch: "plan/origin",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "start"]);
  const sourceHead = (await git(repo, ["rev-parse", "HEAD"])).trim();
  await git(repo, ["switch", "main"]);

  const remote = await mkdtemp(join(tmpdir(), "arc-v3-repository-plan-remote-"));
  roots.push(remote);
  await git(remote, ["init", "--bare"]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "origin", "main", "plan/origin"]);

  const dependencies = await repositoryDependencies(repo);
  const preflight = await createGitV3DecomposePreflight({
    cwd: repo,
    exec: dependencies.exec,
    readBlob: async (ref, path) => await readBlob(repo, ref, path),
  }, "main", "origin");
  if (preflight.status !== "ready") throw new Error(JSON.stringify(preflight));
  const machine = preflight.preflight.starterMap.machine;
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "heterogeneous" as const,
      placement: { kind: "direct-member" as const },
      destinations: [
        {
          kind: "existing-home" as const,
          destinationId: "existing",
          target: { kind: "document" as const, path: ".arc/reference/shared.txt" },
        },
        {
          kind: "new-member" as const,
          destinationId: "member",
          slug: "member",
          workClass: "Heavy" as const,
        },
      ],
      internalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned" as const,
        disposition: {
          kind: "target" as const,
          destinationId: "member",
          targetLocator: { ...unit.sourceLocator, artifact: "draft-member.md" },
        },
      })),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  return { repo, remote, baseHead, sourceHead, completedMap, dependencies };
}

async function finalizedCandidateRepository() {
  const started = await startedRepository();
  const prepared = await executeGitV3DecomposeOperation({
    ...started.dependencies,
    spawningIdentity: "andrew",
  }, {
    protection: "full",
    baseBranch: "main",
    completedMap: started.completedMap,
  });
  if (prepared.status !== "prepared"
    || prepared.operation.occupation.protection !== "full") {
    throw new Error(JSON.stringify(prepared));
  }
  const candidate = prepared.operation.occupation.path;
  roots.push(candidate);
  const receiptId = prepared.operation.preparation.receiptId;
  const continuationPath = join(started.repo, "continuation.json");
  await writeFile(
    continuationPath,
    `${canonicalize({ kind: "selected", slugs: ["member"] })}\n`,
  );
  const finalized = await finalizeGitV3DecomposeOperation({
    ...started.dependencies,
    cwd: candidate,
    readBlob: async (ref, path) => await readBlob(candidate, ref, path),
  }, {
    baseBranch: "main",
    origin: "origin",
    receiptId,
    continuationPath,
  });
  if (finalized.status !== "recorded") throw new Error(JSON.stringify(finalized));
  await git(candidate, ["commit", "-m", "finalize candidate"]);
  const candidateHead = (await git(started.repo, ["rev-parse", "chore/decompose-origin"])).trim();
  return { ...started, candidate, candidateHead, receiptId };
}

async function backlogStubRepository(options: { preserveParent?: boolean } = {}) {
  const repo = await mkdtemp(join(tmpdir(), "arc-v3-backlog-stub-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  const spec = `# Spec: origin

## Context

Split one configured-ref planning stub.

## Requirements

Preserve the single-spec profile.

## Verification

Prove the direct-base retirement.
`;
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap before\n");
  await write(repo, ".arc/backlog/planned/origin/spec-origin.md", spec);
  await write(repo, ".arc/backlog/planned/origin/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["spec-origin.md"],
    currentWorkflow: "generate-tasks",
    nextAction: "Begin generate-tasks",
  }));
  if (options.preserveParent) {
    await write(
      repo,
      ".arc/backlog/planned/origin/README.md",
      "# Preserved sibling\n",
    );
  }
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "base"]);
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();
  const dependencies = await repositoryDependencies(repo);
  const preflight = await createGitV3DecomposePreflight({
    cwd: repo,
    exec: dependencies.exec,
    readBlob: async (ref, path) => await readBlob(repo, ref, path),
  }, "main", "origin");
  if (preflight.status !== "ready") throw new Error(JSON.stringify(preflight));
  const machine = preflight.preflight.starterMap.machine;
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "symmetric" as const,
      placement: { kind: "cohort" as const, cohort: "delivery" },
      destinations: [
        {
          kind: "new-member" as const,
          destinationId: "alpha",
          slug: "alpha",
          workClass: "Heavy" as const,
        },
        {
          kind: "new-member" as const,
          destinationId: "beta",
          slug: "beta",
          workClass: "Light" as const,
        },
      ],
      internalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit, index) => {
        const destinationId = index % 2 === 0 ? "alpha" : "beta";
        return {
          sourceId: unit.sourceId,
          ownership: "destination-owned" as const,
          disposition: {
            kind: "target" as const,
            destinationId,
            targetLocator: {
              ...unit.sourceLocator,
              artifact: `spec-${destinationId}.md`,
            },
          },
        };
      }),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
  return {
    repo,
    baseHead,
    dependencies,
    completedMap,
    cutMapPath,
    preflight: preflight.preflight,
  };
}

async function claimFiles(repo: string): Promise<string[]> {
  try {
    return await readdir(join(repo, ".git", "arc", "transient-claims"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("Git v3 repository plan", () => {
  it("forwards byte input through the repository raw Git boundary", async () => {
    const { repo } = await startedRepository();
    const sentinel = "planning-lane raw input\n";
    const sentinelPath = ".arc/reference/planning-lane-raw-input.txt";
    await write(repo, sentinelPath, sentinel);
    const expectedObjectId = (await git(repo, ["hash-object", sentinelPath])).trim();

    const result = await createRawGitExec(repo)(["hash-object", "--stdin"], {
      input: new TextEncoder().encode(sentinel),
    });

    expect(new TextDecoder().decode(result.stdout).trim()).toBe(expectedObjectId);
  });

  it("classifies one finalized exact-ref receipt through the shipped command", async () => {
    const {
      repo,
      candidate,
      baseHead,
      candidateHead,
      receiptId,
      dependencies,
    } = await finalizedCandidateRepository();
    await write(repo, ".arc/reference/untracked-classification-noise.txt", "ignored\n");
    const observedRawExecCwds: Array<string | undefined> = [];
    const repositoryRawExec = createRawGitExec(repo);
    const rawExec: RawGitExec = async (args, options) => {
      observedRawExecCwds.push(options?.cwd);
      return await repositoryRawExec(args, options);
    };

    await expect(classifyGitDecompositionPlanningLane(baseHead, candidateHead, {
      cwd: repo,
      exec: dependencies.exec,
      rawExec,
      readBlob: dependencies.readObject,
    })).resolves.toEqual({ outcome: "planning" });
    expect(observedRawExecCwds.length).toBeGreaterThan(0);
    expect(observedRawExecCwds.every((cwd) => cwd === repo)).toBe(true);

    await expect(runCli([
      "review",
      "planning-lane",
      baseHead,
      candidateHead,
      "--repository",
      repo,
    ], { cwd: repo, timeout: 30_000 })).resolves.toMatchObject({
      exitCode: 0,
      stdout: "planning\n",
      stderr: "",
    });

    await write(candidate, v3DecomposeReceiptPath(receiptId), "{not-json\n");
    await git(candidate, ["add", v3DecomposeReceiptPath(receiptId)]);
    await git(candidate, ["commit", "-m", "corrupt receipt"]);
    const invalidHead = (await git(candidate, ["rev-parse", "HEAD"])).trim();
    const invalid = await runCli([
      "review",
      "planning-lane",
      baseHead,
      invalidHead,
      "--repository",
      repo,
    ], { cwd: repo, timeout: 30_000 });

    expect(invalid).toMatchObject({ exitCode: 1, stdout: "reviewed\n" });
    expect(invalid.stderr).toContain("invalid retirement evidence:");
  }, 30_000);

  it("binds a real started source and distinct base predecessor without mutating either checkout", async () => {
    const { repo, baseHead, sourceHead, completedMap, dependencies } = await startedRepository();
    const refsBefore = await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
    const statusBefore = await git(repo, ["status", "--porcelain=v1"]);

    const result = await composeGitV3RepositoryPlan(dependencies, "main", completedMap);

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.sourceHead).toBe(sourceHead);
    expect(result.plan.expectedBaseHead).toBe(baseHead);
    expect(result.plan.roadmap?.after).toMatchObject({ kind: "file" });
    expect(result.plan.allowedPaths).toContain(".arc/backlog/planned/origin/draft-origin.md");
    expect(result.plan.allowedPaths).toContain(".arc/active/draft-origin.md");
    expect(await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]))
      .toBe(refsBefore);
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe(statusBefore);
  });

  it("prepares the same immutable result through exact full and partial repository loci", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const full = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(full.status, JSON.stringify(full)).toBe("prepared");
    if (full.status !== "prepared") return;
    expect(full.operation.occupation).toMatchObject({
      protection: "full",
      candidateOwnership: {
        kind: "claimed",
        candidateBranch: "chore/decompose-origin",
      },
    });
    expect(full.durablePreparation.preparation).toEqual(full.operation.preparation);
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe("");

    const partial = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });
    expect(partial.status, JSON.stringify(partial)).toBe("prepared");
    if (partial.status !== "prepared") return;
    expect(partial.operation.occupation).toEqual({
      status: "occupied",
      protection: "partial",
      candidateOwnership: { kind: "not-applicable", protection: "partial" },
    });
    expect(partial.plan).toEqual(full.plan);
    expect(partial.operation.report).toEqual(full.operation.report);
    expect(partial.durablePreparation.preparation).toEqual(partial.operation.preparation);
    const appliedPaths = partial.operation.materialization.paths
      .filter(({ disposition }) => disposition === "applied")
      .map(({ path }) => path);
    expect(await git(repo, ["diff", "--cached", "--name-only", "--no-renames"]))
      .toBe(`${appliedPaths.join("\n")}\n`);
  });

  it("reports the exact discard command for a successfully prepared full candidate", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);

    const prepared = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(prepared, JSON.stringify(prepared)).toMatchObject({
      status: "prepared",
      discard: {
        kind: "discard-candidate",
        command: `arc decompose origin --discard ${cutMapPath}`,
      },
    });
  });

  it("refuses an unpublished source before claiming or materializing a candidate", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(repo, ["push", "--force", "origin", "main:plan/origin"]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "source-unpublished",
      locus: "plan/origin",
      recovery: { kind: "none" },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
  });

  it("refuses when the source remote cannot be read", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(repo, ["remote", "set-url", "origin", join(repo, "missing-remote.git")]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "source-unpublished",
      locus: "plan/origin",
      recovery: { kind: "none" },
    });
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("preserves unexpected Git adapter diagnostics in the refusal locus", async () => {
    const { completedMap, dependencies } = await startedRepository();
    const result = await composeGitV3RepositoryPlan({
      ...dependencies,
      exec: async (command, args, options) => {
        if (command === "git" && args[0] === "rev-parse" && args[1] === "--short") {
          throw new Error("synthetic Git read failure");
        }
        return await dependencies.exec(command, args, options);
      },
    }, "main", completedMap);

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "git",
        reason: "repository-plan-failed",
        locus: "synthetic Git read failure",
      },
    });
  });

  it("refuses moved source or base authority before claiming a candidate", async () => {
    for (const movedRef of ["plan/origin", "main"]) {
      const { repo, completedMap, dependencies } = await startedRepository();
      if (movedRef === "main") await git(repo, ["commit", "--allow-empty", "-m", "move base"]);
      else await git(repo, ["branch", "-f", movedRef, "main"]);
      const result = await executeGitV3DecomposeOperation({
        ...dependencies,
        spawningIdentity: "andrew",
      }, {
        protection: "full",
        baseBranch: "main",
        completedMap,
      });

      expect(result).toMatchObject({
        status: "refused",
        stage: "repository-plan",
        recovery: { kind: "none" },
      });
      expect(await claimFiles(repo)).toEqual([]);
      expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    }
  });

  it("preserves the Git preflight refusal code at the command boundary", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(repo, ["branch", "-m", "missing-main"]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "git-preflight:missing-base",
      remedy: "Re-preflight: arc decompose origin --preflight",
    });
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("preserves a foreign deterministic candidate branch without acquiring a claim", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    await git(repo, ["branch", "chore/decompose-origin", "main"]);
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "branch-exists-unregistered",
      recovery: { kind: "none" },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect((await git(repo, ["rev-parse", "chore/decompose-origin"])).trim())
      .toBe((await git(repo, ["rev-parse", "main"])).trim());
  });

  it("reports only exact candidate recovery when source authority moves after occupation", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    let moved = false;
    const driftingExec: GitExec = async (command, args, options) => {
      const result = await dependencies.exec(command, args, options);
      if (!moved && args[0] === "worktree" && args[1] === "add") {
        moved = true;
        await git(repo, ["branch", "-f", "plan/origin", "main"]);
      }
      return result;
    };
    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      exec: driftingExec,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(moved).toBe(true);
    expect(result).toMatchObject({
      status: "refused",
      stage: "post-occupation-revalidation",
      recovery: {
        kind: "full-candidate",
        candidateOwnership: {
          kind: "claimed",
          generation: 1,
          candidateBranch: "chore/decompose-origin",
        },
        retry: { kind: "retry" },
        discard: { kind: "discard", origin: "origin" },
      },
    });
    expect(result).toMatchObject({
      remedy: `Retry: arc decompose origin --execute ${cutMapPath}\n`
        + `Discard: arc decompose origin --discard ${cutMapPath}`,
    });
    expect(await claimFiles(repo)).toHaveLength(1);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"]))
      .toContain("chore/decompose-origin");
  });

  it("refuses an untracked partial destination without staging or replacing it", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const collisionPath = ".arc/backlog/planned/member/draft-member.md";
    await write(repo, collisionPath, "foreign bytes\n");
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "partial-projection-dirty",
      recovery: { kind: "none" },
    });
    expect(await readFile(join(repo, collisionPath), "utf8")).toBe("foreign bytes\n");
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("refuses partial materialization from a same-head non-base branch", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    await git(repo, ["switch", "-c", "alias"]);
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "base-moved",
      recovery: { kind: "none" },
    });
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("revalidates partial projection drift after occupation and before materialization", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    let occupationSeen = false;
    let injected = false;
    const driftingExec: GitExec = async (command, args, options) => {
      const result = await dependencies.exec(command, args, options);
      if (args[0] === "diff" && args.includes("--cached") && args.includes("--no-renames")) {
        occupationSeen = true;
      } else if (occupationSeen && !injected && args[0] === "ls-tree" && args.includes("--full-tree")) {
        injected = true;
        await write(repo, ".arc/reference/foreign.txt", "foreign staged bytes\n");
        await git(repo, ["add", ".arc/reference/foreign.txt"]);
      }
      return result;
    };
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      exec: driftingExec,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(injected).toBe(true);
    expect(result).toEqual({
      status: "refused",
      stage: "post-occupation-revalidation",
      reason: "partial-projection-drift",
      recovery: { kind: "none" },
    });
    expect(await git(repo, ["diff", "--cached", "--name-only"]))
      .toBe(".arc/reference/foreign.txt\n");
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("discards only the exact prepared candidate and releases its terminal generation", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    const prepared = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(prepared.status, JSON.stringify(prepared)).toBe("prepared");

    const discarded = await discardGitV3DecomposeCandidate(
      dependencies,
      "main",
      "origin",
      cutMapPath,
    );

    expect(discarded, JSON.stringify(discarded)).toMatchObject({
      status: "discarded",
      generation: 1,
      candidateBranch: "chore/decompose-origin",
    });
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"]))
      .not.toContain("branch refs/heads/chore/decompose-origin");
    const [claimName] = await claimFiles(repo);
    expect(claimName).toBeDefined();
    expect(JSON.parse(await readFile(
      join(repo, ".git", "arc", "transient-claims", claimName!),
      "utf8",
    ))).toMatchObject({
      generation: 1,
      state: { kind: "terminal", terminal: { kind: "discarded" } },
      registration: { kind: "released" },
    });
  });

  it("finalizes a prepared candidate through pinned topology and project projection", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const prepared = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(prepared.status, JSON.stringify(prepared)).toBe("prepared");
    if (prepared.status !== "prepared"
      || prepared.operation.occupation.protection !== "full") return;
    const candidate = prepared.operation.occupation.path;
    const continuationPath = join(repo, "continuation.json");
    await writeFile(
      continuationPath,
      `${canonicalize({ kind: "selected", slugs: ["member"] })}\n`,
    );

    const finalized = await finalizeGitV3DecomposeOperation({
      ...dependencies,
      cwd: candidate,
      readBlob: async (ref, path) => await readBlob(candidate, ref, path),
    }, {
      baseBranch: "main",
      origin: "origin",
      receiptId: prepared.operation.preparation.receiptId,
      continuationPath,
    });

    expect(finalized, JSON.stringify(finalized)).toMatchObject({
      status: "recorded",
      receipt: {
        receiptId: prepared.operation.preparation.receiptId,
        finalized: {
          publication: {
            initialContinuation: { kind: "selected", slugs: ["member"] },
          },
        },
      },
    });
  });

  it("retains completed local cleanup outcomes when post-mutation evidence fails", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const prepared = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(prepared.status, JSON.stringify(prepared)).toBe("prepared");
    if (prepared.status !== "prepared"
      || prepared.operation.occupation.protection !== "full") return;
    const candidate = prepared.operation.occupation.path;
    const continuationPath = join(repo, "continuation.json");
    await writeFile(
      continuationPath,
      `${canonicalize({ kind: "selected", slugs: ["member"] })}\n`,
    );
    const finalized = await finalizeGitV3DecomposeOperation({
      ...dependencies,
      cwd: candidate,
      readBlob: async (ref, path) => await readBlob(candidate, ref, path),
    }, {
      baseBranch: "main",
      origin: "origin",
      receiptId: prepared.operation.preparation.receiptId,
      continuationPath,
    });
    expect(finalized.status, JSON.stringify(finalized)).toBe("recorded");
    await git(candidate, ["commit", "-m", "finalize candidate"]);
    await git(repo, ["merge", "--no-ff", "chore/decompose-origin", "-m", "land candidate"]);
    const exec: GitExec = async (command, args, options) =>
      await dependencies.exec(command, args, { ...options, cwd: options?.cwd ?? repo });
    const landed = await resolveConfiguredBaseDecompositionAnchor("main", "origin", {
      exec,
      readBlob: dependencies.readObject,
    });
    expect(landed.status, JSON.stringify(landed)).toBe("resolved");

    let scanCount = 0;
    const result = await cleanupGitLandedDecompositionLocally("main", "origin", {
      cwd: repo,
      exec,
      readBlob: dependencies.readObject,
      closeUserWorkspace: async () => undefined,
      scanWorktrees: async () => {
        scanCount += 1;
        if (scanCount === 1) return await scanRegisteredWorktrees(exec);
        throw new Error("post-mutation worktree scan failed");
      },
    });

    expect(result).toEqual({
      status: "refused",
      reason: "post-mutation worktree scan failed",
      progress: {
        candidate: {
          branch: "chore/decompose-origin",
          branchOutcome: "deleted",
          worktreeOutcome: "removed",
        },
        source: {
          branch: "plan/origin",
          branchOutcome: "deleted",
          worktreeOutcome: "already-absent",
        },
        userWorkspace: "closed",
      },
    });
  });

  it("advances, validates, lands, resolves, and reclaims one real committed candidate", async () => {
    const {
      repo,
      dependencies,
      candidate,
      candidateHead: originalCandidateHead,
      receiptId,
    } = await finalizedCandidateRepository();

    expect(await prepareGitV3DecomposeBaseAdvancement(dependencies, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      receiptId,
    })).toEqual({
      status: "unchanged",
      receiptId,
      currentBaseHead: expect.any(String),
      candidateHead: originalCandidateHead,
    });

    await write(repo, ".arc/backlog/planned/observer/meta-observer.md", renderMetaFile("observer", {
      state: "Planning",
      owner: "andrew",
      workClass: "Light",
      priority: "P3",
      origin: "internal",
      design: ["draft-observer.md"],
      currentWorkflow: "draft-design",
      nextAction: "Begin draft-design",
    }));
    await write(repo, ".arc/backlog/planned/observer/draft-observer.md", "# Draft: observer\n");
    await git(repo, ["add", ".arc/backlog/planned/observer"]);
    await git(repo, ["commit", "-m", "advance base"]);
    const advancedBaseHead = (await git(repo, ["rev-parse", "main"])).trim();
    const advanced = await advanceGitV3DecomposeBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      receiptId,
    });
    expect(advanced, JSON.stringify(advanced)).toEqual({
      status: "advanced",
      receiptId,
      previousBaseHead: expect.any(String),
      currentBaseHead: advancedBaseHead,
      candidateHead: originalCandidateHead,
    });
    expect((await git(candidate, ["rev-parse", "MERGE_HEAD"])).trim()).toBe(advancedBaseHead);

    await write(repo, ".arc/reference/during-commit-window.txt", "later base movement\n");
    await git(repo, ["add", ".arc/reference/during-commit-window.txt"]);
    await git(repo, ["commit", "-m", "move base during candidate commit window"]);
    const movedAgainBaseHead = (await git(repo, ["rev-parse", "main"])).trim();

    const remedy = await runRoadmapConflictAutoRemedy(candidate);
    expect(remedy).toEqual({
      exitCode: 0,
      stdout: "Auto-remedied ROADMAP-only conflict: regenerated and restaged .arc/backlog/ROADMAP.md\n",
      stderr: "",
    });
    expect(await runRoadmapRegenerationAssert({
      cwd: candidate,
      exec: async (command, args, options) => await dependencies.exec(command, args, {
        ...options,
        cwd: options?.cwd ?? candidate,
      }),
      baseBranch: "main",
    })).toEqual({ exitCode: 0, stdout: "", stderr: "" });

    const packageRoot = resolve(import.meta.dirname, "../..");
    await expect(execFileAsync(
      process.execPath,
      ["--import", tsxLoader, join(packageRoot, "src", "scripts", "validate-decompose-record.ts")],
      { cwd: candidate, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    )).resolves.toMatchObject({ stderr: "" });

    await git(candidate, ["commit", "-m", "advance candidate base"]);
    const firstAdvancedCandidateHead = (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim();
    const advancedAgain = await advanceGitV3DecomposeBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      receiptId,
    });
    expect(advancedAgain, JSON.stringify(advancedAgain)).toEqual({
      status: "advanced",
      receiptId,
      previousBaseHead: advancedBaseHead,
      currentBaseHead: movedAgainBaseHead,
      candidateHead: firstAdvancedCandidateHead,
    });
    expect((await git(candidate, ["rev-parse", "MERGE_HEAD"])).trim()).toBe(movedAgainBaseHead);
    expect(await runRoadmapRegenerationAssert({
      cwd: candidate,
      exec: async (command, args, options) => await dependencies.exec(command, args, {
        ...options,
        cwd: options?.cwd ?? candidate,
      }),
      baseBranch: "main",
    })).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    await expect(execFileAsync(
      process.execPath,
      ["--import", tsxLoader, join(packageRoot, "src", "scripts", "validate-decompose-record.ts")],
      { cwd: candidate, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    )).resolves.toMatchObject({ stderr: "" });
    await git(candidate, ["commit", "-m", "advance candidate base again"]);
    const advancedCandidateHead = (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim();
    expect(advancedCandidateHead).not.toBe(originalCandidateHead);
    await git(repo, ["merge", "--ff-only", "chore/decompose-origin"]);
    await write(repo, ".arc/reference/post-landing.txt", "later base work\n");
    await git(repo, ["add", ".arc/reference/post-landing.txt"]);
    await git(repo, ["commit", "-m", "continue after landing"]);
    const liveBaseHead = (await git(repo, ["rev-parse", "main"])).trim();
    const exec: GitExec = async (command, args, options) =>
      await dependencies.exec(command, args, { ...options, cwd: options?.cwd ?? repo });

    const landed = await resolveConfiguredBaseDecompositionAnchor("main", "origin", {
      exec,
      readBlob: dependencies.readObject,
    });
    expect(landed, JSON.stringify(landed)).toMatchObject({
      status: "resolved",
      anchor: {
        receiptId,
        candidateCommitHead: advancedCandidateHead,
        currentBaseHead: liveBaseHead,
        landedCommitHead: advancedCandidateHead,
        landing: { kind: "fast-forward" },
      },
    });
    expect(await resolveConfiguredBaseDecompositionAnchorByReceiptId("main", receiptId, {
      exec,
      readBlob: dependencies.readObject,
    })).toMatchObject({ status: "resolved", anchor: { receiptId, currentBaseHead: liveBaseHead } });

    const sourceWorktree = `${repo}-origin-source`;
    roots.push(sourceWorktree);
    await git(repo, ["worktree", "add", sourceWorktree, "plan/origin"]);
    await writeWorktreeOwnershipMarker(sourceWorktree, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "origin" },
      spawningIdentity: "andrew",
      now: Date.parse("2026-07-21T00:00:00.000Z"),
    });
    const cleaned = await cleanupGitLandedDecompositionLocally("main", "origin", {
      cwd: repo,
      exec,
      readBlob: dependencies.readObject,
      closeUserWorkspace: async () => undefined,
      readTeardownSelection: createNodeTeardownSelectionReader({ exec, identity: "andrew" }),
      teardownWorktree: createNodeTeardownWorktreeTransactionDriver({ exec, identity: "andrew" }),
    });
    expect(cleaned, JSON.stringify(cleaned)).toMatchObject({
      status: "cleaned",
      retirement: "retired",
      registration: "released",
      candidate: { branchOutcome: "deleted", worktreeOutcome: "removed" },
      source: { branchOutcome: "deleted", worktreeOutcome: "removed" },
    });
    await expect(lstat(sourceWorktree)).rejects.toMatchObject({ code: "ENOENT" });
    const [claimName] = await claimFiles(repo);
    expect(claimName).toBeDefined();
    expect(JSON.parse(await readFile(
      join(repo, ".git", "arc", "transient-claims", claimName!),
      "utf8",
    ))).toMatchObject({
      state: { kind: "terminal", terminal: { kind: "landed", receiptId } },
      registration: { kind: "released" },
    });
  }, 20_000);

  it.each([
    "regressed base",
    "divergent base",
    "path conflict",
    "mode conflict",
    "type conflict",
    "dependency conflict",
  ] as const)("refuses a real %s without changing the committed candidate", async (variant) => {
    const { repo, baseHead, dependencies, candidate, candidateHead, receiptId } =
      await finalizedCandidateRepository();
    if (variant === "regressed base" || variant === "divergent base") {
      await git(repo, ["reset", "--hard", `${baseHead}^`]);
      if (variant === "divergent base") {
        await write(repo, ".arc/reference/divergent.txt", "divergent base\n");
        await git(repo, ["add", ".arc/reference/divergent.txt"]);
        await git(repo, ["commit", "-m", "diverge base"]);
      }
    } else if (variant === "path conflict" || variant === "mode conflict") {
      const path = ".arc/backlog/planned/member/meta-member.md";
      await write(repo, path, "foreign member\n");
      await git(repo, ["add", path]);
      if (variant === "mode conflict") await git(repo, ["update-index", "--chmod=+x", path]);
      await git(repo, ["commit", "-m", variant]);
    } else if (variant === "type conflict") {
      await write(
        repo,
        ".arc/backlog/planned/member/meta-member.md/child.txt",
        "tree collision\n",
      );
      await git(repo, ["add", ".arc/backlog/planned/member"]);
      await git(repo, ["commit", "-m", variant]);
    } else {
      await write(repo, ".arc/backlog/planned/dependent/meta-dependent.md", renderMetaFile("dependent", {
        state: "Planning",
        owner: "andrew",
        workClass: "Light",
        priority: "P2",
        origin: "internal",
        design: ["draft-dependent.md"],
        dependsOn: ["origin"],
        currentWorkflow: "draft-design",
        nextAction: "Begin draft-design",
      }));
      await write(repo, ".arc/backlog/planned/dependent/draft-dependent.md", "# Draft: dependent\n");
      await git(repo, ["add", ".arc/backlog/planned/dependent"]);
      await git(repo, ["commit", "-m", variant]);
    }
    const before = {
      head: (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim(),
      status: await git(candidate, ["status", "--porcelain=v1", "--untracked-files=all"]),
      claim: await readFile(join(repo, ".git", "arc", "transient-claims", (await claimFiles(repo))[0]!), "utf8"),
    };

    const result = await advanceGitV3DecomposeBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      receiptId,
    });

    expect(result, JSON.stringify(result)).toMatchObject({ status: "refused" });
    expect(result.status === "refused" ? result.reason : "").toMatch(
      /^(?:landing-validation-refused|canonical-validation-refused)$/u,
    );
    expect({
      head: (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim(),
      status: await git(candidate, ["status", "--porcelain=v1", "--untracked-files=all"]),
      claim: await readFile(join(repo, ".git", "arc", "transient-claims", (await claimFiles(repo))[0]!), "utf8"),
    }).toEqual({ ...before, head: candidateHead });
  });

  it.each(["base", "candidate"] as const)(
    "refuses real mid-operation %s movement before starting the merge",
    async (movedRef) => {
      const { repo, dependencies, candidate, candidateHead, receiptId } =
        await finalizedCandidateRepository();
      await write(repo, ".arc/reference/base-before-race.txt", "base before race\n");
      await git(repo, ["add", ".arc/reference/base-before-race.txt"]);
      await git(repo, ["commit", "-m", "advance base before race"]);
      let reads = 0;
      let injectedHead: string | undefined;
      const target = movedRef === "base" ? "main^{commit}" : "chore/decompose-origin^{commit}";
      const racingExec: GitExec = async (command, args, options) => {
        if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === target) {
          reads += 1;
          if (reads === 3) {
            if (movedRef === "base") {
              await write(repo, ".arc/reference/base-race.txt", "base race\n");
              await git(repo, ["add", ".arc/reference/base-race.txt"]);
              await git(repo, ["commit", "-m", "move base during advancement"]);
              injectedHead = (await git(repo, ["rev-parse", "main"])).trim();
            } else {
              await git(candidate, ["commit", "--allow-empty", "-m", "move candidate during advancement"]);
              injectedHead = (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim();
            }
          }
        }
        return await dependencies.exec(command, args, options);
      };

      const result = await advanceGitV3DecomposeBase({ ...dependencies, exec: racingExec }, {
        protection: "full",
        baseBranch: "main",
        origin: "origin",
        receiptId,
      });

      expect(reads).toBeGreaterThanOrEqual(3);
      expect(result).toMatchObject({
        status: "refused",
        reason: "binding-unavailable",
        mismatch: { kind: "base", locus: "binding-unavailable" },
        recovery: {
          action: "advance-base",
          establishedFacts: {
            provenance: "advance-base-command",
            origin: "origin",
            receiptId,
          },
        },
      });
      await expect(execFileAsync("git", ["rev-parse", "--verify", "MERGE_HEAD"], {
        cwd: candidate,
        encoding: "utf8",
      })).rejects.toThrow();
      expect(await git(candidate, ["status", "--porcelain=v1", "--untracked-files=all"])).toBe("");
      expect((await git(repo, ["rev-parse", "chore/decompose-origin"])).trim()).toBe(
        movedRef === "candidate" ? injectedHead : candidateHead,
      );
    },
  );

  it("refuses a candidate worktree branch switch before starting the merge", async () => {
    const { repo, dependencies, candidate, candidateHead, receiptId } =
      await finalizedCandidateRepository();
    await write(repo, ".arc/reference/base-before-worktree-race.txt", "base before race\n");
    await git(repo, ["add", ".arc/reference/base-before-worktree-race.txt"]);
    await git(repo, ["commit", "-m", "advance base before worktree race"]);
    const alternateBranch = "chore/decompose-alternate";
    await git(repo, ["branch", alternateBranch, candidateHead]);
    let candidateReads = 0;
    const racingExec: GitExec = async (command, args, options) => {
      if (args[0] === "rev-parse" && args[1] === "--verify"
        && args[2] === "chore/decompose-origin^{commit}") {
        candidateReads += 1;
        if (candidateReads === 3) await git(candidate, ["switch", alternateBranch]);
      }
      return await dependencies.exec(command, args, options);
    };

    const result = await advanceGitV3DecomposeBase({ ...dependencies, exec: racingExec }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      receiptId,
    });

    expect(candidateReads).toBeGreaterThanOrEqual(3);
    expect(result).toMatchObject({
      status: "refused",
      reason: "binding-unavailable",
      recovery: { action: "advance-base" },
    });
    expect((await git(candidate, ["symbolic-ref", "--short", "HEAD"])).trim()).toBe(alternateBranch);
    await expect(execFileAsync("git", ["rev-parse", "--verify", "MERGE_HEAD"], {
      cwd: candidate,
      encoding: "utf8",
    })).rejects.toThrow();
    expect(await git(candidate, ["status", "--porcelain=v1", "--untracked-files=all"])).toBe("");
    expect((await git(repo, ["rev-parse", "chore/decompose-origin"])).trim()).toBe(candidateHead);
    expect((await git(repo, ["rev-parse", alternateBranch])).trim()).toBe(candidateHead);
    // Spawns several git worktrees and takes ~4s of the suite default's 5s, so any
    // load on the host tips it over — observed failing on a shared CI runner while
    // green in isolation. Sized for margin, still short enough to catch a hang.
  }, 15_000);

  it("refuses a committed configured-ref source before changing its candidate", async () => {
    const { repo, dependencies, completedMap } = await backlogStubRepository();
    const prepared = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(prepared.status, JSON.stringify(prepared)).toBe("prepared");
    if (prepared.status !== "prepared"
      || prepared.operation.occupation.protection !== "full") return;
    const candidate = prepared.operation.occupation.path;
    roots.push(candidate);
    const cohortPath = join(
      candidate,
      ".arc",
      "backlog",
      "planned",
      "delivery",
      "cohort-delivery.md",
    );
    await writeFile(
      cohortPath,
      (await readFile(cohortPath, "utf8")).replace(
        "**Purpose:** —",
        "**Purpose:** Coordinate the configured-ref results.",
      ),
    );
    await git(candidate, ["add", ".arc/backlog/planned/delivery/cohort-delivery.md"]);
    const continuationPath = join(repo, "backlog-continuation.json");
    await writeFile(continuationPath, `${canonicalize({ kind: "selected", slugs: ["alpha"] })}\n`);
    const receiptId = prepared.operation.preparation.receiptId;
    const finalized = await finalizeGitV3DecomposeOperation({
      ...dependencies,
      cwd: candidate,
      readBlob: async (ref, path) => await readBlob(candidate, ref, path),
    }, {
      baseBranch: "main",
      origin: "origin",
      receiptId,
      continuationPath,
    });
    expect(finalized.status, JSON.stringify(finalized)).toBe("recorded");
    await git(candidate, ["commit", "-m", "finalize configured-ref candidate"]);
    const before = {
      head: (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim(),
      status: await git(candidate, ["status", "--porcelain=v1", "--untracked-files=all"]),
    };
    await write(repo, ".arc/reference/base-after-backlog.txt", "advance base\n");
    await git(repo, ["add", ".arc/reference/base-after-backlog.txt"]);
    await git(repo, ["commit", "-m", "advance configured base"]);

    expect(await advanceGitV3DecomposeBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      receiptId,
    })).toMatchObject({ status: "refused", reason: "source-ref-is-result-base" });
    expect({
      head: (await git(repo, ["rev-parse", "chore/decompose-origin"])).trim(),
      status: await git(candidate, ["status", "--porcelain=v1", "--untracked-files=all"]),
    }).toEqual(before);
  });

  it.each(["one-parent", "advanced-merge"] as const)(
    "resolves a descendant-base merge landing for a %s candidate",
    async (shape) => {
      const { repo, dependencies, candidate, receiptId } = await finalizedCandidateRepository();
      await write(repo, ".arc/reference/descendant-base.txt", "descendant base\n");
      await git(repo, ["add", ".arc/reference/descendant-base.txt"]);
      await git(repo, ["commit", "-m", "descend base"]);
      if (shape === "advanced-merge") {
        const advanced = await advanceGitV3DecomposeBase(dependencies, {
          protection: "full",
          baseBranch: "main",
          origin: "origin",
          receiptId,
        });
        expect(advanced.status, JSON.stringify(advanced)).toBe("advanced");
        await git(candidate, ["commit", "-m", "advance candidate"]);
      }
      await write(repo, `.arc/reference/${shape}-landing-side.txt`, "landing side\n");
      await git(repo, ["add", `.arc/reference/${shape}-landing-side.txt`]);
      await git(repo, ["commit", "-m", "move landing side"]);
      await git(repo, ["merge", "--no-ff", "chore/decompose-origin", "-m", "merge candidate"]);
      const exec: GitExec = async (command, args, options) =>
        await dependencies.exec(command, args, { ...options, cwd: options?.cwd ?? repo });

      expect(await resolveConfiguredBaseDecompositionAnchor("main", "origin", {
        exec,
        readBlob: dependencies.readObject,
      })).toMatchObject({
        status: "resolved",
        anchor: { receiptId, landing: { kind: "merge" } },
      });
    },
    20_000,
  );

  it("retires and prunes one configured-ref backlog stub on the partial base", async () => {
    const {
      repo,
      baseHead,
      dependencies,
      cutMapPath,
      preflight,
    } = await backlogStubRepository();
    expect(preflight.starterMap.machine).toMatchObject({
      source: {
        kind: "backlog-stub",
        logicalBranch: "main",
        ref: "refs/heads/main",
        head: baseHead,
      },
      planningProfile: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
    });
    const refsBefore = await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
    const worktreesBefore = await git(repo, ["worktree", "list", "--porcelain"]);

    const prepared = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(prepared, JSON.stringify(prepared)).toMatchObject({
      status: "prepared",
      discard: { kind: "not-applicable", protection: "partial" },
      operation: {
        occupation: {
          status: "occupied",
          protection: "partial",
          candidateOwnership: { kind: "not-applicable", protection: "partial" },
        },
        preparation: {
          facts: {
            candidateOwnership: { kind: "not-applicable", protection: "partial" },
          },
        },
      },
    });
    if (prepared.status !== "prepared") return;
    expect(await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]))
      .toBe(refsBefore);
    expect(await git(repo, ["worktree", "list", "--porcelain"])).toBe(worktreesBefore);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    expect(await claimFiles(repo)).toEqual([]);
    expect(await pathExists(join(repo, ".arc", "backlog", "planned", "origin"))).toBe(false);
    expect(await git(repo, ["diff", "--cached", "--name-status", "--no-renames"]))
      .toContain("D\t.arc/backlog/planned/origin/meta-origin.md");
    expect(await git(repo, ["diff", "--cached", "--name-status", "--no-renames"]))
      .toContain("D\t.arc/backlog/planned/origin/spec-origin.md");

    for (const slug of ["alpha", "beta"]) {
      const memberDir = join(repo, ".arc", "backlog", "planned", "delivery", slug);
      const meta = await readFile(join(memberDir, `meta-${slug}.md`), "utf8");
      expect(meta).toContain("- **Cohort:** `delivery`");
      expect(meta).toContain(`- **Design:** \`spec-${slug}.md\``);
      expect(meta).toContain("- **Task List:** [none]");
      expect(meta).toContain("- **Current Workflow:** `generate-tasks`");
      expect(await pathExists(join(memberDir, `spec-${slug}.md`))).toBe(true);
      expect(await pathExists(join(memberDir, `draft-${slug}.md`))).toBe(false);
      expect(await pathExists(join(memberDir, `spec-${slug}-prd.md`))).toBe(false);
      expect(await pathExists(join(memberDir, `spec-${slug}-rfc.md`))).toBe(false);
    }

    const cohortPath = join(
      repo,
      ".arc",
      "backlog",
      "planned",
      "delivery",
      "cohort-delivery.md",
    );
    const cohort = await readFile(cohortPath, "utf8");
    const authoredCohort = cohort.replace(
      "**Purpose:** —",
      "**Purpose:** Coordinate the configured-ref retirement results.",
    );
    expect(authoredCohort).not.toBe(cohort);
    await writeFile(cohortPath, authoredCohort);
    await git(repo, ["add", "--", ".arc/backlog/planned/delivery/cohort-delivery.md"]);
    await writeFile(
      prepared.next.continuationPath,
      `${canonicalize({ kind: "selected", slugs: ["alpha"] })}\n`,
    );
    const finalized = await finalizeGitV3DecomposeOperation(dependencies, {
      baseBranch: "main",
      origin: "origin",
      receiptId: prepared.operation.preparation.receiptId,
      continuationPath: prepared.next.continuationPath,
    });
    expect(finalized, JSON.stringify(finalized)).toMatchObject({
      status: "recorded",
      receipt: {
        prepared: {
          completedMap: {
            machine: {
              source: { kind: "backlog-stub", ref: "refs/heads/main" },
              planningProfile: { kind: "single-spec" },
            },
          },
          candidateOwnership: { kind: "not-applicable", protection: "partial" },
        },
        finalized: {
          publication: {
            logicalAnchor: { kind: "cohort", cohort: "delivery" },
            entries: [
              { kind: "new-leaf", slug: "alpha" },
              { kind: "new-leaf", slug: "beta" },
            ],
            initialContinuation: { kind: "selected", slugs: ["alpha"] },
          },
        },
      },
    });

    await git(repo, ["commit", "-m", "land configured-ref retirement"]);
    const landedHead = (await git(repo, ["rev-parse", "main"])).trim();
    const anchor = await resolveConfiguredBaseDecompositionAnchor("main", "origin", {
      exec: async (command, args, options) => await dependencies.exec(command, args, {
        ...options,
        cwd: options?.cwd ?? repo,
      }),
      readBlob: dependencies.readObject,
    });
    expect(anchor, JSON.stringify(anchor)).toMatchObject({
      status: "resolved",
      anchor: {
        currentBaseHead: landedHead,
        candidateCommitHead: landedHead,
        claimRetirement: { kind: "not-applicable", protection: "partial" },
      },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    const worktreesAfter = await git(repo, ["worktree", "list", "--porcelain"]);
    expect(worktreesAfter.match(/^worktree /gmu)).toHaveLength(1);
    expect(worktreesAfter).toContain(`worktree ${repo}`);
    expect(worktreesAfter).toContain("branch refs/heads/main");
  });

  it("preserves a nonempty configured-ref backlog-stub parent", async () => {
    const { repo, dependencies, cutMapPath } = await backlogStubRepository({
      preserveParent: true,
    });
    const sourceDir = join(repo, ".arc", "backlog", "planned", "origin");
    const worktreesBefore = await git(repo, ["worktree", "list", "--porcelain"]);

    const prepared = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(prepared.status, JSON.stringify(prepared)).toBe("prepared");
    expect(await pathExists(join(sourceDir, "meta-origin.md"))).toBe(false);
    expect(await pathExists(join(sourceDir, "spec-origin.md"))).toBe(false);
    expect(await readFile(join(sourceDir, "README.md"), "utf8"))
      .toBe("# Preserved sibling\n");
    expect(await pathExists(sourceDir)).toBe(true);
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"])).toBe(worktreesBefore);
  });
});
