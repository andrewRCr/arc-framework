/**
 * Integration tests for the user command (save/load/add).
 *
 * Runs against real temporary git repos with real git notes to verify
 * serialization round-trips, ancestor walking, and user directory management.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import {
  cleanupTempDir,
  createTempRepo,
  initInTempRepo,
  makeUserIO,
  makeCommit,
  addBareRemote,
  execFileAsync,
  loadRecipe,
  makeIOContext,
  getArcTemplatePath,
  getInternalTemplatePath,
  DEFAULT_PROMPTS,
} from "../helpers/integration.js";
import { runInit } from "../../src/commands/init.js";
import { hashSyncManifest, serializeSplitUserManifest } from "../../src/commands/user/save-load.js";
import { buildLoadSummary } from "../../src/commands/user/format.js";
import { runRetiredSubdirDetection } from "../../src/lib/session-init/retired-subdir-detection.js";
import { inferRetiredSubdirs } from "../../src/lib/session-init/recommended-action.js";
import {
  runUserSave,
  runUserLoad,
  findNearestUserNote,
  runUserAdd,
  runUserClose,
  runUserOpen,
  findStaleUserWuSubdirs,
  listUserWuSubdirContents,
  removeStaleUserWuSubdir,
  reconcileRetiredSubdirsStandalone,
  runUserPush,
  runUserPull,
  runUserSessionInitStatus,
  runUserStatus,
  inspectUserSyncState,
  UserSaveError,
  BACKUP_FILENAME,
  hasLocalNotes,
  hasRemoteNotes,
  buildUserStatusSummary,
  type UserLoadOutcome,
  type UserLoadResult,
  type UserIOContext,
} from "../../src/commands/user.js";
import { pushNotesWithReconcile } from "../../src/handlers/push-recovery.js";
import { decideSyncAction } from "../../src/handlers/user-sync.js";
import { createSyncOutput } from "../../src/lib/sync-output.js";
import {
  getMaterializedBaselineStampPath,
  NO_COMPARABLE_SOURCE_COMMIT,
} from "../../src/lib/user-sync/index.js";

/** Human-mode SyncOutput stub — delegates through the file-scoped clack mock above. */
const recoveryOutput = createSyncOutput(false);

const {
  mockLog,
  mockNote,
  mockSelect,
  mockIsCancel,
  mockSpinner,
} = vi.hoisted(() => ({
  mockLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockNote: vi.fn(),
  mockSelect: vi.fn(),
  mockIsCancel: vi.fn(() => false) as Mock<(value: unknown) => boolean>,
  mockSpinner: { start: vi.fn(), stop: vi.fn() },
}));

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  select: (...args: unknown[]) => mockSelect(...args),
  confirm: vi.fn(),
  isCancel: (value: unknown) => mockIsCancel(value),
  spinner: () => mockSpinner,
}));

// --- Tests ---

async function listBackupFiles(userDir: string): Promise<string[]> {
  const internalDir = join(userDir, ".internal");
  const names: string[] = [];

  for (const dir of [internalDir, userDir]) {
    try {
      names.push(
        ...(await readdir(dir))
          .filter((name) => name === BACKUP_FILENAME || /^\.pre-load-backup-.*\.json$/u.test(name)),
      );
    } catch {
      // Directory absent — ignore.
    }
  }

  return names.sort();
}

async function readNotesRefTip(cwd: string, identity: string): Promise<string> {
  const ref = `refs/notes/arc/user/${identity}`;
  const { stdout } = await execFileAsync("git", ["rev-parse", ref], { cwd });
  return stdout.trim();
}

async function readHead(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

async function readFetchRefspecs(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git", ["config", "--get-all", "remote.origin.fetch"], { cwd },
  );
  return stdout.trim().split("\n").filter(Boolean);
}

async function addLinkedWorktree(repo: string, branch: string): Promise<string> {
  const linked = await mkdtemp(join(tmpdir(), "arc-user-linked-"));
  await rm(linked, { recursive: true, force: true });
  await execFileAsync("git", ["-C", repo, "worktree", "add", "-b", branch, linked]);
  return linked;
}

function expectLoaded(result: UserLoadOutcome | null): UserLoadResult {
  expect(result).not.toBeNull();
  expect(result?.kind).toBe("loaded");
  return result as UserLoadResult;
}

interface ManualBarrier {
  reached: Promise<void>;
  arrive: () => Promise<void>;
  release: () => void;
}

function createManualBarrier(): ManualBarrier {
  let markReached: () => void = () => {};
  let releaseStep: () => void = () => {};
  const reached = new Promise<void>((resolve) => { markReached = resolve; });
  const released = new Promise<void>((resolve) => { releaseStep = resolve; });
  return {
    reached,
    arrive: async () => {
      markReached();
      await released;
    },
    release: releaseStep,
  };
}

