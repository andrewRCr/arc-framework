/** Built-CLI coverage for destructive decomposition candidate discard. */

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import {
  resolveConfiguredBaseDecompositionAnchor,
} from "../../src/lib/work-unit/configured-base-decomposition-anchor.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArcNoTty,
} from "./helpers.js";

const execFileAsync = promisify(execFile);

async function write(repo: string, path: string, content: string): Promise<void> {
  const absolute = join(repo, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

async function startedRepository(options: {
  protection?: "full" | "partial";
  heterogeneous?: boolean;
} = {}): Promise<string> {
  const repo = await createTempRepo("arc-decompose-command-");
  const protection = options.protection ?? "full";
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
  await write(
    repo,
    ".arc/system/arc-config.yml",
    `branch.base: main\nbranch.protection: ${protection}\npm.mode: arc-in-git\n`,
  );
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap: Project Status\n");
  await write(repo, ".arc/backlog/planned/origin/draft-origin.md", draft);
  await write(repo, ".arc/backlog/planned/origin/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "test-user",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    dependsOn: options.heterogeneous ? ["dependency"] : [],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  await write(repo, ".arc/reference/shared.txt", "shared\n");
  if (options.heterogeneous) {
    await write(
      repo,
      ".arc/reference/shared.md",
      "# Shared home\n\n"
        + "## Retained prefix\n\nKeep this prefix byte-for-byte.\n\n"
        + "## Allocation target\n\nReplace only this allocated section.\n\n"
        + "## Retained suffix\n\nKeep this suffix byte-for-byte.\n",
    );
    await write(
      repo,
      ".arc/backlog/planned/dependency/draft-dependency.md",
      "# Draft: dependency\n",
    );
    await write(
      repo,
      ".arc/backlog/planned/dependency/meta-dependency.md",
      renderMetaFile("dependency", {
        state: "Planning",
        owner: "test-user",
        workClass: "Light",
        priority: "P2",
        origin: "internal",
        design: ["draft-dependency.md"],
        currentWorkflow: "draft-design",
        nextAction: "Begin draft-design",
      }),
    );
    await write(repo, ".arc/backlog/planned/existing/draft-existing.md", "# Draft: existing\n");
    await write(
      repo,
      ".arc/backlog/planned/existing/meta-existing.md",
      renderMetaFile("existing", {
        state: "Planning",
        owner: "test-user",
        workClass: "Light",
        priority: "P2",
        origin: "internal",
        design: ["draft-existing.md"],
        dependsOn: ["origin"],
        currentWorkflow: "draft-design",
        nextAction: "Begin draft-design",
      }),
    );
  }
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "prepare base"]);
  await git(repo, ["switch", "-c", "plan/origin"]);
  await mkdir(join(repo, ".arc/active"), { recursive: true });
  await git(repo, [
    "mv",
    ".arc/backlog/planned/origin/draft-origin.md",
    ".arc/active/draft-origin.md",
  ]);
  await git(repo, [
    "mv",
    ".arc/backlog/planned/origin/meta-origin.md",
    ".arc/active/meta-origin.md",
  ]);
  await write(repo, ".arc/active/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "test-user",
    branch: "plan/origin",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    dependsOn: options.heterogeneous ? ["dependency"] : [],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "start origin"]);
  await git(repo, ["switch", "main"]);
  return repo;
}

