import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createGitV3DecomposePreflight } from "../../src/lib/work-unit/git-decompose-v3-preflight.js";
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

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("Git v3 repository plan", () => {
  it("binds a real started source and distinct base predecessor without mutating either checkout", async () => {
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

    const exec = gitExec();
    const preflight = await createGitV3DecomposePreflight({
      cwd: repo,
      exec,
      readBlob: async (ref, path) => await readBlob(repo, ref, path),
    }, "main", "origin");
    expect(preflight.status).toBe("ready");
    if (preflight.status !== "ready") return;
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
    const refsBefore = await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
    const statusBefore = await git(repo, ["status", "--porcelain=v1"]);
    const cohortTemplate = await readFile("arc/reference/templates/arc/work-unit/template-cohort.md");

    const result = await composeGitV3RepositoryPlan({
      cwd: repo,
      exec,
      readBlob: async (ref, path) => await readBlob(repo, ref, path),
      readObject: async (oid) => {
        const { stdout } = await execFileAsync("git", ["cat-file", "-p", oid], {
          cwd: repo,
          encoding: "buffer",
          maxBuffer: 20 * 1024 * 1024,
        });
        return new Uint8Array(stdout);
      },
      cohortTemplate,
    }, "main", completedMap);

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
});
