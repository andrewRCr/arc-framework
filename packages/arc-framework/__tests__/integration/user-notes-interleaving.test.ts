/**
 * Deterministic interleaving tests for same-machine user-notes writers.
 *
 * These use real git worktrees because the user-notes ref and notes lock are
 * shared through the git common dir. The step barrier controls the operation
 * order without timing sleeps.
 */

import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeUserIO,
} from "../helpers/integration.js";
import {
  createManualStepBarrier,
  listNoteEntries,
  readRefTip,
  runControlledSteps,
  setupWorktreeSiblings,
} from "../helpers/multi-clone.js";
import { runUserSave } from "../../src/commands/user.js";
import {
  cleanupBranchBoundedNotesExport,
  planBranchBoundedNotesExport,
  pushBranchBoundedNotesExport,
  type BranchBoundedNotesExportTarget,
  type PushBranchBoundedNotesExportResult,
} from "../../src/lib/user-sync/branch-bounded-notes-export.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function addRemoteNote(remote: string, commit: string, message: string): Promise<void> {
  await git(remote, [
    "-c", "user.email=test@test.com",
    "-c", "user.name=Test User",
    "notes", `--ref=${NOTES_REF}`, "add", "-m", message, commit,
  ]);
}

describe("same-machine user-notes interleavings", () => {
  it("pushes the planned notes tip while preserving a sibling save that lands before push", async () => {
    const harness = await setupWorktreeSiblings({
      primary: { config: { "arc.identity": IDENTITY } },
      sibling: { config: { "arc.identity": IDENTITY } },
      siblingBranch: "work-b",
    });
    let target: BranchBoundedNotesExportTarget | undefined;

    try {
      await git(harness.primary, ["checkout", "-b", "work-a"]);
      const commitA = await makeCommit(harness.primary, "work A");
      await git(harness.primary, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);

      const commitB = await makeCommit(harness.sibling, "work B");
      await git(harness.sibling, ["push", "origin", "HEAD:work-b"]);
      await addRemoteNote(harness.origin, commitB, "note B");

      const prePlanTip = await readRefTip(harness.primary, NOTES_REF);
      expect(prePlanTip).not.toBeNull();

      const planned = createManualStepBarrier();
      let pushOutcome: PushBranchBoundedNotesExportResult | undefined;
      const operation = runControlledSteps([
        {
          name: "plan",
          run: async () => {
            const plan = await planBranchBoundedNotesExport({
              exec: makeGitExec(harness.primary),
              identity: IDENTITY,
              branch: "work-a",
            });
            expect(plan.kind).toBe("planned");
            if (plan.kind !== "planned") throw new Error("expected branch-bounded plan");
            target = plan.target;
            expect(target.ref).not.toBe(NOTES_REF);
            expect(target.supersedesLocal).toBe(true);
          },
          after: planned,
        },
        {
          name: "push",
          run: async () => {
            if (!target) throw new Error("missing planned target");
            pushOutcome = await pushBranchBoundedNotesExport({
              exec: makeGitExec(harness.primary),
              identity: IDENTITY,
              target,
            });
          },
        },
      ]);

      await planned.reached;

      const userDir = join(harness.primary, ".arc", "user", IDENTITY);
      await mkdir(userDir, { recursive: true });
      await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Sibling save\n", "utf-8");
      const commitC = await makeCommit(harness.sibling, "work C");
      await runUserSave({
        cwd: harness.sibling,
        io: makeUserIO(harness.sibling),
        identity: IDENTITY,
      });
      const siblingSaveTip = await readRefTip(harness.primary, NOTES_REF);
      expect(siblingSaveTip).not.toBe(prePlanTip);

      planned.release();
      await operation;

      expect(pushOutcome).toEqual({ kind: "pushed" });
      expect(await readRefTip(harness.primary, NOTES_REF)).toBe(siblingSaveTip);

      const remoteCommits = (await listNoteEntries(harness.origin, NOTES_REF))
        .map((entry) => entry.commit)
        .sort();
      expect(remoteCommits).toEqual([commitA, commitB].sort());
      expect(remoteCommits).not.toContain(commitC);

      const localCommits = (await listNoteEntries(harness.primary, NOTES_REF))
        .map((entry) => entry.commit)
        .sort();
      expect(localCommits).toEqual([commitA, commitC].sort());
    } finally {
      if (target) {
        await cleanupBranchBoundedNotesExport({
          exec: makeGitExec(harness.primary),
          target,
        });
      }
      await harness.cleanup();
    }
  });
});
