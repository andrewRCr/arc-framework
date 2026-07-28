import { execFile } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  resolveConfiguredBaseDecompositionAnchor,
} from "../../src/lib/work-unit/configured-base-decomposition-anchor.js";
import { discardGitV3DecomposeCandidate } from "../../src/lib/work-unit/git-decompose-v3-candidate-discard.js";
import { finalizeGitV3DecomposeOperation } from "../../src/lib/work-unit/git-decompose-v3-finalization.js";
import { createGitV3DecomposePreflight } from "../../src/lib/work-unit/git-decompose-v3-preflight.js";
import {
  executeGitV3DecomposeCommand,
  executeGitV3DecomposeOperation,
} from "../../src/lib/work-unit/git-decompose-v3-operation.js";
import { composeGitV3RepositoryPlan } from "../../src/lib/work-unit/git-decompose-v3-repository-plan.js";

const execFileAsync = promisify(execFile);
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
  return { repo, baseHead, sourceHead, completedMap, dependencies };
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
