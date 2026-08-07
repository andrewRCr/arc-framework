import { execFile } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import { createRawGitExec } from "../../src/lib/change-facts.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createGitV3DecomposePreflight } from "../../src/lib/work-unit/git-decompose-v3-preflight.js";
import {
  executeGitV3DecomposeCommand,
  executeGitV3DecomposeOperation,
} from "../../src/lib/work-unit/git-decompose-v3-operation.js";
import { resolveTransitionRecordRelativePath } from "../../src/lib/work-unit/transition-record-store.js";
import { composeGitV3RepositoryPlan } from "../../src/lib/work-unit/git-decompose-v3-repository-plan.js";
import { runCli } from "../helpers/run-cli.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { CLASSIFY_SCRIPT, runScript } from "../helpers/run-script.js";

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

async function genericPlanningLaneRepository() {
  const repo = await mkdtemp(join(tmpdir(), "arc-generic-planning-lane-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  await git(repo, ["commit", "--allow-empty", "-m", "base"]);
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  await write(repo, ".arc/active/spec-origin.md", "# Spec: origin\n");
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap\n");
  await write(repo, ".arc/system/.internal/transitions/origin.json", "{}\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "add planning transition"]);
  const planningHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  return { repo, baseHead, planningHead };
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

  it("keeps local and hosted exact-ref verdicts aligned for generic transition records", async () => {
    const { repo, baseHead, planningHead } = await genericPlanningLaneRepository();
    const runHosted = async (head: string) => await runCli([
      "review",
      "planning-lane",
      baseHead,
      head,
      "--repository",
      repo,
    ], { cwd: repo, timeout: 30_000 });
    const runLocal = async (head: string) => await runScript(CLASSIFY_SCRIPT, [
      "planning-lane",
      baseHead,
      head,
    ], {
      cwd: repo,
      env: { ARC_PLANNING_CLI: CLI_PATH, CLASSIFY_REPOSITORY_DIR: repo },
      timeout: 30_000,
    });

    await expect(runHosted(planningHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "planning\n",
      stderr: "",
    });
    await expect(runLocal(planningHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "planning\n",
      stderr: "",
    });

    await write(repo, ".arc/system/.internal/scripts/check.sh", "exit 0\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "add executable rider"]);
    const reviewedHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

    await expect(runHosted(reviewedHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "reviewed\n",
      stderr: "",
    });
    await expect(runLocal(reviewedHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "reviewed\n",
      stderr: "",
    });
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

  it("stages the same lean transition through exact full and partial repository loci", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const full = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(full.status, JSON.stringify(full)).toBe("staged");
    if (full.status !== "staged") return;
    expect(full.operation.occupation).toMatchObject({
      protection: "full",
      candidateOwnership: {
        kind: "claimed",
        candidateBranch: "chore/decompose-origin",
      },
    });
    expect(full.operation.transitionRecord).toMatchObject({ kind: "decompose", origin: "origin" });
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe("");

    const partial = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });
    expect(partial.status, JSON.stringify(partial)).toBe("staged");
    if (partial.status !== "staged") return;
    expect(partial.operation.occupation).toEqual({
      status: "occupied",
      protection: "partial",
      candidateOwnership: { kind: "not-applicable", protection: "partial" },
    });
    expect(partial.plan).toEqual(full.plan);
    expect(partial.operation.report).toEqual(full.operation.report);
    expect(partial.operation.transitionRecord).toEqual(full.operation.transitionRecord);
    const appliedPaths = partial.operation.materialization.paths
      .filter(({ disposition }) => disposition === "applied")
      .map(({ path }) => path)
      .concat(resolveTransitionRecordRelativePath("origin"));
    expect(await git(repo, ["diff", "--cached", "--name-only", "--no-renames"]))
      .toBe(`${appliedPaths.join("\n")}\n`);
  });

  it("returns staged execution without a prescribed successor command", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);

    const staged = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(staged, JSON.stringify(staged)).toMatchObject({ status: "staged" });
    expect(canonicalize(staged)).not.toContain("discard");
    expect(canonicalize(staged)).not.toContain("continuation");
    expect(canonicalize(staged)).not.toContain("receiptId");
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
        candidateBranch: "chore/decompose-origin",
        expectedHead: completedMap.machine.resultBase.head,
      },
    });
    expect(result).toMatchObject({
      remedy: expect.stringContaining(`then retry: arc decompose origin --execute ${cutMapPath}`),
    });
    expect(result.status === "refused" ? result.remedy : "").not.toContain("discard");
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

    const staged = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(staged, JSON.stringify(staged)).toMatchObject({
      status: "staged",
      operation: {
        occupation: {
          status: "occupied",
          protection: "partial",
          candidateOwnership: { kind: "not-applicable", protection: "partial" },
        },
        transitionRecord: { kind: "decompose", origin: "origin" },
      },
    });
    if (staged.status !== "staged") return;
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
      expect(meta).not.toContain("Decomposition Receipt");
      expect(await pathExists(join(memberDir, `spec-${slug}.md`))).toBe(true);
      expect(await pathExists(join(memberDir, `draft-${slug}.md`))).toBe(false);
      expect(await pathExists(join(memberDir, `spec-${slug}-prd.md`))).toBe(false);
      expect(await pathExists(join(memberDir, `spec-${slug}-rfc.md`))).toBe(false);
    }

    expect(await readFile(
      join(repo, ...resolveTransitionRecordRelativePath("origin").split("/")),
      "utf8",
    )).toContain('"kind":"decompose"');
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"])).toBe(worktreesBefore);
  });

  it("preserves a nonempty configured-ref backlog-stub parent", async () => {
    const { repo, dependencies, cutMapPath } = await backlogStubRepository({
      preserveParent: true,
    });
    const sourceDir = join(repo, ".arc", "backlog", "planned", "origin");
    const worktreesBefore = await git(repo, ["worktree", "list", "--porcelain"]);

    const staged = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(staged.status, JSON.stringify(staged)).toBe("staged");
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