async function writeCompletedCutMap(repo: string): Promise<string> {
  const preflight = await runArcNoTty(["decompose", "origin", "--preflight"], repo);
  expect(preflight.exitCode, preflight.stderr).toBe(0);
  const starter = JSON.parse(preflight.stdout) as {
    schemaVersion: 3;
    machine: {
      sourceUnits: Array<{ sourceId: string; sourceLocator: unknown }>;
    };
  };
  const completed = {
    schemaVersion: 3,
    machine: (starter as { machine: unknown }).machine,
    authoring: {
      shape: "heterogeneous",
      placement: { kind: "direct-member" },
      destinations: [
        {
          kind: "existing-home",
          destinationId: "existing",
          target: { kind: "document", path: ".arc/reference/shared.txt" },
        },
        {
          kind: "new-member",
          destinationId: "member",
          slug: "member",
          workClass: "Heavy",
        },
      ],
      internalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned",
        disposition: {
          kind: "target",
          destinationId: "member",
          targetLocator: {
            ...(unit.sourceLocator as object),
            artifact: "draft-member.md",
          },
        },
      })),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completed)}\n`);
  return cutMapPath;
}

async function writePartialHeterogeneousCutMap(repo: string): Promise<{
  cutMapPath: string;
  machine: {
    sourceUnits: Array<{
      sourceId: string;
      sourceLocator: { artifact: string; [key: string]: unknown };
    }>;
    incomingEdges: Array<{ edgeId: string }>;
    outgoingEdges: Array<{ edgeId: string }>;
  };
}> {
  const preflight = await runArcNoTty(["decompose", "origin", "--preflight"], repo);
  expect(preflight.exitCode, preflight.stderr).toBe(0);
  const starter = JSON.parse(preflight.stdout) as {
    machine: {
      sourceUnits: Array<{
        sourceId: string;
        sourceLocator: { artifact: string; [key: string]: unknown };
      }>;
      incomingEdges: Array<{ edgeId: string }>;
      outgoingEdges: Array<{ edgeId: string }>;
    };
  };
  expect(starter.machine.sourceUnits.length).toBeGreaterThan(1);
  expect(starter.machine.incomingEdges).toHaveLength(1);
  expect(starter.machine.outgoingEdges).toHaveLength(1);
  const completed = {
    schemaVersion: 3,
    machine: starter.machine,
    authoring: {
      shape: "heterogeneous",
      placement: { kind: "direct-member" },
      destinations: [
        {
          kind: "existing-home",
          destinationId: "document",
          target: { kind: "document", path: ".arc/reference/shared.md" },
        },
        {
          kind: "existing-home",
          destinationId: "existing",
          target: { kind: "work-unit", slug: "existing" },
        },
        {
          kind: "new-member",
          destinationId: "member",
          slug: "member",
          workClass: "Heavy",
        },
      ],
      internalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit, index) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned",
        disposition: index === 0
          ? {
              kind: "target",
              destinationId: "document",
              targetLocator: {
                artifact: "shared.md",
                kind: "section",
                level: 2,
                headingSource: "Allocation target",
                ancestry: [],
                occurrence: 0,
              },
            }
          : {
              kind: "target",
              destinationId: "member",
              targetLocator: {
                ...unit.sourceLocator,
                artifact: "draft-member.md",
              },
            },
      })),
      incomingDispositions: starter.machine.incomingEdges.map(({ edgeId }) => ({
        edgeId,
        disposition: { kind: "replace", replacementTargets: ["member"] },
      })),
      outgoingDispositions: starter.machine.outgoingEdges.map(({ edgeId }) => ({
        edgeId,
        disposition: { kind: "targets", targets: ["member"] },
      })),
    },
  };
  const cutMapPath = join(repo, "partial-cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completed)}\n`);
  return { cutMapPath, machine: starter.machine };
}

async function claimFiles(repo: string): Promise<string[]> {
  try {
    const commonDir = resolve(repo, await git(repo, ["rev-parse", "--git-common-dir"]));
    return (await readdir(join(commonDir, "arc", "transient-claims"))).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function repositorySnapshot(repo: string): Promise<{
  head: string;
  heads: string;
  indexTree: string;
  status: string;
  worktrees: string;
  claims: string[];
}> {
  return {
    head: await git(repo, ["rev-parse", "HEAD"]),
    heads: await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]),
    indexTree: await git(repo, ["write-tree"]),
    status: await git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]),
    worktrees: await git(repo, ["worktree", "list", "--porcelain"]),
    claims: await claimFiles(repo),
  };
}

