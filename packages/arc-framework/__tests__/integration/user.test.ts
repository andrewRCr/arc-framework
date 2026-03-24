/**
 * Integration tests for the user command (save/load/add).
 *
 * Runs against real temporary git repos with real git notes to verify
 * serialization round-trips, ancestor walking, and user directory management.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
import {
  runUserSave,
  runUserLoad,
  runUserAdd,
  runUserPush,
  runUserPull,
  UserSaveError,
} from "../../src/commands/user.js";

// --- Tests ---

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
    expect(loadResult).not.toBeNull();
    expect(loadResult!.fileCount).toBe(saveResult.fileCount);
    expect(loadResult!.fromAncestor).toBe(false);

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
    expect(loadResult).not.toBeNull();
    expect(loadResult!.fromAncestor).toBe(true);

    const restored = await readFile(
      join(userDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Ancestor content");
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
});

describe("user add", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "first-user");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates user directory with SESSION-NOTES.md", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
      pmMode: "none",
    });

    const sessionNotes = await readFile(
      join(tempDir, ".arc", "user", "new-dev", "SESSION-NOTES.md"),
      "utf-8",
    );
    expect(sessionNotes).toContain("Session Notes");
  });

  it("includes ATOMIC-INBOX.md when pm.mode is arc-in-git", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
      pmMode: "arc-in-git",
    });

    const inbox = await readFile(
      join(tempDir, ".arc", "user", "new-dev", "ATOMIC-INBOX.md"),
      "utf-8",
    );
    expect(inbox).toContain("Atomic");
  });

  it("relies on wildcard gitignore from init (no per-identity entry)", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
      pmMode: "none",
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
    await runUserPull({ io: cloneIO, identity: "test-user" });

    // Load from the pulled note
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await mkdir(cloneUserDir, { recursive: true });
    const loadResult = await runUserLoad({
      cwd: cloneDir, io: cloneIO, identity: "test-user",
    });
    expect(loadResult).not.toBeNull();
    expect(loadResult!.fileCount).toBeGreaterThanOrEqual(1);

    // Verify content arrived
    const restored = await readFile(
      join(cloneUserDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Portable notes");
  });
});