async function writeLocalSyncStateFixture(
  tempDir: string,
  identity: string,
  state: Record<string, unknown>,
): Promise<void> {
  const syncStatePath = join(tempDir, ".arc", "user", identity, ".internal", ".sync-state.json");
  await writeFile(syncStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

async function readLocalSyncStateFixture(
  tempDir: string,
  identity: string,
): Promise<Record<string, unknown>> {
  const syncStatePath = join(tempDir, ".arc", "user", identity, ".internal", ".sync-state.json");
  return JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
}

async function hashUserDir(tempDir: string, identity: string): Promise<string> {
  const io = makeUserIO(tempDir);
  const result = await serializeSplitUserManifest({ cwd: tempDir, io, identity });
  return hashSyncManifest(result.manifest);
}

async function writePartialPushMarker(
  tempDir: string,
  identity: string,
  localRefHash: string,
  sourceCommit: string,
): Promise<void> {
  const current = await readLocalSyncStateFixture(tempDir, identity);
  await writeLocalSyncStateFixture(tempDir, identity, {
    ...current,
    partialPush: { localRefHash, sourceCommit },
  });
}

describe("user save and load", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Full init creates the user directory (SESSION-NOTES is per-WU, seeded by `arc user open`)
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    // Need at least one commit for git notes to attach to
    await makeCommit(tempDir, "initial commit");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("save serializes user dir files to git note, load restores them", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Add identity-global content.
    await writeFile(
      join(userDir, "WORKING-MEMORY.md"),
      "# Working Memory\nRemember feature X",
      "utf-8",
    );

    // Save
    const saveResult = await runUserSave({
      cwd: tempDir, io, identity: "test-user",
    });
    expect(saveResult.fileCount).toBeGreaterThanOrEqual(1);
    expect(saveResult.warnings).toEqual([]);

    // Modify the local file to verify load overwrites
    await writeFile(
      join(userDir, "WORKING-MEMORY.md"),
      "modified locally",
      "utf-8",
    );

    // Load
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fileCount).toBe(saveResult.fileCount);
    expect(loadedResult.fromAncestor).toBe(false);

    // Verify restored content
    const restored = await readFile(
      join(userDir, "WORKING-MEMORY.md"), "utf-8",
    );
    expect(restored).toBe("# Working Memory\nRemember feature X");
  });

  it("prevents a save from reading a torn identity-global load materialization", async () => {
    const userDir = join(tempDir, ".arc", "user", "test-user");
    const wmPath = join(userDir, "WORKING-MEMORY.md");
    const oldContent = "# Working Memory\n\nold";
    const fullContent = "# Working Memory\n\nloaded complete";
    const partialContent = "# Working Memory\n\nloaded";
    await writeFile(wmPath, oldContent, "utf-8");

    const head = await readHead(tempDir);
    const seedIO = makeUserIO(tempDir);
    await seedIO.writeNote(
      "arc/user/test-user",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": fullContent } }),
      head,
    );

    const barrier = createManualBarrier();
    const loadBaseIO = makeUserIO(tempDir);
    const loadIO: UserIOContext = {
      ...loadBaseIO,
      writeFile: async (path, content) => {
        if (path === wmPath) {
          await writeFile(path, partialContent, "utf-8");
          await barrier.arrive();
        }
        await writeFile(path, content, "utf-8");
      },
    };

    const load = runUserLoad({ cwd: tempDir, io: loadIO, identity: "test-user" });
    await barrier.reached;
    expect(await readFile(wmPath, "utf-8")).toBe(partialContent);

    let saveReadReached = false;
    let markSaveRead: () => void = () => {};
    const saveRead = new Promise<void>((resolve) => {
      markSaveRead = () => {
        saveReadReached = true;
        resolve();
      };
    });
    const saveBaseIO = makeUserIO(tempDir);
    const saveIO: UserIOContext = {
      ...saveBaseIO,
      readFile: async (path) => {
        const content = await saveBaseIO.readFile(path);
        if (path === wmPath) markSaveRead();
        return content;
      },
    };
    const save = runUserSave({ cwd: tempDir, io: saveIO, identity: "test-user" });

    await Promise.race([
      saveRead,
      new Promise((resolve) => setTimeout(resolve, 100)),
    ]);
    expect(saveReadReached).toBe(false);

    barrier.release();

    await Promise.all([load, save]);

    const saved = await saveIO.readNote("arc/user/test-user", head);
    expect(saved).not.toBeNull();
    const manifest = JSON.parse(saved ?? "{}") as { files: Record<string, string> };
    expect(manifest.files["WORKING-MEMORY.md"]).toBe(fullContent);
  });

  it("load finds a reachable ancestor note when HEAD has no note", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(
      join(userDir, "WORKING-MEMORY.md"),
      "# Ancestor content",
      "utf-8",
    );

    // Save on current commit
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Make two more commits (no save on these)
    await makeCommit(tempDir, "second commit");
    await makeCommit(tempDir, "third commit");

    // Load should find the note on the ancestor
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fromAncestor).toBe(true);
    expect(loadedResult.ancestorDistance).toBe(2);

    const restored = await readFile(
      join(userDir, "WORKING-MEMORY.md"), "utf-8",
    );
    expect(restored).toBe("# Ancestor content");
  });

  it("load finds a reachable note beyond the old 20-commit window", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Deep reachable note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    for (let i = 0; i < 25; i++) {
      await makeCommit(tempDir, `post-note commit ${i}`);
    }

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fromAncestor).toBe(true);
    expect(loadedResult.ancestorDistance).toBe(25);

    const restored = await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Deep reachable note");
  });

  it("load finds a note attached outside current HEAD ancestry", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await execFileAsync("git", ["-C", tempDir, "checkout", "-b", "side-session"]);
    await makeCommit(tempDir, "side session work");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Side session note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await execFileAsync("git", ["-C", tempDir, "checkout", "main"]);
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.reachableFromHead).toBe(false);
    expect(loadedResult.currentBranch).toBe("main");

    const restored = await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Side session note");
  });

  it("load finds a note when the annotated local branch is gone", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await execFileAsync("git", ["-C", tempDir, "checkout", "-b", "finished-elsewhere"]);
    await makeCommit(tempDir, "finished elsewhere work");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Branch gone note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await execFileAsync("git", ["-C", tempDir, "checkout", "main"]);
    await execFileAsync("git", ["-C", tempDir, "branch", "-D", "finished-elsewhere"]);

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.reachableFromHead).toBe(false);

    const restored = await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Branch gone note");
  });

  it("returns null when no note found anywhere", async () => {
    const io = makeUserIO(tempDir);

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    expect(loadResult).toBeNull();
  });

  it("throws on corrupt git note (malformed JSON)", async () => {
    const io = makeUserIO(tempDir);

    // Write corrupt JSON directly to the git note
    const ref = "refs/notes/arc/user/test-user";
    const { stdout: head } = await execFileAsync(
      "git", ["-C", tempDir, "rev-parse", "HEAD"],
    );
    await execFileAsync(
      "git", ["-C", tempDir, "notes", "--ref", ref, "add", "-f", "-m", "not valid json {{{", head.trim()],
    );

    await expect(
      runUserLoad({ cwd: tempDir, io, identity: "test-user" }),
    ).rejects.toThrow("Corrupt git note");
  });

  it("throws on note with unsupported version", async () => {
    const io = makeUserIO(tempDir);

    // Write a note with version 99 directly
    const ref = "refs/notes/arc/user/test-user";
    const { stdout: head } = await execFileAsync(
      "git", ["-C", tempDir, "rev-parse", "HEAD"],
    );
    const badManifest = JSON.stringify({ version: 99, files: {} });
    await execFileAsync(
      "git", ["-C", tempDir, "notes", "--ref", ref, "add", "-f", "-m", badManifest, head.trim()],
    );

    await expect(
      runUserLoad({ cwd: tempDir, io, identity: "test-user" }),
    ).rejects.toThrow("Unsupported note format");
  });

  it("throws on note with missing files field", async () => {
    const io = makeUserIO(tempDir);

    const ref = "refs/notes/arc/user/test-user";
    const { stdout: head } = await execFileAsync(
      "git", ["-C", tempDir, "rev-parse", "HEAD"],
    );
    const badManifest = JSON.stringify({ version: 1 });
    await execFileAsync(
      "git", ["-C", tempDir, "notes", "--ref", ref, "add", "-f", "-m", badManifest, head.trim()],
    );

    await expect(
      runUserLoad({ cwd: tempDir, io, identity: "test-user" }),
    ).rejects.toThrow("Unsupported note format");
  });

  it("throws UserSaveError when user dir is empty", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "empty-user");
    await mkdir(userDir, { recursive: true });

    await expect(
      runUserSave({ cwd: tempDir, io, identity: "empty-user" }),
    ).rejects.toThrow(UserSaveError);
  });

  it("load finds note on merge ancestor (not just linear)", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note on the initial commit
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Merge ancestor", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Create a branch, make a commit, switch back, make another commit, merge
    await execFileAsync("git", ["-C", tempDir, "checkout", "-b", "feature"]);
    await makeCommit(tempDir, "feature commit");
    await execFileAsync("git", ["-C", tempDir, "checkout", "-"]);
    await makeCommit(tempDir, "main commit");
    // Merge creates a merge commit — bypass hooks (test scaffolding, not hook testing)
    await execFileAsync(
      "git", ["-c", "core.hooksPath=/dev/null", "-C", tempDir, "merge", "feature", "--no-edit"],
    );

    // Load should find the note through the merge ancestry
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fromAncestor).toBe(true);

    const restored = await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Merge ancestor");
  });

  it("load handles shallow clone gracefully", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note on current commit
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Shallow test", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    const remoteDir = await addBareRemote(tempDir);
    await runUserPush({ io, identity: "test-user" });
    await makeCommit(tempDir, "post-save commit");
    await execFileAsync("git", ["-C", tempDir, "push", "origin", "HEAD"]);

    // Shallow clone — limited history but notes ref pulled separately
    const shallowDir = await mkdtemp(join(tmpdir(), "arc-shallow-"));
    await execFileAsync("git", ["clone", "--depth", "2", pathToFileURL(remoteDir).href, shallowDir]);
    await execFileAsync("git", ["config", "user.email", "s@t.com"], { cwd: shallowDir });
    await execFileAsync("git", ["config", "user.name", "Shallow User"], { cwd: shallowDir });

    const shallowIO = makeUserIO(shallowDir);
    await runUserPull({ cwd: shallowDir, io: shallowIO, identity: "test-user" });

    const shallowUserDir = join(shallowDir, ".arc", "user", "test-user");
    await mkdir(shallowUserDir, { recursive: true });
    const loadResult = await runUserLoad({
      cwd: shallowDir, io: shallowIO, identity: "test-user",
    });

    // The noted commit is within the shallow boundary (depth 2, note is 1 commit back)
    // so load succeeds and finds it as an ancestor
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fromAncestor).toBe(true);

    const restored = await readFile(join(shallowUserDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Shallow test");

    await cleanupTempDir(shallowDir);
    await cleanupTempDir(remoteDir);
  });

  it("load restores recent note content in a shallow clone when the annotated commit is beyond boundary", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Deep note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    const remoteDir = await addBareRemote(tempDir);
    await runUserPush({ io, identity: "test-user" });

    // Make many commits to push the noted commit beyond a shallow boundary
    for (let i = 0; i < 10; i++) {
      await makeCommit(tempDir, `commit ${i}`);
    }
    await execFileAsync("git", ["-C", tempDir, "push", "origin", "HEAD"]);

    // Shallow clone with depth 1 — only HEAD
    const shallowDir = await mkdtemp(join(tmpdir(), "arc-shallow-"));
    await execFileAsync("git", ["clone", "--depth", "1", pathToFileURL(remoteDir).href, shallowDir]);
    await execFileAsync("git", ["config", "user.email", "s@t.com"], { cwd: shallowDir });
    await execFileAsync("git", ["config", "user.name", "Shallow User"], { cwd: shallowDir });

    const shallowIO = makeUserIO(shallowDir);
    await runUserPull({ cwd: shallowDir, io: shallowIO, identity: "test-user" });

    const shallowUserDir = join(shallowDir, ".arc", "user", "test-user");
    await mkdir(shallowUserDir, { recursive: true });

    const loadResult = await runUserLoad({ cwd: shallowDir, io: shallowIO, identity: "test-user" });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.reachableFromHead).toBeUndefined();

    const restored = await readFile(join(shallowUserDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Deep note");

    await cleanupTempDir(shallowDir);
    await cleanupTempDir(remoteDir);
  });
});

describe("user load — backup and stale detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates backup before overwriting existing files", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Write content and save
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Modify local file
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified locally", "utf-8");

    // Load — should create backup of "Modified locally" state
    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });

    const backups = await listBackupFiles(userDir);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^\.pre-load-backup-.*\.json$/u);
    const [backupPath] = backups;
    expect(backupPath).toBeDefined();

    // Verify backup exists and contains the pre-load state
    const backupRaw = await readFile(join(userDir, ".internal", backupPath!), "utf-8");
    const backup = JSON.parse(backupRaw) as { version: number; files: Record<string, string> };
    expect(backup.files["WORKING-MEMORY.md"]).toBe("# Modified locally");
  });

  it("skips backup gracefully when user dir does not exist", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "new-user");

    // Save as test-user, then try loading as new-user (no dir yet)
    const existingUserDir = join(tempDir, ".arc", "user", "test-user");
    await writeFile(join(existingUserDir, "WORKING-MEMORY.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Create a note for new-user by saving manually
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# New user", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "new-user" });

    // Remove the dir to simulate first load on a fresh clone
    await rm(userDir, { recursive: true, force: true });

    // Load should succeed without backup (dir doesn't exist)
    const result = await runUserLoad({ cwd: tempDir, io, identity: "new-user" });
    const loadedResult = expectLoaded(result);
    expect(loadedResult.messages).toEqual([]);

    // Verify no backup file created
    let backupExists = true;
    try {
      await readFile(join(userDir, ".internal", BACKUP_FILENAME), "utf-8");
    } catch {
      backupExists = false;
    }
    expect(backupExists).toBe(false);
  });

  it("warns about local files not present in saved manifest", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save with one identity-global file.
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Add an extra local file that won't be in the manifest
    await writeFile(join(userDir, "local-only.txt"), "local stuff", "utf-8");

    // Load — should warn about local-only.txt
    const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    const loadedResult = expectLoaded(result);
    expect(loadedResult.messages).toHaveLength(1);
    expect(loadedResult.messages[0]!.level).toBe("notice");
    expect(loadedResult.messages[0]!.text).toContain("local-only.txt");
    expect(loadedResult.messages[0]!.text).toContain("not in saved manifest");
    expect(loadedResult.messages[0]!.text).toContain("backed up to");
  });

  it("backup excludes dotfiles from serialization", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save initial state
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# First", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Modify and create a dotfile
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Second", "utf-8");
    await writeFile(join(userDir, ".some-dotfile"), "hidden", "utf-8");

    // Load — backup should not include .some-dotfile
    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });

    const backups = await listBackupFiles(userDir);
    expect(backups).toHaveLength(1);
    const [backupPath] = backups;
    expect(backupPath).toBeDefined();

    const backupRaw = await readFile(join(userDir, ".internal", backupPath!), "utf-8");
    const backup = JSON.parse(backupRaw) as { files: Record<string, string> };
    expect(backup.files[".some-dotfile"]).toBeUndefined();
    expect(backup.files["WORKING-MEMORY.md"]).toBe("# Second");
  });

  it("retains only the latest three timestamped backups", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    for (let i = 1; i <= 4; i++) {
      await writeFile(join(userDir, "WORKING-MEMORY.md"), `# Local ${i}`, "utf-8");
      await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    }

    const backups = await listBackupFiles(userDir);
    const timestamped = backups.filter((name) => name !== BACKUP_FILENAME);
    expect(timestamped).toHaveLength(3);
    expect(timestamped.every((name) => /^\.pre-load-backup-.*\.json$/u.test(name))).toBe(true);

    const manifests = await Promise.all(
      timestamped.map(async (name) => {
        const raw = await readFile(join(userDir, ".internal", name), "utf-8");
        return JSON.parse(raw) as { files: Record<string, string> };
      }),
    );
    expect(manifests.map((manifest) => manifest.files["WORKING-MEMORY.md"]).sort()).toEqual([
      "# Local 2",
      "# Local 3",
      "# Local 4",
    ]);
  });

  it("keeps legacy backup files visible while pruning timestamped snapshots", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, BACKUP_FILENAME), JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "# Legacy" } }));

    for (let i = 1; i <= 4; i++) {
      await writeFile(join(userDir, "WORKING-MEMORY.md"), `# Local ${i}`, "utf-8");
      await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    }

    const backups = await listBackupFiles(userDir);
    expect(backups).toContain(BACKUP_FILENAME);
    expect(backups.filter((name) => name !== BACKUP_FILENAME)).toHaveLength(3);
  });
});

