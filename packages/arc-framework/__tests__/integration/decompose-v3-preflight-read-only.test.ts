import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { createUserIOContext, readGitBlobBytes } from "../../src/lib/io-context.js";
import { revalidateV3DecomposeExecutionPreflight } from "../../src/lib/work-unit/decompose-v3-execution-preflight.js";
import { createGitV3DecomposePreflight } from "../../src/lib/work-unit/git-decompose-v3-preflight.js";
import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout;
}

async function commitAll(cwd: string, message: string): Promise<void> {
  await git(cwd, "add", "-A");
  await git(cwd, "commit", "-m", message);
}

async function repositoryState(repo: string, sourceWorktree: string) {
  return {
    refs: await git(repo, "for-each-ref", "--format=%(refname)%00%(objectname)"),
    worktrees: await git(repo, "worktree", "list", "--porcelain"),
    baseStatus: await git(repo, "status", "--porcelain=v2", "--untracked-files=all"),
    sourceStatus: await git(sourceWorktree, "status", "--porcelain=v2", "--untracked-files=all"),
    baseIndex: await git(repo, "write-tree"),
    sourceIndex: await git(sourceWorktree, "write-tree"),
    internalState: await readFile(join(repo, ".arc/system/.internal/preflight-fixture/existing.json"), "utf8"),
    baseDirty: await readFile(join(repo, ".arc/local-dirty.txt"), "utf8"),
    sourceDirty: await readFile(join(sourceWorktree, ".arc/active/draft-origin.md"), "utf8"),
  };
}

describe("v3 decomposition preflight read-only boundary", () => {
  let repo: string | undefined;
  let sourceWorktree: string | undefined;

  afterEach(async () => {
    if (repo !== undefined && sourceWorktree !== undefined) {
      await git(repo, "worktree", "remove", "--force", sourceWorktree).catch(() => "");
      await rm(sourceWorktree, { recursive: true, force: true });
    }
    if (repo !== undefined) await cleanupTempDir(repo);
    repo = undefined;
    sourceWorktree = undefined;
  });

  it("preserves refs, worktrees, indices, records, and dirty filesystem bytes", async () => {
    repo = await createTempRepo("arc-decompose-preflight-");
    await mkdir(join(repo, ".arc/backlog/planned/origin"), { recursive: true });
    await mkdir(join(repo, ".arc/system/.internal/preflight-fixture"), { recursive: true });
    await writeFile(
      join(repo, ".arc/backlog/planned/origin/meta-origin.md"),
      renderMetaFile("origin", {
        state: "Planning",
        owner: "andrew",
        branch: null,
        design: ["draft-origin.md"],
      }),
    );
    await writeFile(join(repo, ".arc/backlog/planned/origin/draft-origin.md"), "# Draft\n\n## Base\n");
    await writeFile(
      join(repo, ".arc/system/.internal/preflight-fixture/existing.json"),
      "{\"existing\":true}\n",
    );
    await commitAll(repo, "base source");
    const baseHead = (await git(repo, "rev-parse", "HEAD")).trim();

    await git(repo, "switch", "-c", "plan/origin");
    await rm(join(repo, ".arc/backlog/planned/origin"), { recursive: true });
    await mkdir(join(repo, ".arc/active"), { recursive: true });
    await writeFile(
      join(repo, ".arc/active/meta-origin.md"),
      renderMetaFile("origin", {
        state: "Planning",
        owner: "andrew",
        branch: "plan/origin",
        design: ["draft-origin.md"],
      }),
    );
    await writeFile(join(repo, ".arc/active/draft-origin.md"), "# Draft\n\n## Source\n");
    await commitAll(repo, "started source");
    const sourceHead = (await git(repo, "rev-parse", "HEAD")).trim();
    await git(repo, "switch", "main");
    await git(repo, "update-ref", "refs/remotes/origin/ignored", sourceHead);
    await git(repo, "notes", "--ref=refs/notes/preflight-fixture", "add", "-m", "preserve", baseHead);

    sourceWorktree = join(tmpdir(), `arc-decompose-source-${process.pid}-${Date.now()}`);
    await git(repo, "worktree", "add", sourceWorktree, "plan/origin");
    await writeFile(join(repo, ".arc/local-dirty.txt"), "base dirty bytes\n");
    await appendFile(join(sourceWorktree, ".arc/active/draft-origin.md"), "source dirty bytes\n");
    const before = await repositoryState(repo, sourceWorktree);

    const io = createUserIOContext();
    const result = await createGitV3DecomposePreflight({
      cwd: repo,
      exec: io.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo!, ref, path),
    }, "main", "origin");

    expect(result.status).toBe("ready");
    expect(await repositoryState(repo, sourceWorktree)).toEqual(before);
    if (result.status !== "ready") return;

    const machine = result.preflight.starterMap.machine;
    const completedMap = {
      schemaVersion: 3 as const,
      machine,
      authoring: {
        shape: "symmetric" as const,
        placement: { kind: "cohort" as const, cohort: "origin" },
        destinations: [
          { kind: "new-member" as const, destinationId: "member-a", slug: "member-a", workClass: "Light" as const },
          { kind: "new-member" as const, destinationId: "member-b", slug: "member-b", workClass: "Light" as const },
        ],
        internalEdges: [],
        externalEdges: [],
        sourceAllocations: machine.sourceUnits.map(({ sourceId }) => ({
          sourceId,
          ownership: "destination-owned" as const,
          disposition: { kind: "drop" as const, reason: "reauthor" },
        })),
        incomingDispositions: machine.incomingEdges.map(({ edgeId }) => ({
          edgeId,
          disposition: { kind: "drop" as const, reason: "retire dependency" },
        })),
        outgoingDispositions: machine.outgoingEdges.map(({ edgeId }) => ({
          edgeId,
          disposition: { kind: "drop" as const, reason: "retire dependency" },
        })),
      },
    };
    const cutMapPath = join(repo, "completed-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(sourceWorktree, "add", ".arc/active/draft-origin.md");
    await git(sourceWorktree, "commit", "-m", "move source after preflight");
    const movedSourceHead = (await git(sourceWorktree, "rev-parse", "HEAD")).trim();
    const changedBefore = await repositoryState(repo, sourceWorktree);

    const stale = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async (path) => new Uint8Array(await readFile(path)),
      resolvePreflight: (origin) => createGitV3DecomposePreflight({
        cwd: repo!,
        exec: io.exec,
        readBlob: (ref, path) => readGitBlobBytes(repo!, ref, path),
      }, "main", origin),
    }, "origin", cutMapPath);

    expect(stale).toEqual({
      status: "stale",
      reason: "source-head",
      locus: "machine.source.head",
      evidence: {
        expected: machine.source.head,
        actual: movedSourceHead,
      },
    });
    expect(await repositoryState(repo, sourceWorktree)).toEqual(changedBefore);
  });
});
