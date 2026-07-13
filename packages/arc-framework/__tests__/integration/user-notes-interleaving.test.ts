/**
 * Deterministic interleaving tests for same-machine user-notes writers.
 *
 * These use real git worktrees because the user-notes ref and notes lock are
 * shared through the git common dir. The step barrier controls the operation
 * order without timing sleeps.
 */

import { describe, it, expect } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  execFileAsync,
  makeCommit,
  makeUserIO,
} from "../helpers/integration.js";
import {
  createManualStepBarrier,
  setupWorktreeSiblings,
} from "../helpers/multi-clone.js";
import { reconcileNotesPush, runUserLoad, runUserSave, type UserIOContext } from "../../src/commands/user.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;
const SHORT_NOTES_REF = `arc/user/${IDENTITY}`;

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

async function addRemoteManifestNote(
  remote: string,
  commit: string,
  files: Record<string, string>,
): Promise<void> {
  await addRemoteNote(remote, commit, JSON.stringify({ version: 2, files }));
}

function workingMemory(...entries: string[]): string {
  return `# Working Memory\n\n## Memories\n\n${entries.join("\n\n")}\n\n---\n`;
}

function memoryEntry(title: string): string {
  return `**${title}:**\n_Remove when: done._\n\n${title} body.`;
}

async function writeWorkingMemory(cwd: string, content: string): Promise<void> {
  const userDir = join(cwd, ".arc", "user", IDENTITY);
  await mkdir(userDir, { recursive: true });
  await writeFile(join(userDir, "WORKING-MEMORY.md"), content, "utf-8");
}

async function readWorkingMemory(cwd: string): Promise<string> {
  return readFile(join(cwd, ".arc", "user", IDENTITY, "WORKING-MEMORY.md"), "utf-8");
}

async function savedWorkingMemory(io: UserIOContext, commit: string): Promise<string> {
  const note = await io.readNote(SHORT_NOTES_REF, commit);
  if (note === null) throw new Error(`missing note for ${commit}`);
  const parsed = JSON.parse(note) as { files: Record<string, string> };
  return parsed.files["WORKING-MEMORY.md"] ?? "";
}

async function waitForFileToContain(path: string, needle: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await readFile(path, "utf-8")).includes(needle)) return;
    } catch {
      // Keep polling until the writer creates the file.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${path} to contain ${needle}`);
}

function saveIoPausedAfterWorkingMemoryRead(cwd: string, barrier: ReturnType<typeof createManualStepBarrier>): UserIOContext {
  const io = makeUserIO(cwd);
  let paused = false;
  return {
    ...io,
    readFile: async (path: string) => {
      const content = await io.readFile(path);
      if (!paused && path.endsWith("WORKING-MEMORY.md")) {
        paused = true;
        await barrier.arrive();
      }
      return content;
    },
  };
}

describe("same-machine user-notes interleavings", () => {
  it("keeps a reconcile-merged entry across repeated saves before disk load", async () => {
    const harness = await setupWorktreeSiblings({
      primary: { config: { "arc.identity": IDENTITY } },
      sibling: { config: { "arc.identity": IDENTITY } },
      siblingBranch: "work-b",
    });

    try {
      await writeWorkingMemory(harness.primary, workingMemory(memoryEntry("Local")));
      const io = makeUserIO(harness.primary);
      await runUserSave({ cwd: harness.primary, io, identity: IDENTITY });
      await reconcileNotesPush({ cwd: harness.primary, io, identity: IDENTITY });

      const siblingCommit = await makeCommit(harness.sibling, "sibling entry");
      await git(harness.sibling, ["push", "origin", "HEAD:work-b"]);
      await addRemoteManifestNote(harness.origin, siblingCommit, {
        "WORKING-MEMORY.md": workingMemory(memoryEntry("Sibling")),
      });

      const reconcile = await reconcileNotesPush({ cwd: harness.primary, io, identity: IDENTITY });
      expect(reconcile).toEqual({ kind: "reconciled" });

      await runUserSave({ cwd: harness.primary, io, identity: IDENTITY });
      await runUserSave({ cwd: harness.primary, io, identity: IDENTITY });

      const head = await git(harness.primary, ["rev-parse", "HEAD"]);
      const saved = await savedWorkingMemory(io, head);
      expect(saved).not.toContain("## Removed: **Sibling:**");

      await rm(join(harness.primary, ".arc", "user", IDENTITY), { recursive: true, force: true });
      await runUserLoad({ cwd: harness.primary, io, identity: IDENTITY });

      const loaded = await readWorkingMemory(harness.primary);
      expect(loaded).toContain("**Local:**");
      expect(loaded).toContain("**Sibling:**");
      expect(loaded).not.toContain("## Removed: **Sibling:**");
    } finally {
      await harness.cleanup();
    }
  }, 15_000);

  it("does not let a concurrent load stamp induce a tombstone in an in-flight save", async () => {
    const harness = await setupWorktreeSiblings({
      primary: { config: { "arc.identity": IDENTITY } },
      sibling: { config: { "arc.identity": IDENTITY } },
      siblingBranch: "work-b",
    });

    try {
      const local = memoryEntry("Local");
      const loaded = memoryEntry("Loaded Sibling");
      await writeWorkingMemory(harness.primary, workingMemory(local));
      await runUserSave({ cwd: harness.primary, io: makeUserIO(harness.primary), identity: IDENTITY });

      const loadSourceCommit = await makeCommit(harness.primary, "load source");
      const io = makeUserIO(harness.primary);
      await io.writeNote(SHORT_NOTES_REF, JSON.stringify({
        version: 2,
        files: { "WORKING-MEMORY.md": workingMemory(loaded) },
      }), loadSourceCommit);
      await makeCommit(harness.primary, "save target");

      const barrier = createManualStepBarrier();
      const save = runUserSave({
        cwd: harness.primary,
        io: saveIoPausedAfterWorkingMemoryRead(harness.primary, barrier),
        identity: IDENTITY,
      });

      await barrier.reached;
      const load = runUserLoad({ cwd: harness.primary, io, identity: IDENTITY });

      barrier.release();
      await Promise.all([save, load]);

      await waitForFileToContain(join(harness.primary, ".arc", "user", IDENTITY, "WORKING-MEMORY.md"), "Loaded Sibling");

      const head = await git(harness.primary, ["rev-parse", "HEAD"]);
      const saved = await savedWorkingMemory(io, head);
      expect(saved).not.toContain("## Removed: **Loaded Sibling:**");

      await rm(join(harness.primary, ".arc", "user", IDENTITY), { recursive: true, force: true });
      await runUserLoad({ cwd: harness.primary, io, identity: IDENTITY });

      const reloaded = await readWorkingMemory(harness.primary);
      expect(reloaded).toContain("**Loaded Sibling:**");
      expect(reloaded).not.toContain("## Removed: **Loaded Sibling:**");
    } finally {
      await harness.cleanup();
    }
  }, 15_000);
});