describe("user load — retired-subdir reconciliation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
    await addBareRemote(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Mark a WU shipped by committing its `completed/<quarter>/NN_<slug>` archive to
   * `origin/main` — the canonical shipped oracle the reconcile reads — then drop it
   * from the working tree, mirroring a non-integrating machine whose local tree lags
   * the base. Git tracks no empty dirs, so the archive carries a marker file.
   */
  async function markShippedOnOrigin(slug: string, ordinal = "01", quarter = "2026-q2"): Promise<void> {
    const rel = join(".arc", "completed", quarter, `${ordinal}_${slug}`);
    const noHooks = ["-c", "core.hooksPath=/dev/null"];
    await mkdir(join(tempDir, rel), { recursive: true });
    await writeFile(join(tempDir, rel, `meta-${slug}.md`), `# ${slug}`, "utf-8");
    await execFileAsync("git", ["-C", tempDir, "add", rel]);
    await execFileAsync("git", ["-C", tempDir, ...noHooks, "commit", "-m", `archive ${slug}`]);
    await execFileAsync("git", ["-C", tempDir, "push", "origin", "HEAD:main"]);
    await execFileAsync("git", ["-C", tempDir, "rm", "-r", rel]);
    await execFileAsync("git", ["-C", tempDir, ...noHooks, "commit", "-m", `local: drop ${slug} archive`]);
  }

  async function addActiveWorktreeForWu(slug: string): Promise<string> {
    const branch = `work/${slug}`;
    const linked = await addLinkedWorktree(tempDir, branch);
    const activeDir = join(linked, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, `meta-${slug}.md`),
      [
        `# Metadata: ${slug}`,
        "",
        "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
        "| --------- | --------- | ---------- | --------- | ------------ |",
        `| \`Active\` | \`test-user\` | \`${branch}\` | \`Light\` | \`P1\` |`,
        "",
        "- **Cohort:** [none]",
        "- **Depends On:** [none]",
        "",
      ].join("\n"),
      "utf-8",
    );
    return linked;
  }

  async function removeLinkedWorktree(linked: string): Promise<void> {
    try {
      await execFileAsync("git", ["-C", tempDir, "worktree", "remove", "--force", linked]);
    } catch {
      await rm(linked, { recursive: true, force: true });
    }
  }

  it("removes a shipped subdir with no drift, leaving its content recoverable from the backup", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Baseline note carries only the cross-WU flat file — no per-WU subdir.
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // A retired WU's subdir lingers locally; it never made it into a note (no drift
    // basis) and has shipped on origin/main.
    await mkdir(join(userDir, "old-wu"), { recursive: true });
    await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU notes", "utf-8");
    await markShippedOnOrigin("old-wu");

    const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    const loaded = expectLoaded(result);

    expect(await readdir(userDir)).not.toContain("old-wu");

    const backups = await listBackupFiles(userDir);
    const preLoad = backups.find((name) => /^\.pre-load-backup-.*\.json$/u.test(name));
    expect(preLoad).toBeDefined();
    const backup = JSON.parse(
      await readFile(join(userDir, ".internal", preLoad!), "utf-8"),
    ) as { files: Record<string, string> };
    expect(backup.files["old-wu/SESSION-NOTES.md"]).toBe("# Old WU notes");

    const cleanup = loaded.messages.find((m) => m.level === "cleanup" && m.text.includes("old-wu"));
    expect(cleanup).toBeDefined();
    expect(cleanup!.text).toContain("removed");
    expect(cleanup!.text).toContain("backed up to");
    expect(cleanup!.text).not.toContain("absent from recent notes");
  });

  it(
    "session-init recommends reconcile on a non-integrating machine with current notes, " +
      "and the load round-trips the removal",
    async () => {
      const io = makeUserIO(tempDir);
      const userDir = join(tempDir, ".arc", "user", "test-user");

      // Current notes: the cross-WU file is saved and unchanged on disk, so the
      // notes-load signal (`loadNeeded`) would not fire — isolating the
      // retired-subdir signal as the sole reconcile trigger.
      await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
      await runUserSave({ cwd: tempDir, io, identity: "test-user" });

      // A sibling shipped on origin/main; its user subdir lingers locally with no
      // drift basis — the non-integrating-machine accumulation case.
      await mkdir(join(userDir, "old-wu"), { recursive: true });
      await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU notes", "utf-8");
      await markShippedOnOrigin("old-wu");

      // Detection (the session-init probe slot) resolves the candidate off origin/main.
      const detection = await runRetiredSubdirDetection({
        cwd: tempDir,
        identity: "test-user",
        baseBranch: "main",
        exec: io.exec,
        readDir: io.readDir,
        readFile: io.readFile,
      });
      expect(detection.candidates).toContain("old-wu");

      // Under `always` on a clean tree the slot recommends firing `arc user load`
      // even though notes are current — the broadened notes-load dispatch trigger.
      const rec = inferRetiredSubdirs(detection, "always", { state: "clean", fileCount: 0 });
      expect(rec.recommendedAction).toBe("pull");

      // The dispatch's action: the load reconciles the subdir and backs it up.
      const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
      const loaded = expectLoaded(result);
      expect(await readdir(userDir)).not.toContain("old-wu");
      const backups = await listBackupFiles(userDir);
      expect(backups.some((name) => /^\.pre-load-backup-.*\.json$/u.test(name))).toBe(true);
      expect(loaded.messages.some((m) => m.level === "cleanup" && m.text.includes("old-wu"))).toBe(true);
    },
  );

  it("preserves a shipped subdir while a same-machine worktree is still in flight", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");
    let linked: string | null = null;

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await mkdir(join(userDir, "old-wu"), { recursive: true });
    await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU notes", "utf-8");
    await markShippedOnOrigin("old-wu");

    try {
      linked = await addActiveWorktreeForWu("old-wu");
      const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
      const loaded = expectLoaded(result);

      expect(await readdir(userDir)).toContain("old-wu");
      expect(loaded.messages.some((m) => m.text.includes("old-wu"))).toBe(false);
      const backups = await listBackupFiles(userDir);
      const preLoad = backups.find((name) => /^\.pre-load-backup-.*\.json$/u.test(name));
      if (preLoad !== undefined) {
        const backup = JSON.parse(
          await readFile(join(userDir, ".internal", preLoad), "utf-8"),
        ) as { files: Record<string, string> };
        expect(backup.files["old-wu/SESSION-NOTES.md"]).toBeUndefined();
      }
    } finally {
      if (linked !== null) await removeLinkedWorktree(linked);
    }
  });

  it("preserves a present subdir whose WU has not shipped", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Never shipped (absent from origin/main `completed/`) → must stay.
    await mkdir(join(userDir, "live-wu"), { recursive: true });
    await writeFile(join(userDir, "live-wu", "SESSION-NOTES.md"), "# Live WU", "utf-8");

    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });

    expect(await readdir(userDir)).toContain("live-wu");
  });

  it("removes a shipped subdir matching its last-pushed note (in-notes no longer preserves)", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // The subdir is carried in the saved note and matches it on disk — the recency
    // window no longer preserves; shipped + no drift reconciles.
    await mkdir(join(userDir, "done-wu"), { recursive: true });
    await writeFile(join(userDir, "done-wu", "SESSION-NOTES.md"), "# Done WU", "utf-8");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "done-wu" });
    await markShippedOnOrigin("done-wu");

    // A different current WU, so materialization can't re-create done-wu — its
    // removal proves the reconcile acted rather than the load dropping it.
    await runUserLoad({ cwd: tempDir, io, identity: "test-user", currentWuName: "current-wu" });

    expect(await readdir(userDir)).not.toContain("done-wu");
  });

  it("removes a shipped subdir despite local edits to SESSION-NOTES (drift no longer preserves)", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await mkdir(join(userDir, "old-wu"), { recursive: true });
    await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU", "utf-8");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "old-wu" });
    await markShippedOnOrigin("old-wu");

    // Local edit beyond the last-pushed note — once drift-preserved, now reconciled
    // (the WU is shipped and the removal is backed up). Only SESSION-NOTES, so the
    // removal is a quiet cleanup, not a stashed-content notice.
    await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU — local edit", "utf-8");

    const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user", currentWuName: "current-wu" });
    const loaded = expectLoaded(result);

    expect(await readdir(userDir)).not.toContain("old-wu");
    expect(loaded.messages.some((m) => m.level === "cleanup" && m.text.includes("old-wu"))).toBe(true);
    expect(loaded.messages.some((m) => m.level === "notice" && m.text.includes("old-wu"))).toBe(false);
  });

  it("removes a shipped subdir holding stashed files with a loud recover-from-backup notice", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // The operator stashed a non-ARC file in the subdir before the WU shipped.
    await mkdir(join(userDir, "old-wu"), { recursive: true });
    await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU", "utf-8");
    await writeFile(join(userDir, "old-wu", "scratch.py"), "print('keep me')", "utf-8");
    await markShippedOnOrigin("old-wu");

    const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    const loaded = expectLoaded(result);

    expect(await readdir(userDir)).not.toContain("old-wu");

    // The stashed file makes the removal a loud notice that names it and points at
    // the recoverable backup, rather than a quiet cleanup.
    const notice = loaded.messages.find((m) => m.level === "notice" && m.text.includes("old-wu"));
    expect(notice).toBeDefined();
    expect(notice!.text).toContain("scratch.py");
    expect(notice!.text).toContain("recover from .internal/");
    expect(loaded.messages.some((m) => m.level === "cleanup" && m.text.includes("old-wu"))).toBe(false);

    // The stashed content is recoverable from the pre-load backup.
    const backups = await listBackupFiles(userDir);
    const preLoad = backups.find((name) => /^\.pre-load-backup-.*\.json$/u.test(name));
    const backup = JSON.parse(
      await readFile(join(userDir, ".internal", preLoad!), "utf-8"),
    ) as { files: Record<string, string> };
    expect(backup.files["old-wu/scratch.py"]).toBe("print('keep me')");
  });

  it("reconcileRetiredSubdirsStandalone removes a shipped subdir and backs it up (the open entry point)", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await mkdir(join(userDir, "old-wu"), { recursive: true });
    await writeFile(join(userDir, "old-wu", "SESSION-NOTES.md"), "# Old WU notes", "utf-8");
    await markShippedOnOrigin("old-wu");

    const reconciled = await reconcileRetiredSubdirsStandalone({ cwd: tempDir, io, identity: "test-user" });

    expect(reconciled.has("old-wu")).toBe(true);
    expect(await readdir(userDir)).not.toContain("old-wu");

    const backups = await listBackupFiles(userDir);
    const preLoad = backups.find((name) => /^\.pre-load-backup-.*\.json$/u.test(name));
    expect(preLoad).toBeDefined();
    const backup = JSON.parse(
      await readFile(join(userDir, ".internal", preLoad!), "utf-8"),
    ) as { files: Record<string, string> };
    expect(backup.files["old-wu/SESSION-NOTES.md"]).toBe("# Old WU notes");
  });

  it("reconcileRetiredSubdirsStandalone preserves an unresolvable (not-shipped) subdir", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Never shipped on origin/main → unresolvable → must survive (the prompt's residual case).
    await mkdir(join(userDir, "live-wu"), { recursive: true });
    await writeFile(join(userDir, "live-wu", "SESSION-NOTES.md"), "# Live WU", "utf-8");

    const reconciled = await reconcileRetiredSubdirsStandalone({ cwd: tempDir, io, identity: "test-user" });

    expect(reconciled.has("live-wu")).toBe(false);
    expect(await readdir(userDir)).toContain("live-wu");
  });

  it("reconcileRetiredSubdirsStandalone writes no backup when nothing reconciles", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Cross-WU", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Not shipped → nothing reconciles → the recoverable-removal backup is never needed.
    await mkdir(join(userDir, "live-wu"), { recursive: true });
    await writeFile(join(userDir, "live-wu", "SESSION-NOTES.md"), "# Live WU", "utf-8");

    const reconciled = await reconcileRetiredSubdirsStandalone({ cwd: tempDir, io, identity: "test-user" });

    expect(reconciled.size).toBe(0);
    const backups = await listBackupFiles(userDir);
    expect(backups.some((name) => /^\.pre-load-backup-.*\.json$/u.test(name))).toBe(false);
  });
});

