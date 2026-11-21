/** Locus JSON retains registered worktrees after their folders are deleted. */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateLocusEnvelope } from "../../src/commands/locus.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
describe("registered folder presence", () => {
  it("exposes a present primary and a hand-deleted linked folder in locus JSON", async () => {
    root = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "folder-presence"], root);
    expect(init.exitCode, init.stderr).toBe(0);
    await git(root, ["config", "arc.identity", "test-user"]);
    await git(root, ["add", "."]);
    await git(root, ["commit", "-m", "chore: initialize"]);
    const deleted = join(root, "deleted-checkout");
    await git(root, ["worktree", "add", "--detach", deleted]);
    await rm(deleted, { recursive: true });
    const result = await runArc(["locus", "--json"], root);
    expect(result.exitCode, result.stderr).toBe(0);
    const frame = validateLocusEnvelope(JSON.parse(result.stdout));
    if (!frame.ok) throw new Error(frame.error.message);
    expect(frame.roster.map(({ checkout }) => ({ path: checkout.path, folderPresent: checkout.folderPresent }))).toEqual([
      { path: root, folderPresent: true }, { path: deleted, folderPresent: false },
    ]);
  }, 30_000);
});
