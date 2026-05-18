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
  initInTempRepo,
  makeUserIO,
  makeCommit,
  addBareRemote,
  execFileAsync,
  getInternalTemplatePath,
  DEFAULT_PROMPTS,
} from "../helpers/integration.js";
import { serialize } from "../../src/lib/git/index.js";
import { hashSyncManifest } from "../../src/commands/user/save-load.js";
import {
  runUserSave,
  runUserLoad,
  runUserAdd,
  runUserClose,
  runUserOpen,
  findStaleUserWuSubdirs,
  listUserWuSubdirContents,
  removeStaleUserWuSubdir,
  runUserPush,
  runUserPull,
  runUserSessionInitStatus,
  runUserStatus,
  UserSaveError,
  BACKUP_FILENAME,
  hasLocalNotes,
  hasRemoteNotes,
  buildUserStatusSummary,
  type UserLoadOutcome,
  type UserLoadResult,
} from "../../src/commands/user.js";
import { pushWithInteractiveRecovery } from "../../src/handlers/push-recovery.js";
import { createSyncOutput } from "../../src/lib/sync-output.js";

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

function expectLoaded(result: UserLoadOutcome | null): UserLoadResult {
  expect(result).not.toBeNull();
  expect(result?.kind).toBe("loaded");
  return result as UserLoadResult;
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
  const userDir = join(tempDir, ".arc", "user", identity);
  const io = makeUserIO(tempDir);
  const result = await serialize(userDir, io.readDir, io.readFile);
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
    // Full init creates user directory with SESSION-NOTES.md
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

    // Add some content to SESSION-NOTES.md
    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
      "# Session Notes\nWorking on feature X",
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
      join(userDir, "SESSION-NOTES.md"),
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
      join(userDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Session Notes\nWorking on feature X");
  });

  it("load walks ancestors when HEAD has no note", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
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
      join(userDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Ancestor content");
  });

  it("load finds a reachable note beyond the old 20-commit window", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Deep reachable note", "utf-8");
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

    const restored = await readFile(join(userDir, "SESSION-NOTES.md"), "utf-8");
    expect(restored).toBe("# Deep reachable note");
  });

  it("load finds a note attached outside current HEAD ancestry", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await execFileAsync("git", ["-C", tempDir, "checkout", "-b", "side-session"]);
    await makeCommit(tempDir, "side session work");
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Side session note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await execFileAsync("git", ["-C", tempDir, "checkout", "main"]);
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.reachableFromHead).toBe(false);
    expect(loadedResult.noteHistoryDistance).toBe(0);

    const restored = await readFile(join(userDir, "SESSION-NOTES.md"), "utf-8");
    expect(restored).toBe("# Side session note");
  });

  it("load finds a note when the annotated local branch is gone", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await execFileAsync("git", ["-C", tempDir, "checkout", "-b", "finished-elsewhere"]);
    await makeCommit(tempDir, "finished elsewhere work");
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Branch gone note", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await execFileAsync("git", ["-C", tempDir, "checkout", "main"]);
    await execFileAsync("git", ["-C", tempDir, "branch", "-D", "finished-elsewhere"]);

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.reachableFromHead).toBe(false);

    const restored = await readFile(join(userDir, "SESSION-NOTES.md"), "utf-8");
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
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Merge ancestor", "utf-8");
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

    const restored = await readFile(join(userDir, "SESSION-NOTES.md"), "utf-8");
    expect(restored).toBe("# Merge ancestor");
  });

  it("load handles shallow clone gracefully", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note on current commit
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Shallow test", "utf-8");
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

    const restored = await readFile(join(shallowUserDir, "SESSION-NOTES.md"), "utf-8");
    expect(restored).toBe("# Shallow test");

    await cleanupTempDir(shallowDir);
    await cleanupTempDir(remoteDir);
  });

  it("load finds note-ref history in a shallow clone when annotated commit is beyond boundary", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Deep note", "utf-8");
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

    const loadResult = await runUserLoad({
      cwd: shallowDir, io: shallowIO, identity: "test-user", maxAncestorWalk: 1,
    });

    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.reachableFromHead).toBe(false);
    expect(loadedResult.noteHistoryDistance).toBe(0);

    const restored = await readFile(join(shallowUserDir, "SESSION-NOTES.md"), "utf-8");
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
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Modify local file
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified locally", "utf-8");

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
    expect(backup.files["SESSION-NOTES.md"]).toBe("# Modified locally");
  });

  it("skips backup gracefully when user dir does not exist", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "new-user");

    // Save as test-user, then try loading as new-user (no dir yet)
    const existingUserDir = join(tempDir, ".arc", "user", "test-user");
    await writeFile(join(existingUserDir, "SESSION-NOTES.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Create a note for new-user by saving manually
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# New user", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "new-user" });

    // Remove the dir to simulate first load on a fresh clone
    await rm(userDir, { recursive: true, force: true });

    // Load should succeed without backup (dir doesn't exist)
    const result = await runUserLoad({ cwd: tempDir, io, identity: "new-user" });
    const loadedResult = expectLoaded(result);
    expect(loadedResult.warnings).toEqual([]);

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

    // Save with just SESSION-NOTES
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Add an extra local file that won't be in the manifest
    await writeFile(join(userDir, "local-only.txt"), "local stuff", "utf-8");

    // Load — should warn about local-only.txt
    const result = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    const loadedResult = expectLoaded(result);
    expect(loadedResult.warnings).toHaveLength(1);
    expect(loadedResult.warnings[0]).toContain("local-only.txt");
    expect(loadedResult.warnings[0]).toContain("not in saved manifest");
  });

  it("backup excludes dotfiles from serialization", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save initial state
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# First", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Modify and create a dotfile
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Second", "utf-8");
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
    expect(backup.files["SESSION-NOTES.md"]).toBe("# Second");
  });

  it("retains only the latest three timestamped backups", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    for (let i = 1; i <= 4; i++) {
      await writeFile(join(userDir, "SESSION-NOTES.md"), `# Local ${i}`, "utf-8");
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
    expect(manifests.map((manifest) => manifest.files["SESSION-NOTES.md"]).sort()).toEqual([
      "# Local 2",
      "# Local 3",
      "# Local 4",
    ]);
  });

  it("keeps legacy backup files visible while pruning timestamped snapshots", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, BACKUP_FILENAME), JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "# Legacy" } }));

    for (let i = 1; i <= 4; i++) {
      await writeFile(join(userDir, "SESSION-NOTES.md"), `# Local ${i}`, "utf-8");
      await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    }

    const backups = await listBackupFiles(userDir);
    expect(backups).toContain(BACKUP_FILENAME);
    expect(backups.filter((name) => name !== BACKUP_FILENAME)).toHaveLength(3);
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

  it("round-trips files in subdirectories", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Reset to a known minimal structure — init-seeded files would otherwise
    // inflate the save count and obscure the round-trip assertion.
    await rm(userDir, { recursive: true, force: true });
    await mkdir(join(userDir, "drafts"), { recursive: true });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Notes", "utf-8");
    await writeFile(join(userDir, "drafts", "idea.md"), "# Draft idea", "utf-8");

    // Save
    const saveResult = await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    expect(saveResult.fileCount).toBe(2);

    // Delete everything and reload
    await rm(userDir, { recursive: true, force: true });

    const loadResult = await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    const loadedResult = expectLoaded(loadResult);
    expect(loadedResult.fileCount).toBe(2);

    // Verify nested file was restored
    const restored = await readFile(join(userDir, "drafts", "idea.md"), "utf-8");
    expect(restored).toBe("# Draft idea");
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

  it("creates user directory with SESSION-NOTES.md, WORKING-MEMORY.md, and USER-INBOX.md", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const userDir = join(tempDir, ".arc", "user", "new-dev");
    expect(await readFile(join(userDir, "SESSION-NOTES.md"), "utf-8")).toContain("Session Notes");
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

  it("push sends notes ref to remote, pull retrieves it in a clone", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note locally
    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
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
      join(cloneUserDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Portable notes");
  });

  it("force push overwrites diverged remote", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save and push initial notes
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Version 1", "utf-8");
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
    await writeFile(join(cloneUserDir, "SESSION-NOTES.md"), "# Version 2 from clone", "utf-8");
    await runUserSave({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    // Force-push from clone — notes refs diverge since clone doesn't inherit them
    await runUserPush({ io: cloneIO, identity: "test-user", force: true });

    // Now save different notes locally (diverged from remote)
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Version 3 local", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Regular push should fail with divergence error
    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).rejects.toThrow(/rejected/);

    // Force push should succeed
    await runUserPush({ io, identity: "test-user", force: true });

    // Verify remote has our version (force pull — refs diverged)
    await runUserPull({ cwd: cloneDir, io: cloneIO, identity: "test-user", force: true });
    await runUserLoad({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    const restoredInClone = await readFile(join(cloneUserDir, "SESSION-NOTES.md"), "utf-8");
    expect(restoredInClone).toBe("# Version 3 local");
  });

  it("merge recovery preserves local disk state and rebases the save onto the remote notes base", async () => {
    mockSelect.mockResolvedValue("merge");
    const originalIsTTY = process.stdin.isTTY;
    const originalCI = process.env.CI;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    delete process.env.CI;

    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Version 1", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "c@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "Clone User"], { cwd: cloneDir });
    const cloneIO = makeUserIO(cloneDir);
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });

    await writeFile(join(cloneUserDir, "SESSION-NOTES.md"), "# Version 2 from clone", "utf-8");
    await runUserSave({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
    await runUserPush({ io: cloneIO, identity: "test-user", force: true });

    const remoteTipBeforeRecovery = await readNotesRefTip(cloneDir, "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Version 3 local", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).rejects.toThrow(/rejected/);

    try {
      const result = await pushWithInteractiveRecovery({ io, identity: "test-user", cwd: tempDir, output: recoveryOutput });
      expect(result).toEqual({ kind: "ok-recovered", via: "merge" });

      const diskContent = await readFile(join(userDir, "SESSION-NOTES.md"), "utf-8");
      expect(diskContent).toBe("# Version 3 local");

      const localTipAfterRecovery = await readNotesRefTip(tempDir, "test-user");
      expect(localTipAfterRecovery).not.toBe(remoteTipBeforeRecovery);
      await expect(
        execFileAsync(
          "git",
          ["merge-base", "--is-ancestor", remoteTipBeforeRecovery, localTipAfterRecovery],
          { cwd: tempDir },
        ),
      ).resolves.toBeDefined();

      const { stdout: remoteTipAfterPush } = await execFileAsync(
        "git",
        ["ls-remote", remoteDir, "refs/notes/arc/user/test-user"],
      );
      expect(remoteTipAfterPush.trim().split(/\s+/u)[0]).toBe(localTipAfterRecovery);

      await runUserPull({ cwd: cloneDir, io: cloneIO, identity: "test-user", force: true });
      await runUserLoad({ cwd: cloneDir, io: cloneIO, identity: "test-user" });
      const restoredInClone = await readFile(join(cloneUserDir, "SESSION-NOTES.md"), "utf-8");
      expect(restoredInClone).toBe("# Version 3 local");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
      if (originalCI === undefined) {
        delete process.env.CI;
      } else {
        process.env.CI = originalCI;
      }
    }
  });

  it("pull with --identity fetches another developer's notes", async () => {
    const io = makeUserIO(tempDir);

    // Save notes under a different identity
    const otherDir = join(tempDir, ".arc", "user", "other-dev");
    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "SESSION-NOTES.md"), "# Other dev notes", "utf-8");
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

    const restored = await readFile(join(cloneOtherDir, "SESSION-NOTES.md"), "utf-8");
    expect(restored).toBe("# Other dev notes");
  });

  it("missing remote produces a clear error", async () => {
    // Remove the remote
    await execFileAsync("git", ["-C", tempDir, "remote", "remove", "origin"]);
    const io = makeUserIO(tempDir);

    // Push without remote should fail with clear diagnostic
    await expect(
      runUserPush({ io, identity: "test-user" }),
    ).rejects.toThrow(/origin/);

    // Pull without remote should fail with clear diagnostic
    await expect(
      runUserPull({ cwd: tempDir, io, identity: "test-user" }),
    ).rejects.toThrow(/origin/);
  });

  it("hasLocalNotes returns true after save, false before", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // No notes yet
    expect(await hasLocalNotes(io, "test-user")).toBe(false);

    // Save a note
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Notes", "utf-8");
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
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Notes", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    expect(await hasRemoteNotes(io, "test-user")).toBe(true);
  });

  it("warns on no-op push when matching local and remote notes are stale for HEAD", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Saved before new work", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ cwd: tempDir, io, identity: "test-user" });
    await makeCommit(tempDir, "work after save");

    mockLog.warn.mockClear();
    mockLog.info.mockClear();
    mockSpinner.stop.mockClear();

    const result = await pushWithInteractiveRecovery({ io, identity: "test-user", cwd: tempDir, output: recoveryOutput });

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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Needs push", "utf-8");
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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Already pushed", "utf-8");
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

  it("reports remote-ahead status with an actionable pull hint", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Local", "utf-8");
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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified locally", "utf-8");
    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    await unlink(join(userDir, ".internal", ".sync-state.json"));
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified after load", "utf-8");

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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified locally", "utf-8");
    await runUserLoad({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified after load", "utf-8");

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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified locally", "utf-8");

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

  it("uses load provenance to prefer load when disk matches a previously loaded older state", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Original", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Modified locally", "utf-8");

    const modifiedHash = await hashUserDir(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });
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

  it("reports a validated partial-push marker when local notes are still ahead of remote", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Saved locally", "utf-8");
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

  it("clears a stale partial-push marker when the local notes ref has moved", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# First save", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    const staleRefHash = await readNotesRefTip(tempDir, "test-user");
    const { stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir });

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Second save", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await writePartialPushMarker(tempDir, "test-user", staleRefHash, head.trim());

    const result = await runUserStatus({ cwd: tempDir, io, identity: "test-user" });
    const syncState = await readLocalSyncStateFixture(tempDir, "test-user");

    expect(result.refState).toBe("local-ahead");
    expect(result.coherenceState).toBeUndefined();
    expect(syncState).not.toHaveProperty("partialPush");
  });

  it("clears a partial-push marker when remote notes already match local notes", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Pushed", "utf-8");
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
    expect(syncState).not.toHaveProperty("partialPush");
  });

  it("reports partial-push verification uncertainty when remote notes are unavailable", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Saved locally", "utf-8");
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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Test user", "utf-8");
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });
    await runUserPush({ io, identity: "test-user" });

    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "SESSION-NOTES.md"), "# Other dev", "utf-8");
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

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Local", "utf-8");
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

    await expect(readFile(join(cloneUserDir, "SESSION-NOTES.md"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("reports session-init stale local-note freshness when matching refs are behind HEAD", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Saved before new HEAD", "utf-8");
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
    expect(sessionNotes).toContain("Session Notes");
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