describe("user save/load — subdirectory support", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("round-trips a current-WU subdir file alongside cross-WU flat files", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Reset to a known minimal structure — init-seeded files would otherwise
    // inflate the save count and obscure the round-trip assertion. The subdir
    // is a per-WU home; the flat file is cross-WU.
    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-x"), { recursive: true });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Memory", "utf-8");
    await writeFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "# Notes", "utf-8");

    // Save the current WU plus identity-global files.
    const saveResult = await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });
    expect(saveResult.fileCount).toBe(2);

    // Delete everything and reload scoped to feature-x: its subdir plus the
    // cross-WU flat file both restore.
    await rm(userDir, { recursive: true, force: true });

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x",
    });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fileCount).toBe(2);

    // Verify nested file was restored
    const restored = await readFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "utf-8");
    expect(restored).toBe("# Notes");
  });

  it("drops other-WU subdirs but keeps cross-WU flat files when scoped to one WU", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-x"), { recursive: true });
    await mkdir(join(userDir, "feature-y"), { recursive: true });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Memory", "utf-8");
    await writeFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "# X", "utf-8");
    await writeFile(join(userDir, "feature-y", "SESSION-NOTES.md"), "# Y", "utf-8");

    const saveResult = await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });
    expect(saveResult.fileCount).toBe(2);

    await rm(userDir, { recursive: true, force: true });

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x",
    });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fileCount).toBe(2);

    expect(await readFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "utf-8")).toBe("# X");
    expect(await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8")).toBe("# Memory");
    await expect(readFile(join(userDir, "feature-y", "SESSION-NOTES.md"), "utf-8")).rejects.toThrow();
  });

  it("does not surface an off-ancestry line on a cross-WU-only load (new WU, no per-WU note)", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // An existing note carries only another WU's subdir plus the cross-WU flat
    // file — nothing for the brand-new WU we're about to load.
    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-x"), { recursive: true });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Memory", "utf-8");
    await writeFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "# X", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });

    await rm(userDir, { recursive: true, force: true });

    // Load scoped to a WU no note carries: per-WU resolution returns nothing, so
    // only the cross-WU flat file restores — there is no annotated commit to be
    // off-ancestry, and the summary must not claim one.
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user", currentWuName: "brand-new-wu",
    });
    const loadedResult = expectLoaded(loadResult);

    expect(loadedResult.reachableFromHead).toBeUndefined();
    const summary = buildLoadSummary(loadedResult);
    expect(summary).not.toContain("not in");
    expect(summary).not.toContain("detached HEAD");
    expect(await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8")).toBe("# Memory");
  });

  it("merges a cross-WU entry from an older note while restoring the current WU's subdir", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Older note (a different worktree's save): WORKING-MEMORY carries entry A.
    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-old"), { recursive: true });
    await writeFile(
      join(userDir, "WORKING-MEMORY.md"),
      "## Memories\n\n**Entry A:**\n_Remove when: a lands._\n\nFrom the older worktree.\n",
      "utf-8",
    );
    await writeFile(join(userDir, "feature-old", "SESSION-NOTES.md"), "# old", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-old" });

    // Advance HEAD so the next save lands on a distinct note rather than
    // overwriting the first.
    await makeCommit(tempDir, "second commit");

    // Recent note (the current WU): WORKING-MEMORY replaced with entry B only.
    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-current"), { recursive: true });
    await writeFile(
      join(userDir, "WORKING-MEMORY.md"),
      "## Memories\n\n**Entry B:**\n_Remove when: b lands._\n\nFrom the current worktree.\n",
      "utf-8",
    );
    await writeFile(join(userDir, "feature-current", "SESSION-NOTES.md"), "# current", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-current" });

    // Load scoped to the current WU.
    await rm(userDir, { recursive: true, force: true });
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user", currentWuName: "feature-current",
    });
    expectLoaded(loadResult);

    // Per-WU subdir restores from the resolved (recent) note only.
    expect(await readFile(join(userDir, "feature-current", "SESSION-NOTES.md"), "utf-8")).toBe("# current");
    await expect(readFile(join(userDir, "feature-old", "SESSION-NOTES.md"), "utf-8")).rejects.toThrow();

    // Cross-WU flat merges across the window: entry B from the recent note and
    // entry A merged in from the older note both survive.
    const workingMemory = await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8");
    expect(workingMemory).toContain("**Entry B:**");
    expect(workingMemory).toContain("**Entry A:**");
  });

  it("loads the causally-latest reachable note that carries the scoped WU", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-x"), { recursive: true });
    await writeFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "# old", "utf-8");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Memory old", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });

    await makeCommit(tempDir, "advance to newer note");

    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-x"), { recursive: true });
    await writeFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "# new", "utf-8");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Memory new", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });

    await rm(userDir, { recursive: true, force: true });

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x",
    });
    const loadedResult = expectLoaded(loadResult);

    expect(loadedResult.reachableFromHead).toBe(true);
    expect(await readFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "utf-8")).toBe("# new");
    expect(await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8")).toBe("# Memory new");
  });

  it("loads a reachable note far behind HEAD without a distance cap", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await rm(userDir, { recursive: true, force: true });
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Deep memory", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });

    for (let i = 0; i < 15; i++) {
      await makeCommit(tempDir, `advance ${i}`);
    }

    await rm(userDir, { recursive: true, force: true });

    const loadResult = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    const loadedResult = expectLoaded(loadResult);

    expect(loadedResult.reachableFromHead).toBe(true);
    expect(loadedResult.ancestorDistance).toBe(15);
    expect(await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8")).toBe("# Deep memory");
  });

  it("keeps cross-WU-only load status current with the sentinel basis", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "feature-x"), { recursive: true });
    await writeFile(join(userDir, "feature-x", "SESSION-NOTES.md"), "# X", "utf-8");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Memory", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user", currentWuName: "feature-x" });

    await rm(userDir, { recursive: true, force: true });

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user", currentWuName: "brand-new-wu",
    });
    expectLoaded(loadResult);

    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");
    expect(syncState.sourceCommit).toBe(NO_COMPARABLE_SOURCE_COMMIT);

    const status = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });

    expect(status.diskStatus).not.toBe("mixed");
    expect(status.unsavedDirection).not.toBe("mixed");
    expect(status.diskStatus).toBe("current");
    expect(status.unsavedDirection).toBeNull();
  });
});

