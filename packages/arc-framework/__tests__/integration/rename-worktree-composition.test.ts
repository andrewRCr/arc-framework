/**
 * End-to-end composition of a work-unit rename with marker and Git topology authority.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
} from "../helpers/integration.js";
import {
  readWorktreeMarker,
  writeWorktreeOwnershipMarker,
} from "../../src/lib/git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import {
  createNodeRenameWorktreeTransactionDriver,
} from "../../src/lib/work-unit/rename-worktree-transaction.js";

const IDENTITY = "andrew";

function metaBody(slug: string): string {
  return `# Metadata: ${slug}\n\n`
    + `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n`
    + `|-----------|-----------|------------|-----------|--------------|\n`
    + `| \`Active\` | \`${IDENTITY}\` | \`feat/${slug}\` | \`Light\` | \`P2\` |\n\n`
    + `- **Cohort:** [none]\n- **Depends On:** [none]\n\n`
    + `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n`
    + `- **Current Workflow:** [none]\n- **Next Action:** [none]\n\n---\n`;
}

describe("rename composition with marker and topology authority", () => {
  let repo: string;
  let oldPath: string;
  let newPath: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-rename-worktree-");
    await makeCommit(repo, "initial");
    oldPath = `${repo}.old-name`;
    newPath = `${repo}.new-name`;
    await execFileAsync("git", ["worktree", "add", "-b", "feat/new-name", oldPath], { cwd: repo });
  });

  afterEach(async () => {
    for (const path of [newPath, oldPath]) {
      try {
        await execFileAsync("git", ["worktree", "remove", "--force", path], { cwd: repo });
      } catch {
        // Whichever path the rename left behind is the only one still registered.
      }
    }
    await cleanupTempDir(repo);
  });

  it("renames a marker-only checkout and moves it without retired state", async () => {
    const exec = makeGitExec(repo);

    // The tracked rename has already renamed the WU artifacts; the machine-local marker and path
    // still carry the source identity until the operation transaction takes its mutex.
    await mkdir(join(oldPath, ".arc", "active"), { recursive: true });
    await writeFile(join(oldPath, ".arc", "active", "meta-new-name.md"), metaBody("new-name"), "utf8");
    await writeWorktreeOwnershipMarker(oldPath, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "old-name" },
      spawningIdentity: IDENTITY,
      now: Date.parse("2026-07-24T00:00:00.000Z"),
    });
    const roster = await scanRegisteredWorktrees(exec);
    if (!roster.ok) throw new Error("worktree roster unavailable");
    const registered = roster.worktrees.find((entry) => entry.path === oldPath);
    if (registered === undefined) throw new Error("fixture worktree is not registered");

    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec }).rename({
      sourceCheckoutPath: oldPath,
      targetCheckoutPath: newPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: registered.head,
      move: {
        apply: async () => {
          await execFileAsync("git", ["worktree", "move", oldPath, newPath], { cwd: repo });
        },
        rollback: async () => {
          await execFileAsync("git", ["worktree", "move", newPath, oldPath], { cwd: repo });
        },
      },
    });

    expect(outcome).toMatchObject({ kind: "renamed", checkoutPath: newPath });
    expect(await readWorktreeMarker(newPath)).toMatchObject({
      kind: "present",
      marker: {
        wuName: "new-name",
        createdFor: { kind: "work-unit", name: "new-name" },
      },
    });
  });
});