describe("arc decompose command modes", () => {
  let repo: string | undefined;

  afterEach(async () => {
    if (repo !== undefined) await cleanupTempDir(repo);
  });

  it("executes and discards only the exact canonical candidate generation", async () => {
    repo = await startedRepository();
    const cutMapPath = await writeCompletedCutMap(repo);

    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    expect(JSON.parse(executed.stdout)).toMatchObject({
      status: "prepared",
      operation: {
        occupation: {
          protection: "full",
          candidateOwnership: {
            generation: 1,
            candidateBranch: "chore/decompose-origin",
          },
        },
      },
    });

    const discarded = await runArcNoTty(
      ["decompose", "origin", "--discard", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(discarded.exitCode, discarded.stderr).toBe(0);
    expect(JSON.parse(discarded.stdout)).toMatchObject({
      status: "discarded",
      generation: 1,
      candidateBranch: "chore/decompose-origin",
    });
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"]))
      .not.toContain("branch refs/heads/chore/decompose-origin");
    const claims = await readdir(join(repo, ".git", "arc", "transient-claims"));
    expect(claims).toHaveLength(1);
    expect(JSON.parse(await readFile(
      join(repo, ".git", "arc", "transient-claims", claims[0]!),
      "utf8",
    ))).toMatchObject({
      state: { kind: "terminal", terminal: { kind: "discarded" } },
      registration: { kind: "released" },
    });
  });

  it("finalizes the exact prepared receipt from its candidate worktree", async () => {
    repo = await startedRepository();
    const cutMapPath = await writeCompletedCutMap(repo);
    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    const prepared = JSON.parse(executed.stdout) as {
      status: "prepared";
      operation: {
        occupation: { path: string };
        preparation: { receiptId: string };
      };
      next: {
        kind: "finalize-with-continuation";
        continuationPath: string;
        command: string;
      };
    };
    const continuationPath = `${cutMapPath}.continuation.json`;
    expect(prepared.next).toEqual({
      kind: "finalize-with-continuation",
      continuationPath,
      command: `arc decompose origin --finalize ${prepared.operation.preparation.receiptId} `
        + `--continuation ${continuationPath}`,
    });
    await writeFile(
      prepared.next.continuationPath,
      `${canonicalize({ kind: "selected", slugs: ["member"] })}\n`,
    );

    const finalized = await runArcNoTty(
      [
        "decompose",
        "origin",
        "--finalize",
        prepared.operation.preparation.receiptId,
        "--continuation",
        prepared.next.continuationPath,
      ],
      prepared.operation.occupation.path,
      { timeout: 60_000 },
    );

    expect(finalized.exitCode, finalized.stderr).toBe(0);
    expect(JSON.parse(finalized.stdout)).toMatchObject({
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

  it("retires one heterogeneous direct member on the partial base without candidate authority", async () => {
    repo = await startedRepository({ protection: "partial", heterogeneous: true });
    const { cutMapPath } = await writePartialHeterogeneousCutMap(repo);
    const sharedPath = join(repo, ".arc", "reference", "shared.md");
    const existingMetaPath = join(
      repo,
      ".arc",
      "backlog",
      "planned",
      "existing",
      "meta-existing.md",
    );
    const sharedBefore = await readFile(sharedPath, "utf8");
    const existingMetaBefore = await readFile(existingMetaPath, "utf8");

    await writeFile(sharedPath, `${sharedBefore}\nstale existing-home bytes\n`);
    const beforeStaleRefusal = await repositorySnapshot(repo);
    const stale = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(stale.exitCode).not.toBe(0);
    expect(JSON.parse(stale.stdout)).toMatchObject({
      status: "refused",
      stage: "occupation",
      reason: "partial-projection-dirty",
      recovery: { kind: "none" },
    });
    expect(await repositorySnapshot(repo)).toEqual(beforeStaleRefusal);

    await git(repo, ["restore", "--", ".arc/reference/shared.md"]);
    const beforeExecute = await repositorySnapshot(repo);
    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    const prepared = JSON.parse(executed.stdout) as {
      status: "prepared";
      operation: {
        occupation: {
          protection: "partial";
          candidateOwnership: { kind: "not-applicable"; protection: "partial" };
        };
        preparation: { receiptId: string };
        report: {
          topology: Array<{ kind: string; action: string; disposition: string; path?: string }>;
          destinations: Array<{ path: string }>;
        };
      };
      next: {
        kind: "finalize-with-continuation";
        continuationPath: string;
        command: string;
      };
    };
    expect(prepared).toMatchObject({
      status: "prepared",
      operation: {
        occupation: {
          protection: "partial",
          candidateOwnership: { kind: "not-applicable", protection: "partial" },
        },
      },
      next: { kind: "finalize-with-continuation" },
    });
    expect(prepared.operation.report.topology).toEqual([{
      kind: "topology",
      action: "none",
      disposition: "no-write",
    }]);
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"]))
      .toBe(beforeExecute.worktrees);
    expect(await git(repo, ["remote"])).toBe("");
    expect(await readFile(sharedPath, "utf8")).toBe(sharedBefore);

    const existingMetaAfter = await readFile(existingMetaPath, "utf8");
    expect(existingMetaAfter).toBe(existingMetaBefore.replace(
      "- **Depends On:** `origin`",
      "- **Depends On:** `member`",
    ));
    const memberMeta = await readFile(
      join(repo, ".arc", "backlog", "planned", "member", "meta-member.md"),
      "utf8",
    );
    expect(memberMeta).toContain("- **Depends On:** `dependency`");
    expect(await git(repo, ["ls-files", "**/meta-existing.md"]))
      .toBe(".arc/backlog/planned/existing/meta-existing.md");
    const stagedAfterExecute = await git(repo, ["diff", "--cached", "--name-only", "--no-renames"]);
    expect(stagedAfterExecute).not.toContain("cohort-");
    expect(stagedAfterExecute).not.toContain("meta-document.md");

    const sharedAfter = sharedBefore.replace(
      "## Allocation target\n\nReplace only this allocated section.\n",
      "## Allocation target\n\nAllocated origin responsibility now lives here.\n",
    );
    expect(sharedAfter).not.toBe(sharedBefore);
    expect(sharedAfter).toContain("## Retained prefix\n\nKeep this prefix byte-for-byte.");
    expect(sharedAfter).toContain("## Retained suffix\n\nKeep this suffix byte-for-byte.");
    await writeFile(sharedPath, sharedAfter);
    await git(repo, ["add", "--", ".arc/reference/shared.md"]);
    await writeFile(
      prepared.next.continuationPath,
      `${canonicalize({ kind: "none" })}\n`,
    );

    const finalized = await runArcNoTty(
      [
        "decompose",
        "origin",
        "--finalize",
        prepared.operation.preparation.receiptId,
        "--continuation",
        prepared.next.continuationPath,
      ],
      repo,
      { timeout: 60_000 },
    );
    expect(finalized.exitCode, finalized.stderr).toBe(0);
    const recorded = JSON.parse(finalized.stdout) as {
      status: string;
      receipt: {
        prepared: {
          candidateOwnership: { kind: string; protection: string };
        };
        finalized: {
          publication: {
            logicalAnchor: unknown;
            entries: unknown[];
            initialContinuation: unknown;
          };
          managedPathResults: Array<{ path: string; after: { kind: string } }>;
        };
      };
    };
    expect(recorded).toMatchObject({
      status: "recorded",
      receipt: {
        prepared: {
          candidateOwnership: { kind: "not-applicable", protection: "partial" },
        },
        finalized: {
          publication: {
            logicalAnchor: { kind: "direct-member", slug: "member" },
            entries: [
              {
                kind: "existing-destination",
                destinationId: "document",
                target: { kind: "document", path: ".arc/reference/shared.md" },
              },
              {
                kind: "existing-destination",
                destinationId: "existing",
                target: { kind: "work-unit", slug: "existing" },
              },
              { kind: "new-leaf", slug: "member" },
            ],
            initialContinuation: { kind: "none" },
          },
        },
      },
    });
    expect(recorded.receipt.finalized.managedPathResults)
      .toContainEqual(expect.objectContaining({
        path: ".arc/reference/shared.md",
        after: expect.objectContaining({ kind: "file" }),
      }));
    expect(await readFile(sharedPath, "utf8")).toBe(sharedAfter);
    expect(await claimFiles(repo)).toEqual([]);

    await git(repo, [
      "commit",
      "-m",
      "Land partial heterogeneous decomposition",
    ]);
    const landedHead = await git(repo, ["rev-parse", "main"]);
    const anchor = await resolveConfiguredBaseDecompositionAnchor(
      "main",
      "origin",
      {
        exec: async (command, args, options) => {
          const { stdout } = await execFileAsync(command, args, {
            cwd: options?.cwd ?? repo,
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
          });
          return { stdout };
        },
        readBlob: async (oid) => {
          const { stdout } = await execFileAsync("git", ["cat-file", "blob", oid], {
            cwd: repo,
            encoding: "buffer",
            maxBuffer: 20 * 1024 * 1024,
          });
          return new Uint8Array(stdout);
        },
      },
    );
    expect(anchor).toMatchObject({
      status: "resolved",
      anchor: {
        currentBaseHead: landedHead,
        candidateCommitHead: landedHead,
        claimRetirement: { kind: "not-applicable", protection: "partial" },
      },
    });

    const handoff = await runArcNoTty(["decompose", "origin", "--handoff"], repo);
    expect(handoff.exitCode, handoff.stderr).toBe(0);
    const publication = JSON.parse(handoff.stdout) as {
      status: string;
      handoff: {
        logicalAnchor: unknown;
        entries: Array<{ kind: string; destinationId?: string; readiness?: unknown }>;
        initialContinuation: unknown;
        selectedReadiness: Array<{ slug: string }>;
      };
    };
    expect(publication).toMatchObject({
      status: "resolved",
      handoff: {
        logicalAnchor: { kind: "direct-member", slug: "member" },
        initialContinuation: { kind: "none" },
        selectedReadiness: [],
      },
    });
    expect(publication.handoff.entries.filter(({ kind }) =>
      kind === "existing-destination",
    )).toEqual([
      {
        kind: "existing-destination",
        destinationId: "document",
        target: { kind: "document", path: ".arc/reference/shared.md" },
        displayPath: ".arc/reference/shared.md",
      },
      {
        kind: "existing-destination",
        destinationId: "existing",
        target: { kind: "work-unit", slug: "existing" },
        displayPath: ".arc/backlog/planned/existing",
      },
    ]);
    expect(publication.handoff.entries.filter(({ kind }) =>
      kind === "existing-destination",
    ).every((entry) => entry.readiness === undefined)).toBe(true);
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["remote"])).toBe("");
  });
});