describe("user save/load — split-source worktree surfaces", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("saves identity-global files from primary and SESSION-NOTES from the active linked worktree", async () => {
    const linked = await addLinkedWorktree(tempDir, "feat/split-save");
    try {
      const primaryUserDir = join(tempDir, ".arc", "user", "test-user");
      const linkedUserDir = join(linked, ".arc", "user", "test-user");
      await mkdir(join(linkedUserDir, "split-save"), { recursive: true });
      await writeFile(join(primaryUserDir, "WORKING-MEMORY.md"), "# Primary memory", "utf-8");
      await writeFile(join(primaryUserDir, "SESSION-NOTES.md"), "# Legacy root should not save", "utf-8");
      await mkdir(linkedUserDir, { recursive: true });
      await writeFile(join(linkedUserDir, "WORKING-MEMORY.md"), "# Linked stale copy", "utf-8");
      await writeFile(join(linkedUserDir, "split-save", "SESSION-NOTES.md"), "# Linked notes", "utf-8");

      const linkedIo = makeUserIO(linked);
      const save = await runUserSave({
        cwd: linked,
        io: linkedIo,
        identity: "test-user",
        currentWuName: "split-save",
      });

      expect(save.fileCount).toBe(3);
      const head = await readHead(linked);
      const note = await linkedIo.readNote("arc/user/test-user", head);
      expect(note).not.toBeNull();
      const manifest = JSON.parse(note!) as { files: Record<string, string> };
      expect(manifest.files).toMatchObject({
        "WORKING-MEMORY.md": "# Primary memory",
        "USER-INBOX.md": expect.any(String) as string,
        "split-save/SESSION-NOTES.md": "# Linked notes",
      });
      expect(manifest.files["SESSION-NOTES.md"]).toBeUndefined();
      expect(manifest.files["WORKING-MEMORY.md"]).not.toBe("# Linked stale copy");
    } finally {
      await execFileAsync("git", ["-C", tempDir, "worktree", "remove", "--force", linked]);
    }
  });

  it("migrates mergeable linked identity-global copies into the primary root before saving", async () => {
    const linked = await addLinkedWorktree(tempDir, "feat/split-migration");
    try {
      const primaryUserDir = join(tempDir, ".arc", "user", "test-user");
      const linkedUserDir = join(linked, ".arc", "user", "test-user");
      await mkdir(join(linkedUserDir, "split-migration"), { recursive: true });
      await writeFile(join(linkedUserDir, "split-migration", "SESSION-NOTES.md"), "# Linked notes", "utf-8");
      await writeFile(
        join(linkedUserDir, "USER-INBOX.md"),
        [
          "# User Inbox",
          "",
          "## Errand",
          "",
          "### `[ ]` **linked capture**",
          "",
          "- _Created:_ `2026-07-05`",
          "",
          "## Work Unit",
          "",
        ].join("\n"),
        "utf-8",
      );

      const linkedIo = makeUserIO(linked);
      const save = await runUserSave({
        cwd: linked,
        io: linkedIo,
        identity: "test-user",
        currentWuName: "split-migration",
      });

      expect(save.fileCount).toBe(3);
      expect(await readFile(join(primaryUserDir, "USER-INBOX.md"), "utf-8")).toContain("linked capture");
      const head = await readHead(linked);
      const note = await linkedIo.readNote("arc/user/test-user", head);
      const manifest = JSON.parse(note!) as { files: Record<string, string> };
      expect(manifest.files["USER-INBOX.md"]).toContain("linked capture");
    } finally {
      await execFileAsync("git", ["-C", tempDir, "worktree", "remove", "--force", linked]);
    }
  });

  it("loads identity-global files to primary and current-WU files to the active linked worktree", async () => {
    const linked = await addLinkedWorktree(tempDir, "feat/split-load");
    try {
      const primaryUserDir = join(tempDir, ".arc", "user", "test-user");
      const linkedUserDir = join(linked, ".arc", "user", "test-user");
      await rm(join(primaryUserDir, "WORKING-MEMORY.md"), { force: true });
      await rm(join(primaryUserDir, "USER-INBOX.md"), { force: true });

      const linkedIo = makeUserIO(linked);
      const head = await readHead(linked);
      await linkedIo.writeNote(
        "arc/user/test-user",
        JSON.stringify({
          version: 2,
          files: {
            "WORKING-MEMORY.md": "# Loaded memory",
            "split-load/SESSION-NOTES.md": "# Loaded notes",
          },
        }),
        head,
      );

      const load = expectLoaded(await runUserLoad({
        cwd: linked,
        io: linkedIo,
        identity: "test-user",
        currentWuName: "split-load",
      }));

      expect(load.fileCount).toBe(2);
      expect(await readFile(join(primaryUserDir, "WORKING-MEMORY.md"), "utf-8")).toBe("# Loaded memory");
      expect(await readFile(join(linkedUserDir, "split-load", "SESSION-NOTES.md"), "utf-8"))
        .toBe("# Loaded notes");
      await expect(readFile(join(linkedUserDir, "WORKING-MEMORY.md"), "utf-8")).rejects.toThrow();
    } finally {
      await execFileAsync("git", ["-C", tempDir, "worktree", "remove", "--force", linked]);
    }
  });

  it("does not resolve a new WU's nearest note to an unrelated legacy root SESSION-NOTES", async () => {
    // A note carrying a WU-less root SESSION-NOTES (and another WU's subdir) must not
    // be adopted as the nearest note for a fresh WU that has no notes of its own —
    // otherwise `arc user status` / session-init report a false stale-note drift.
    const io = makeUserIO(tempDir);
    const head = await readHead(tempDir);
    await io.writeNote(
      "arc/user/test-user",
      JSON.stringify({
        version: 2,
        files: {
          "SESSION-NOTES.md": "# Legacy notes from an unrelated work unit",
          "other-wu/SESSION-NOTES.md": "# Some other WU's notes",
        },
      }),
      head,
    );

    const { note } = await findNearestUserNote({
      cwd: tempDir,
      io,
      identity: "test-user",
      currentWuName: "fresh-wu",
    });

    expect(note).toBeNull();
  });

  it("drops a stray legacy root SESSION-NOTES on load, materializing only the scoped note", async () => {
    const linked = await addLinkedWorktree(tempDir, "feat/legacy-drop");
    try {
      const linkedIo = makeUserIO(linked);
      const head = await readHead(linked);
      await linkedIo.writeNote(
        "arc/user/test-user",
        JSON.stringify({
          version: 2,
          files: {
            "SESSION-NOTES.md": "# Legacy root notes",
            "legacy-drop/SESSION-NOTES.md": "# Scoped notes",
          },
        }),
        head,
      );

      const result = expectLoaded(await runUserLoad({
        cwd: linked,
        io: linkedIo,
        identity: "test-user",
        currentWuName: "legacy-drop",
      }));

      // The scoped note materializes; the stray root SESSION-NOTES is dropped —
      // not migrated into the WU subdir, not backed up, not written to the identity root.
      expect(await readFile(
        join(linked, ".arc", "user", "test-user", "legacy-drop", "SESSION-NOTES.md"),
        "utf-8",
      )).toBe("# Scoped notes");
      expect(result.messages.some((m) => m.text.includes("legacy root-level"))).toBe(false);
      await expect(readFile(join(tempDir, ".arc", "user", "test-user", "SESSION-NOTES.md"), "utf-8"))
        .rejects.toThrow();
    } finally {
      await execFileAsync("git", ["-C", tempDir, "worktree", "remove", "--force", linked]);
    }
  });
});

describe("user add", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "first-user");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates user directory with WORKING-MEMORY.md and USER-INBOX.md", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const userDir = join(tempDir, ".arc", "user", "new-dev");
    expect(await readFile(join(userDir, "WORKING-MEMORY.md"), "utf-8")).toContain("Working Memory");
    expect(await readFile(join(userDir, "USER-INBOX.md"), "utf-8")).toContain("User Inbox");
  });

  it("seeds the per-user file set cross-PM-mode (no ATOMIC-INBOX.md at user root)", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
    });

    // Per R65b the user-directory seed set is the same regardless of pm.mode;
    // the legacy user/ATOMIC-INBOX seed path retired here.
    await expect(
      readFile(join(tempDir, ".arc", "user", "new-dev", "ATOMIC-INBOX.md"), "utf-8"),
    ).rejects.toThrow();
  });

  it("relies on wildcard gitignore from init (no per-identity entry)", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const gitignore = await readFile(
      join(tempDir, ".gitignore"), "utf-8",
    );
    // Wildcard from init covers all user directories — no per-identity entry needed
    expect(gitignore).toContain(".arc/user/*/");
    expect(gitignore).not.toContain(".arc/user/new-dev/");
  });
});

