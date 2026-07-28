/** Built-CLI coverage for destructive decomposition candidate discard. */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArcNoTty,
} from "./helpers.js";

async function write(repo: string, path: string, content: string): Promise<void> {
  const absolute = join(repo, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

async function startedRepository(): Promise<string> {
  const repo = await createTempRepo("arc-decompose-command-");
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
    "branch.base: main\nbranch.protection: full\n",
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
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  await write(repo, ".arc/reference/shared.txt", "shared\n");
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
});