describe("user push and pull", () => {
  let tempDir: string;
  let remoteDir: string;
  let cloneDir: string | undefined;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
    remoteDir = await addBareRemote(tempDir);
    cloneDir = undefined;
  });

  afterEach(async () => {
    vi.resetAllMocks();
    mockIsCancel.mockReturnValue(false);
    await cleanupTempDir(tempDir);
    await cleanupTempDir(remoteDir);
    if (cloneDir) await cleanupTempDir(cloneDir);
  });

  async function initRepoWithRemote(identity = "test-user"): Promise<{ repo: string; remote: string }> {
    const repo = await createTempRepo("arc-notes-fetch-");
    await makeCommit(repo, "initial commit");
    const remote = await addBareRemote(repo);
    const recipe = await loadRecipe();
    await runInit({
      cwd: repo,
      io: makeIOContext(repo),
      templateDir: getArcTemplatePath(),
      internalTemplateDir: getInternalTemplatePath(),
      recipe,
      prompts: DEFAULT_PROMPTS,
      identityResult: identity,
    });
    return { repo, remote };
  }

  async function saveUserMemory(repo: string, identity: string, content: string): Promise<string> {
    const io = makeUserIO(repo);
    await writeFile(
      join(repo, ".arc", "user", identity, "WORKING-MEMORY.md"),
      content,
      "utf-8",
    );
    await runUserSave({ cwd: repo, io, identity });
    return readNotesRefTip(repo, identity);
  }

  async function installNotesFetchWildcard(repo: string): Promise<void> {
    await execFileAsync(
      "git",
      [
        "config",
        "--add",
        "remote.origin.fetch",
        "+refs/notes/arc/user/*:refs/notes/arc/user/*",
      ],
      { cwd: repo },
    );
  }

  it("init on a repo with origin keeps branch fetch configured without adding a notes wildcard", async () => {
    const { repo, remote } = await initRepoWithRemote();
    try {
      const refspecs = await readFetchRefspecs(repo);

      expect(refspecs).toContain("+refs/heads/*:refs/remotes/origin/*");
      expect(refspecs).not.toContain("+refs/notes/arc/user/*:refs/notes/arc/user/*");
    } finally {
      await cleanupTempDir(repo);
      await cleanupTempDir(remote);
    }
  });

  it.each([
    ["plain git fetch", ["fetch", "origin"]],
    ["git pull", ["pull"]],
  ])("%s preserves an unpushed local user-notes save", async (_label, args) => {
    const { repo, remote } = await initRepoWithRemote();
    try {
      const io = makeUserIO(repo);
      await saveUserMemory(repo, "test-user", "# Remote baseline\n");
      await runUserPush({ io, identity: "test-user" });
      const localTip = await saveUserMemory(repo, "test-user", "# Local unpushed\n");

      await execFileAsync("git", args, { cwd: repo });

      await expect(readNotesRefTip(repo, "test-user")).resolves.toBe(localTip);
    } finally {
      await cleanupTempDir(repo);
      await cleanupTempDir(remote);
    }
  });

  it("git fetch --prune origin preserves an unpushed local user-notes save when no remote note exists", async () => {
    const { repo, remote } = await initRepoWithRemote();
    try {
      const localTip = await saveUserMemory(repo, "test-user", "# Local only\n");

      await execFileAsync("git", ["fetch", "--prune", "origin"], { cwd: repo });

      await expect(readNotesRefTip(repo, "test-user")).resolves.toBe(localTip);
    } finally {
      await cleanupTempDir(repo);
      await cleanupTempDir(remote);
    }
  });

  it("user status preserves an unpushed local user-notes save while comparing a stale remote note", async () => {
    const { repo, remote } = await initRepoWithRemote();
    try {
      const io = makeUserIO(repo);
      await saveUserMemory(repo, "test-user", "# Remote baseline\n");
      await runUserPush({ io, identity: "test-user" });
      const localTip = await saveUserMemory(repo, "test-user", "# Local unpushed\n");

      await runUserStatus({ cwd: repo, io, identity: "test-user" });

      await expect(readNotesRefTip(repo, "test-user")).resolves.toBe(localTip);
    } finally {
      await cleanupTempDir(repo);
      await cleanupTempDir(remote);
    }
  });

  it("user status ignores a stale configured notes wildcard during its temp fetch", async () => {
    const { repo, remote } = await initRepoWithRemote();
    try {
      const io = makeUserIO(repo);
      await installNotesFetchWildcard(repo);
      await saveUserMemory(repo, "test-user", "# Remote baseline\n");
      await runUserPush({ io, identity: "test-user" });
      const localTip = await saveUserMemory(repo, "test-user", "# Local unpushed\n");

      await runUserStatus({ cwd: repo, io, identity: "test-user" });

      await expect(readNotesRefTip(repo, "test-user")).resolves.toBe(localTip);
    } finally {
      await cleanupTempDir(repo);
      await cleanupTempDir(remote);
    }
  });

  it("push sends notes ref to remote, pull retrieves it in a clone", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note locally
    await writeFile(
      join(userDir, "WORKING-MEMORY.md"),
      "# Portable notes",
      "utf-8",
    );
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Push to remote
    await runUserPush({ io, identity: "test-user" });

    // Verify the note ref exists on the remote
    const { stdout: remoteRefs } = await execFileAsync(
      "git", ["ls-remote", remoteDir],
    );
    expect(remoteRefs).toContain("refs/notes/arc/user/test-user");

    // Clone into a second repo and pull the notes
    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync(
      "git", ["config", "user.email", "clone@test.com"], { cwd: cloneDir },
    );
    await execFileAsync(
      "git", ["config", "user.name", "Clone User"], { cwd: cloneDir },
    );

    const cloneIO = makeUserIO(cloneDir);

    // Pull the notes ref
    await runUserPull({ cwd: cloneDir, io: cloneIO, identity: "test-user" });

    // Load from the pulled note
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });
    const loadResult = await runUserLoad({
      cwd: cloneDir, io: cloneIO, identity: "test-user",
    });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fileCount).toBeGreaterThanOrEqual(1);

    // Verify content arrived
    const restored = await readFile(
      join(cloneUserDir, "WORKING-MEMORY.md"), "utf-8",
    );
    expect(restored).toBe("# Portable notes");
  });

  it("force push overwrites diverged remote", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save and push initial notes
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Version 1", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    // Clone, save different notes, and push from clone (creates divergence)
    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "c@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });
    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });
    await writeFile(join(cloneUserDir, "WORKING-MEMORY.md"), "# Version 2 from clone", "utf-8");
    await runUserSave({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    // Force-push from clone — notes refs diverge since clone doesn't inherit them
    await runUserPush({ io: cloneIO, identity: "test-user", force: true });

    // Now save different notes locally (diverged from remote)
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Version 3 local", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Regular push should refuse the diverged topology before transport.
    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).resolves.toMatchObject({ kind: "refused", reason: "history-diverged" });

    // Force push should succeed
    await runUserPush({ io, identity: "test-user", force: true });

    // A regular pull refuses rather than overwriting the clone's diverged local notes ref.
    await expect(runUserPull({ cwd: cloneDir, io: cloneIO, identity: "test-user" }))
      .resolves.toMatchObject({ kind: "refused-diverged" });
    await runUserLoad({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    const restoredInClone = await readFile(join(cloneUserDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restoredInClone).toBe("# Version 2 from clone");
  });

  it("reconciles a concurrent non-fast-forward via lossless notes-merge, preserving both sides", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // First worktree saves on its current commit and publishes.
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    // A second worktree clones, advances to a different commit, saves a note
    // there, and force-publishes — so the remote notes ref annotates a commit
    // the first worktree's ref does not carry (a disjoint, non-ff divergence).
    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "c@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });
    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });
    await makeCommit(cloneDir, "clone advances HEAD");
    await execFileAsync("git", ["push", "origin", "HEAD:clone-work"], { cwd: cloneDir });
    await writeFile(join(cloneUserDir, "WORKING-MEMORY.md"), "# Clone notes", "utf-8");
    await runUserSave({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    await runUserPush({ io: cloneIO, identity: "test-user", force: true });

    // The first worktree re-saves on its own commit and preflight refuses divergence.
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local notes v2", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).resolves.toMatchObject({ kind: "refused", reason: "history-diverged" });

    // Auto-reconcile: union-merge the divergent refs and re-push, no prompt.
    await execFileAsync("git", ["fetch", "origin", "clone-work"], { cwd: tempDir });
    const result = await pushNotesWithReconcile({ io, identity: "test-user", cwd: tempDir, output: recoveryOutput });
    expect(result).toEqual({ kind: "reconciled" });
    expect(mockSelect).not.toHaveBeenCalled();

    // Lossless: the merged ref carries both worktrees' notes (distinct commits).
    const { stdout: noteList } = await execFileAsync(
      "git", ["notes", "--ref", "arc/user/test-user", "list"], { cwd: tempDir },
    );
    expect(noteList.trim().split("\n").filter(Boolean)).toHaveLength(2);

    // Re-push landed: the remote tip matches the reconciled local tip.
    const localTip = await readNotesRefTip(tempDir, "test-user");
    const { stdout: remoteTip } = await execFileAsync(
      "git", ["ls-remote", remoteDir, "refs/notes/arc/user/test-user"],
    );
    expect(remoteTip.trim().split(/\s+/u)[0]).toBe(localTip);
  });

  it("preserves a clean local merge when the merged publication proof refuses", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "c@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });
    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });
    await makeCommit(cloneDir, "unpublished clone commit");
    await writeFile(join(cloneUserDir, "WORKING-MEMORY.md"), "# Clone notes", "utf-8");
    await runUserSave({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    await runUserPush({ io: cloneIO, identity: "test-user", force: true });

    const remoteBefore = (await execFileAsync(
      "git", ["ls-remote", remoteDir, "refs/notes/arc/user/test-user"],
    )).stdout.trim().split(/\s+/u)[0];
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local notes v2", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    const result = await pushNotesWithReconcile({
      io,
      identity: "test-user",
      cwd: tempDir,
      output: recoveryOutput,
    });
    expect(result).toMatchObject({ kind: "refused", reason: "unpublished-history" });

    const { stdout: noteList } = await execFileAsync(
      "git", ["notes", "--ref", "arc/user/test-user", "list"], { cwd: tempDir },
    );
    expect(noteList.trim().split("\n").filter(Boolean)).toHaveLength(2);
    const remoteAfter = (await execFileAsync(
      "git", ["ls-remote", remoteDir, "refs/notes/arc/user/test-user"],
    )).stdout.trim().split(/\s+/u)[0];
    expect(remoteAfter).toBe(remoteBefore);
  });

  it("surfaces (not silently pushes) a same-commit collision the union cannot resolve", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // First worktree saves on the current commit and publishes.
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Temp v1", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    // A second worktree clones and saves on the SAME commit (no HEAD advance),
    // then force-publishes — so both refs annotate one commit with divergent
    // single-line JSON manifests, the case cat_sort_uniq concatenates into an
    // unparseable note while still exiting 0.
    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "c@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });
    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });
    await writeFile(join(cloneUserDir, "WORKING-MEMORY.md"), "# Clone v1", "utf-8");
    await runUserSave({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    await runUserPush({ io: cloneIO, identity: "test-user", force: true });

    const remoteTipBefore = (await execFileAsync(
      "git", ["ls-remote", remoteDir, "refs/notes/arc/user/test-user"],
    )).stdout.trim().split(/\s+/u)[0];

    // First worktree re-saves on the same commit and preflight refuses divergence.
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Temp v2", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).resolves.toMatchObject({ kind: "refused", reason: "history-diverged" });

    const result = await pushNotesWithReconcile({ io, identity: "test-user", cwd: tempDir, output: recoveryOutput });

    // Surfaced as a conflict — the corrupt union is not silently pushed.
    expect(result.kind).toBe("conflict");

    // Remote untouched: nothing was pushed.
    const remoteTipAfter = (await execFileAsync(
      "git", ["ls-remote", remoteDir, "refs/notes/arc/user/test-user"],
    )).stdout.trim().split(/\s+/u)[0];
    expect(remoteTipAfter).toBe(remoteTipBefore);

    // Local ref rolled back to a parseable note (this worktree's own save).
    const { stdout: localNote } = await execFileAsync(
      "git", ["notes", "--ref", "arc/user/test-user", "show", "HEAD"], { cwd: tempDir },
    );
    expect(() => JSON.parse(localNote) as unknown).not.toThrow();
  });

  it("pull with --identity fetches another developer's notes", async () => {
    const io = makeUserIO(tempDir);

    // Save notes under a different identity
    const otherDir = join(tempDir, ".arc", "user", "other-dev");
    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "WORKING-MEMORY.md"), "# Other dev notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "other-dev" });
    await runUserPush({ io, identity: "other-dev" });

    // Clone and pull the other developer's notes
    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "c@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });
    const cloneIO = makeUserIO(cloneDir);

    // Pull other-dev's notes (not our own identity)
    await runUserPull({ cwd: cloneDir, io: cloneIO, identity: "other-dev" });

    // Load under other-dev identity
    const cloneOtherDir = join(cloneDir, ".arc", "user", "other-dev");
    await mkdir(cloneOtherDir, { recursive: true });
    const result = await runUserLoad({
      cwd: cloneDir, io: cloneIO, identity: "other-dev",
    });
    expect(result).not.toBeNull();

    const restored = await readFile(join(cloneOtherDir, "WORKING-MEMORY.md"), "utf-8");
    expect(restored).toBe("# Other dev notes");
  });

  it("missing remote produces a clear error", async () => {
    const userDir = join(tempDir, ".arc", "user", "test-user");
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local only", "utf-8");
    await runUserSave({ cwd: tempDir, io: makeUserIO(tempDir), identity: "test-user" });

    // Remove the remote
    await execFileAsync("git", ["-C", tempDir, "remote", "remove", "origin"]);
    const io = makeUserIO(tempDir);

    // Push without remote should fail with clear diagnostic
    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).rejects.toThrow(/origin/);

    // Pull without remote returns a typed fetch failure with the underlying diagnostic.
    await expect(
      runUserPull({ cwd: tempDir, io, identity: "test-user" }),
    ).resolves.toMatchObject({
      kind: "remote-unavailable",
      error: expect.objectContaining({ message: expect.stringContaining("origin") }),
    });
  });

  it("hasLocalNotes returns true after save, false before", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // No notes yet
    expect(await hasLocalNotes(io, "test-user")).toBe(false);

    // Save a note
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Now notes exist
    expect(await hasLocalNotes(io, "test-user")).toBe(true);
  });

  it("hasRemoteNotes returns true after push", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // No remote notes yet
    expect(await hasRemoteNotes(io, "test-user")).toBe(false);

    // Save and push
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    expect(await hasRemoteNotes(io, "test-user")).toBe(true);
  });

  it("warns on no-op push when matching local and remote notes are stale for HEAD", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Saved before new work", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ cwd: tempDir, io, identity: "test-user" });
    await makeCommit(tempDir, "work after save");

    mockLog.warn.mockClear();
    mockLog.info.mockClear();
    mockSpinner.stop.mockClear();

    const result = await pushNotesWithReconcile({ io, identity: "test-user", cwd: tempDir, output: recoveryOutput });

    expect(result).toEqual({ kind: "noop" });
    expect(mockSpinner.stop).toHaveBeenCalledWith(
      "Remote user notes already match local user notes.",
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Latest local user note is attached to a commit 1 commit(s) behind HEAD.",
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      "Run `arc user save` or `arc sync` before relying on handoff.",
    );
  });

  it("clears a partial-push marker when arc user push recovers the notes ref", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Needs push", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const localRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await writePartialPushMarker(tempDir, "test-user", localRefHash, head.trim());

    await runUserPush({ cwd: tempDir, io, identity: "test-user" });
    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");

    expect(syncState).not.toHaveProperty("partialPush");
    expect(await hasRemoteNotes(io, "test-user")).toBe(true);
  });

  it("clears a partial-push marker when arc user push no-ops because remote already matches", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Already pushed", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ cwd: tempDir, io, identity: "test-user" });
    const localRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await writePartialPushMarker(tempDir, "test-user", localRefHash, head.trim());

    await runUserPush({ cwd: tempDir, io, identity: "test-user" });
    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");

    expect(syncState).not.toHaveProperty("partialPush");
  });
});

describe("user status", () => {
  let tempDir: string;
  let remoteDir: string;
  let cloneDir: string | undefined;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
    remoteDir = await addBareRemote(tempDir);
    cloneDir = undefined;
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    await cleanupTempDir(remoteDir);
    if (cloneDir) await cleanupTempDir(cloneDir);
  });

  it("reads current after a removal-bearing save and stays current across repeats", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");
    const wmEntry = (header: string): string => `**${header}:**\n_Remove when: x._\n\n${header} body.`;
    const wmFile = (...entries: string[]): string =>
      `# Working Memory\n\n## Memories\n\n${entries.join("\n\n")}\n\n---\n`;
    const wmPath = join(userDir, "WORKING-MEMORY.md");

    await writeFile(wmPath, wmFile(wmEntry("Kept"), wmEntry("Dropped")), "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Remove an entry and save again — the note gains a `## Removed:` tombstone the disk never carries.
    await writeFile(wmPath, wmFile(wmEntry("Kept")), "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    const afterRemoval = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    expect(afterRemoval.diskStatus).toBe("current");

    // A second save with no disk edits, then status, stays current across the loop.
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const afterRepeat = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    expect(afterRepeat.diskStatus).toBe("current");
  });

  it("recognizes a HEAD-ancestor note as a save and clears to current-head after a follow-up save", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    // Advance HEAD so the pushed note now sits on an ancestor commit; remote stays in sync.
    await makeCommit(tempDir, "second commit");

    const ancestorState = await inspectUserSyncState({ cwd: tempDir, io, identity: "test-user" });
    expect(ancestorState.remoteStatus).toBe("in sync");
    expect(ancestorState.localNoteFreshness?.state).toBe("ancestor");
    expect(decideSyncAction(ancestorState)).toBe("push");

    // A save attaches a note to current HEAD; freshness returns to current-head.
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const afterSave = await inspectUserSyncState({ cwd: tempDir, io, identity: "test-user" });
    expect(afterSave.localNoteFreshness?.state).toBe("current-head");
  });

  it("reports stale after a later cross-WU update lands on an older commit", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");
    const olderCommit = await readHead(tempDir);
    await makeCommit(tempDir, "middle commit");
    const savedHead = await makeCommit(tempDir, "current commit");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Saved descendant", "utf-8");
    const saveResult = await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await io.writeNote(
      "arc/user/test-user",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "# Older arrival" } }),
      olderCommit,
    );

    const status = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const state = await inspectUserSyncState({ cwd: tempDir, io, identity: "test-user" });

    expect(status.savedCommit).toBe(saveResult.commit);
    expect(status.diskStatus).toBe("stale");
    expect(status.actionHint).toBe("run `arc user load`");
    expect(status.savedFromAncestor).toBe(false);
    expect(status.ancestorDistance).toBe(0);
    expect(status.savedReachableFromHead).toBe(true);
    expect(state.localNoteFreshness).toMatchObject({
      state: "current-head",
      commit: savedHead,
      reachableFromHead: true,
      ancestorDistance: 0,
    });
  });

  it("reports the descendant save as current after re-anchoring its manifest to an older commit", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");
    const olderCommit = await readHead(tempDir);
    await makeCommit(tempDir, "middle commit");
    const savedHead = await makeCommit(tempDir, "current commit");
    const savedContent = "# Saved descendant";

    await writeFile(join(userDir, "WORKING-MEMORY.md"), savedContent, "utf-8");
    const saveResult = await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await io.writeNote(
      "arc/user/test-user",
      JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": savedContent } }),
      olderCommit,
    );

    const status = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const state = await inspectUserSyncState({ cwd: tempDir, io, identity: "test-user" });

    expect(status.savedCommit).toBe(saveResult.commit);
    expect(status.diskStatus).toBe("current");
    expect(status.savedFromAncestor).toBe(false);
    expect(status.ancestorDistance).toBe(0);
    expect(status.savedReachableFromHead).toBe(true);
    expect(state.localNoteFreshness).toMatchObject({
      state: "current-head",
      commit: savedHead,
      reachableFromHead: true,
      ancestorDistance: 0,
    });
  });

  it("reports remote-ahead status with an actionable pull hint", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "clone@test.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });

    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });

    const result = await runUserStatus({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    const summary = buildUserStatusSummary(result);

    expect(result.headline).toBe("remote note ahead");
    expect(summary).toContain("test-user: remote notes are ahead of local notes");
    expect(summary).toContain("Remote notes: ahead of local notes.");
    expect(summary).toContain("Working files match the latest local git note.");
    expect(summary).toContain("Next step: run `arc user pull`");
  });

  it("reports stale-on-disk status offline with a load hint when saved content was overwritten locally", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified locally", "utf-8");
    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    await unlink(join(userDir, ".internal", ".sync-state.json"));
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified after load", "utf-8");

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const summary = buildUserStatusSummary(result);

    expect(result.headline).toBe("git note out of date");
    expect(summary).toContain("test-user: working files differ from local notes (offline)");
    expect(summary).toContain("Remote notes: match local notes.");
    expect(summary).toContain("Working files reflect an older local git note.");
    expect(summary).toContain("Pre-load backup present: .pre-load-backup-");
    expect(summary).toContain("Next step: run `arc user load`");
    expect(result.unsavedDirection).toBe("modified");
    expect(result.savedAtRelative).toMatch(/^(just now|\d+ (minute|hour|day)s? ago)$/u);
  });

  it("reports local-unsaved when disk changes after load and local sync provenance is present", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified locally", "utf-8");
    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified after load", "utf-8");

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const summary = buildUserStatusSummary(result);

    expect(result.headline).toBe("git note out of date");
    expect(summary).toContain("test-user: working files differ from local notes (offline)");
    expect(summary).toContain("Remote notes: match local notes.");
    expect(summary).toContain("Working files have changed since the latest local git note.");
    expect(summary).toContain("Next step: run `arc user save`");
    expect(result.unsavedDirection).toBe("modified");
  });

  it("reports local-unsaved status with a save hint when disk has local-only files", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "scratch.md"), "# Local scratch", "utf-8");

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const summary = buildUserStatusSummary(result);

    expect(result.headline).toBe("git note out of date");
    expect(summary).toContain("test-user: working files differ from local notes (offline)");
    expect(summary).toContain("Remote notes: match local notes.");
    expect(summary).toContain("Working files have changed since the latest local git note.");
    expect(summary).toContain("Next step: run `arc user save`");
    expect(result.unsavedDirection).toBe("edits");
  });

  it("uses save provenance to prefer save when disk matches a newer local-only state", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified locally", "utf-8");

    const modifiedHash = await hashUserDir(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await writeLocalSyncStateFixture(tempDir, "test-user", {
      version: 2,
      materializedManifestHash: modifiedHash,
      sourceCommit: head.trim(),
      sourceOperation: "save",
    });

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const summary = buildUserStatusSummary(result);

    expect(result.diskStatus).toBe("local unsaved");
    expect(summary).toContain("Next step: run `arc user save`");
  });

  it("uses legacy load provenance to prefer load when no shared baseline stamp exists", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Modified locally", "utf-8");

    const modifiedHash = await hashUserDir(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await rm(await getMaterializedBaselineStampPath(io.exec, tempDir, "test-user"), { force: true });
    await writeLocalSyncStateFixture(tempDir, "test-user", {
      version: 2,
      materializedManifestHash: modifiedHash,
      sourceCommit: head.trim(),
      sourceOperation: "load",
    });

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user", offline: true });
    const summary = buildUserStatusSummary(result);

    expect(result.diskStatus).toBe("stale");
    expect(summary).toContain("Next step: run `arc user load`");
  });

  it("recommends load instead of save when the notes ref advanced without disk materialization", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Materialized", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    const mergedManifest = {
      version: 2,
      files: {
        "WORKING-MEMORY.md": "# Materialized",
        "USER-INBOX.md": "# Incoming",
      },
    };
    await execFileAsync(
      "git",
      ["notes", "--ref", "arc/user/test-user", "add", "-f", "-m", JSON.stringify(mergedManifest), "HEAD"],
      { cwd: tempDir },
    );

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const summary = buildUserStatusSummary(result);

    expect(result.diskStatus).toBe("stale");
    expect(result.actionHint).toBe("run `arc user load`");
    expect(summary).toContain("Next step: run `arc user load`");
    expect(summary).not.toContain("Next step: run `arc user save`");
  });

  it("reports a validated partial-push marker when local notes are still ahead of remote", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Saved locally", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const localRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await writePartialPushMarker(tempDir, "test-user", localRefHash, head.trim());

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const summary = buildUserStatusSummary(result);

    expect(result.refState).toBe("local-ahead");
    expect(result.spineState).toBe("clean");
    expect(result.coherenceState).toBe("partial-push");
    expect(summary).toContain("Partial push recovery:");
    expect(summary).toContain("Next step: run `arc user push` to retry the notes push");
  });

  it("keeps an ancestor-keyed partial-push marker when a sibling save advances the local ref", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# First save", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const staleRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Second save", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writePartialPushMarker(tempDir, "test-user", staleRefHash, head.trim());

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");

    expect(result.refState).toBe("local-ahead");
    expect(result.coherenceState).toBe("partial-push");
    expect(syncState.partialPush).toEqual({ localRefHash: staleRefHash, sourceCommit: head.trim() });
  });

  it("ignores but preserves a partial-push marker whose recorded tip is no longer an ancestor", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# First save", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const staleRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });

    await execFileAsync("git", ["update-ref", "-d", "refs/notes/arc/user/test-user"], { cwd: tempDir });
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Force-moved save", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writePartialPushMarker(tempDir, "test-user", staleRefHash, head.trim());

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");

    expect(result.refState).toBe("local-ahead");
    expect(result.coherenceState).toBeUndefined();
    expect(syncState.partialPush).toEqual({ localRefHash: staleRefHash, sourceCommit: head.trim() });
  });

  it("ignores but preserves a partial-push marker when remote notes already match local notes", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Pushed", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });
    const localRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await writePartialPushMarker(tempDir, "test-user", localRefHash, head.trim());

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");

    expect(result.refState).toBe("same");
    expect(result.spineState).toBe("clean");
    expect(result.coherenceState).toBeUndefined();
    expect(syncState.partialPush).toEqual({ localRefHash, sourceCommit: head.trim() });
  });

  it("reports partial-push verification uncertainty when remote notes are unavailable", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Saved locally", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const localRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
    await writePartialPushMarker(tempDir, "test-user", localRefHash, head.trim());
    await execFileAsync("git", ["remote", "remove", "origin"], { cwd: tempDir });

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const summary = buildUserStatusSummary(result);

    expect(result.refState).toBe("remote-unavailable");
    expect(result.coherenceState).toBe("partial-push-unverified");
    expect(summary).toContain("Partial push recovery cannot be verified");
  });

  it("lists remote identities when --all-style inspection is requested", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");
    const otherDir = join(tempDir, ".arc", "user", "other-dev");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Test user", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "WORKING-MEMORY.md"), "# Other dev", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "other-dev" });
    await runUserPush({ io, identity: "other-dev" });

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user", all: true });
    const summary = buildUserStatusSummary(result);

    expect(summary).toContain("Remote identities:");
    expect(summary).toContain("other-dev");
    expect(summary).toContain("test-user");
  });

  it("reports session-init remote-ahead state without mutating local notes", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Local", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "clone@test.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });

    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });

    const result = await runUserSessionInitStatus({
      cwd: cloneDir,
      io: cloneIO,
      identity: "test-user",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-ahead");
    expect(result.shouldPromptToPull).toBe(true);

    await expect(readFile(join(cloneUserDir, "WORKING-MEMORY.md"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports session-init stale local-note freshness when matching refs are behind HEAD", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Saved before new HEAD", "utf-8");
    const saveResult = await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });
    await makeCommit(tempDir, "advance after save");

    const result = await runUserSessionInitStatus({
      cwd: tempDir,
      io,
      identity: "test-user",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.localNoteFreshness).toMatchObject({
      state: "ancestor",
      commit: expect.stringMatching(new RegExp(`^${saveResult.commit}`)),
      ancestorDistance: 1,
      reachableFromHead: true,
    });
    expect(result.detailLines).toContain(
      `Latest local user note is from ${saveResult.commit}, 1 commit(s) behind HEAD.`,
    );
    expect(result.actionHint).toBe("run `arc user save` or `arc sync` before relying on handoff");
  });

  // --- Worktree drift qualifier (real exec) ---
  //
  // Verifies that `runUserStatus` orchestrates a real `runWorktreeSyncStatus`
  // probe end-to-end against a bare-remote fixture and routes its verdict
  // into `detailLines` via `formatWorktreeQualifierLine`. The qualifier
  // vocabulary itself is unit-covered exhaustively at
  // `__tests__/unit/user-status.test.ts` in the worktree qualifier coverage;
  // these tests prove the wiring through the real exec layer.

  it("emits a worktree drift qualifier when origin is ahead", async () => {
    // Advance HEAD, push to bare, then reset local one commit back so origin
    // is ahead of local by 1. (`addBareRemote` already pushed the initial
    // commit during `beforeEach`; here we layer a second commit on top, then
    // rewind locally.)
    await makeCommit(tempDir, "future commit");
    await execFileAsync("git", ["push"], { cwd: tempDir });
    await execFileAsync("git", ["reset", "--hard", "HEAD~1"], { cwd: tempDir });

    const io = makeUserIO(tempDir);
    const result = await runUserStatus({
      cwd: tempDir,
      io,
      identity: "test-user",
      remoteSyncEnabled: true,
    });

    expect(result.detailLines).toContain(
      "Local worktree HEAD is behind its origin upstream by 1 commit(s).",
    );
    expect(result.worktree?.state).toBe("remote-ahead");
    expect(result.worktree?.behind).toBe(1);
  });

  it("substitutes an offline note when --offline is set with remote_sync enabled", async () => {
    // Set up the same drift, but exercise `--offline` — the worktree probe
    // should not run, and the offline-scope note should appear in place of
    // the drift qualifier.
    await makeCommit(tempDir, "future commit");
    await execFileAsync("git", ["push"], { cwd: tempDir });
    await execFileAsync("git", ["reset", "--hard", "HEAD~1"], { cwd: tempDir });

    const io = makeUserIO(tempDir);
    const result = await runUserStatus({
      cwd: tempDir,
      io,
      identity: "test-user",
      offline: true,
      remoteSyncEnabled: true,
    });

    expect(result.detailLines).toContain(
      "Worktree remote comparison skipped (`--offline`); reported state reflects local worktree refs only.",
    );
    expect(
      result.detailLines.some((line) => line.startsWith("Local worktree HEAD is behind")),
    ).toBe(false);
    // No worktree probe was invoked, so the field is omitted.
    expect(result.worktree).toBeUndefined();
  });
});

describe("user open", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("seeds SESSION-NOTES.md from template into user/{identity}/{wuName}/", async () => {
    const io = makeUserIO(tempDir);

    await runUserOpen({
      cwd: tempDir,
      io,
      identity: "test-user",
      wuName: "feature-x",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const sessionNotes = await readFile(
      join(tempDir, ".arc", "user", "test-user", "feature-x", "SESSION-NOTES.md"),
      "utf-8",
    );
    const template = await readFile(
      join(getInternalTemplatePath(), "user", "SESSION-NOTES.md"),
      "utf-8",
    );
    expect(sessionNotes).toBe(template);
  });

  it("uses a caller-supplied SESSION-NOTES seed when provided", async () => {
    const io = makeUserIO(tempDir);
    const seed = "# Session Notes\n\n## Handoff Metadata\n\n**Working On:** meta-feature-x.md\n";

    await runUserOpen({
      cwd: tempDir,
      io,
      identity: "test-user",
      wuName: "feature-x",
      internalTemplateDir: getInternalTemplatePath(),
      sessionNotesSeed: seed,
    });

    await expect(
      readFile(
        join(tempDir, ".arc", "user", "test-user", "feature-x", "SESSION-NOTES.md"),
        "utf-8",
      ),
    ).resolves.toBe(seed);
  });

  it("idempotent on second invocation — preserves existing SESSION-NOTES edits", async () => {
    const io = makeUserIO(tempDir);

    await runUserOpen({
      cwd: tempDir,
      io,
      identity: "test-user",
      wuName: "feature-x",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const seedPath = join(tempDir, ".arc", "user", "test-user", "feature-x", "SESSION-NOTES.md");
    const customContent = "# Custom session notes\n\nIn-flight edits.\n";
    await writeFile(seedPath, customContent, "utf-8");

    await runUserOpen({
      cwd: tempDir,
      io,
      identity: "test-user",
      wuName: "feature-x",
      internalTemplateDir: getInternalTemplatePath(),
    });

    expect(await readFile(seedPath, "utf-8")).toBe(customContent);
  });

  it("findStaleUserWuSubdirs returns other WU subdirs sorted, excluding the target", async () => {
    const io = makeUserIO(tempDir);
    const tplDir = getInternalTemplatePath();

    await runUserOpen({ cwd: tempDir, io, identity: "test-user", wuName: "alpha", internalTemplateDir: tplDir });
    await runUserOpen({ cwd: tempDir, io, identity: "test-user", wuName: "bravo", internalTemplateDir: tplDir });

    const stale = await findStaleUserWuSubdirs({
      cwd: tempDir, io, identity: "test-user", wuName: "alpha",
    });
    expect(stale).toEqual(["bravo"]);
  });

  it("findStaleUserWuSubdirs returns [] when no other WU subdirs exist", async () => {
    const io = makeUserIO(tempDir);

    await runUserOpen({
      cwd: tempDir, io, identity: "test-user", wuName: "alpha",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const stale = await findStaleUserWuSubdirs({
      cwd: tempDir, io, identity: "test-user", wuName: "alpha",
    });
    expect(stale).toEqual([]);
  });

  it("listUserWuSubdirContents returns the subdir's file entries", async () => {
    const io = makeUserIO(tempDir);

    await runUserOpen({
      cwd: tempDir, io, identity: "test-user", wuName: "alpha",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const entries = await listUserWuSubdirContents({
      cwd: tempDir, io, identity: "test-user", subdir: "alpha",
    });
    expect(entries.map((e) => e.name)).toContain("SESSION-NOTES.md");
  });

  it("removeStaleUserWuSubdir removes the subdir recursively", async () => {
    const io = makeUserIO(tempDir);

    await runUserOpen({
      cwd: tempDir, io, identity: "test-user", wuName: "alpha",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const staleSeed = join(tempDir, ".arc", "user", "test-user", "alpha", "SESSION-NOTES.md");
    await expect(readFile(staleSeed, "utf-8")).resolves.toBeTruthy();

    await removeStaleUserWuSubdir({
      cwd: tempDir, identity: "test-user", subdir: "alpha",
    });

    await expect(readFile(staleSeed, "utf-8")).rejects.toThrow();
  });
});

describe("user close", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("removes user/{identity}/<wu-name>/ recursively for the same WU as `arc user open`", async () => {
    const io = makeUserIO(tempDir);

    await runUserOpen({
      cwd: tempDir, io, identity: "test-user", wuName: "feature-x",
      internalTemplateDir: getInternalTemplatePath(),
    });
    const seedPath = join(tempDir, ".arc", "user", "test-user", "feature-x", "SESSION-NOTES.md");
    await expect(readFile(seedPath, "utf-8")).resolves.toBeTruthy();

    await runUserClose({ cwd: tempDir, identity: "test-user", wuName: "feature-x" });

    await expect(readFile(seedPath, "utf-8")).rejects.toThrow();
  });

  it("idempotent on absent subdir — no error when nothing to remove", async () => {
    await expect(
      runUserClose({ cwd: tempDir, identity: "test-user", wuName: "never-opened" }),
    ).resolves.toBeUndefined();
  });
});
