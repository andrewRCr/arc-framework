/**
 * Unit tests for the save-load command layer (notes-ref history cap + diagnostic).
 *
 * Covers `findNearestUserNote`'s notes-ref history cap (default 1000), explicit
 * --max-walk override, and the discriminated walk-exhausted outcome surfaced
 * by `runUserLoad`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";

import {
  findNearestUserNote,
  runUserLoad,
  runUserSave,
} from "../../src/commands/user/save-load.js";
import {
  clearPartialPushMarker,
  getOrCreateMachineId,
  readLocalSyncState,
  recordPartialPushMarker,
  writeLocalSyncState,
} from "../../src/lib/user-sync/index.js";
import {
  UserLoadVerificationError,
  UserSaveVerificationError,
} from "../../src/commands/user/types.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
import type { SyncManifest } from "../../src/lib/git/index.js";

const SYNC_STATE_RELATIVE = ".arc/user/andrew/.internal/.sync-state.json";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

interface GitMockConfig {
  head?: string;
  notesHistory?: string[];
  changedPathsByNoteCommit?: Record<string, string[]>;
  missingHistoryPaths?: string[];
  reachableCommits?: string[];
  ancestorDistances?: Record<string, number>;
  noteContent?: string | null;
  /**
   * Per-note content keyed by the `git show` arg (`<noteHistoryCommit>:<notePath>`).
   * Lets a single walk return distinct manifests per note — used to test
   * WU-subdir containment filtering. Falls back to `noteContent`.
   */
  noteContentByHistoryPath?: Record<string, string>;
}

function notePathFor(commit: string): string {
  return `${commit.slice(0, 2)}/${commit.slice(2)}`;
}

function mockIO(config: GitMockConfig = {}): { io: UserIOContext; execCalls: [string, string[]][] } {
  const head = config.head ?? "h0";
  const notesHistory = config.notesHistory ?? [];
  const changedPathsByNoteCommit = config.changedPathsByNoteCommit ?? {};
  const missingHistoryPaths = new Set(config.missingHistoryPaths ?? []);
  const reachableCommits = new Set(config.reachableCommits ?? []);
  const ancestorDistances = config.ancestorDistances ?? {};
  const noteContent = config.noteContent === undefined
    ? JSON.stringify({ version: 2, files: {} })
    : config.noteContent;
  const noteContentByHistoryPath = config.noteContentByHistoryPath ?? {};

  const execCalls: [string, string[]][] = [];

  const exec = vi.fn(async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (args[0] === "rev-parse" && args[1] === "HEAD") {
      return { stdout: head, stderr: "" };
    }
    if (args[0] === "log") {
      const maxCountArg = args.find((arg) => arg.startsWith("--max-count="));
      const maxCountIdx = args.indexOf("--max-count");
      const maxCount = maxCountArg
        ? Number(maxCountArg.slice("--max-count=".length))
        : maxCountIdx >= 0
          ? Number(args[maxCountIdx + 1])
          : notesHistory.length;
      return { stdout: notesHistory.slice(0, maxCount).join("\n"), stderr: "" };
    }
    if (args[0] === "diff-tree") {
      const noteCommit = args[args.length - 1] ?? "";
      return { stdout: (changedPathsByNoteCommit[noteCommit] ?? []).join("\n"), stderr: "" };
    }
    if (args[0] === "show") {
      const historyPath = args[1] ?? "";
      if (missingHistoryPaths.has(historyPath)) {
        throw new Error(`missing history path: ${historyPath}`);
      }
      return { stdout: noteContentByHistoryPath[historyPath] ?? noteContent ?? "", stderr: "" };
    }
    if (args[0] === "merge-base") {
      const commit = args[2] ?? "";
      if (!reachableCommits.has(commit)) {
        throw new Error(`not reachable: ${commit}`);
      }
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-list" && args[1] === "--count") {
      const commit = (args[2] ?? "").replace(/\.\.HEAD$/u, "");
      return { stdout: String(ancestorDistances[commit] ?? 0), stderr: "" };
    }
    throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
  });

  const io: UserIOContext = {
    exec,
    readFile: vi.fn(async () => ""),
    writeFile: vi.fn(async () => undefined),
    readDir: vi.fn(async () => []),
    mkdir: vi.fn(async () => undefined),
    writeNote: vi.fn(async () => undefined),
    readNote: vi.fn(async () => noteContent),
  };

  return { io, execCalls };
}

interface SaveMockConfig {
  head?: string;
  files?: Record<string, string>;
  writeNoteRejects?: boolean;
  readback?: string | null;
}

function mockSaveIO(config: SaveMockConfig = {}): UserIOContext {
  const head = config.head ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const files = config.files ?? { "SESSION-NOTES.md": "# Notes" };
  let writtenNote: string | null = null;

  return {
    exec: vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: head, stderr: "" };
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const name = filePath.slice(filePath.lastIndexOf("/") + 1);
      const content = files[name];
      if (content === undefined) {
        throw new Error(`unexpected file read: ${filePath}`);
      }
      return content;
    }),
    writeFile: vi.fn(async () => undefined),
    readDir: vi.fn(async () => (
      Object.entries(files).map(([name, content]) => ({
        name,
        size: Buffer.byteLength(content, "utf-8"),
      }))
    )),
    mkdir: vi.fn(async () => undefined),
    writeNote: vi.fn(async (_ref: string, content: string) => {
      if (config.writeNoteRejects) {
        throw new Error("write failed");
      }
      writtenNote = content;
    }),
    readNote: vi.fn(async () => (
      Object.hasOwn(config, "readback") ? config.readback! : writtenNote
    )),
  };
}

describe("findNearestUserNote — notes-ref history walk", () => {
  it("finds the newest note by walking note-ref history instead of HEAD ancestry", async () => {
    const annotatedCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const { io, execCalls } = mockIO({
      head: "head",
      notesHistory: ["note-history-0"],
      changedPathsByNoteCommit: {
        "note-history-0": [notePathFor(annotatedCommit)],
      },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).not.toBeNull();
    expect(result.note!.commit).toBe(annotatedCommit);
    expect(result.note!.noteHistoryDistance).toBe(0);
    expect(result.note!.reachableFromHead).toBe(false);
    expect(
      execCalls.some(([, args]) => args[0] === "rev-list" && args.includes("HEAD")),
    ).toBe(false);
  });

  it("applies default cap of 1000 to the note-ref history walk", async () => {
    const { io, execCalls } = mockIO({
      notesHistory: Array.from({ length: 1500 }, (_, i) => `note-history-${i}`),
    });

    await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    const log = execCalls.find(([, args]) => args[0] === "log");
    expect(log).toBeDefined();
    const maxCountIdx = log![1].indexOf("--max-count");
    expect(maxCountIdx).toBeGreaterThan(-1);
    expect(log![1][maxCountIdx + 1]).toBe("1000");
  });

  it("honors explicit maxAncestorWalk override smaller than default", async () => {
    const { io, execCalls } = mockIO({
      notesHistory: Array.from({ length: 50 }, (_, i) => `note-history-${i}`),
    });

    await findNearestUserNote({ cwd: "/repo", io, identity: "andrew", maxAncestorWalk: 10 });

    const log = execCalls.find(([, args]) => args[0] === "log");
    const maxCountIdx = log![1].indexOf("--max-count");
    expect(log![1][maxCountIdx + 1]).toBe("10");
  });

  it("honors explicit maxAncestorWalk override larger than default", async () => {
    const { io, execCalls } = mockIO({
      notesHistory: Array.from({ length: 5000 }, (_, i) => `note-history-${i}`),
    });

    await findNearestUserNote({ cwd: "/repo", io, identity: "andrew", maxAncestorWalk: 5000 });

    const log = execCalls.find(([, args]) => args[0] === "log");
    const maxCountIdx = log![1].indexOf("--max-count");
    expect(log![1][maxCountIdx + 1]).toBe("5000");
  });

  it("reports capped=true and walked=maxWalk when cap hit without match", async () => {
    const { io } = mockIO({
      head: "h0",
      notesHistory: Array.from({ length: 1000 }, (_, i) => `note-history-${i}`),
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).toBeNull();
    expect(result.capped).toBe(true);
    expect(result.walked).toBe(1000);
    expect(result.maxWalk).toBe(1000);
  });

  it("reports capped=false and returns the note when found within cap", async () => {
    const annotatedCommit = "c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5";
    const { io } = mockIO({
      head: "c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0",
      notesHistory: ["note-history-0"],
      changedPathsByNoteCommit: {
        "note-history-0": [notePathFor(annotatedCommit)],
      },
      reachableCommits: [annotatedCommit],
      ancestorDistances: { [annotatedCommit]: 5 },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).not.toBeNull();
    expect(result.note!.commit).toBe(annotatedCommit);
    expect(result.note!.ancestorDistance).toBe(5);
    expect(result.note!.fromAncestor).toBe(true);
    expect(result.note!.reachableFromHead).toBe(true);
    expect(result.note!.noteHistoryDistance).toBe(0);
    expect(result.capped).toBe(false);
  });

  it("falls through deleted latest note entries to the newest readable note", async () => {
    const deletedCommit = "dddddddddddddddddddddddddddddddddddddddd";
    const previousCommit = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const deletedPath = notePathFor(deletedCommit);
    const previousPath = notePathFor(previousCommit);
    const { io } = mockIO({
      notesHistory: ["note-history-0", "note-history-1"],
      changedPathsByNoteCommit: {
        "note-history-0": [deletedPath],
        "note-history-1": [previousPath],
      },
      missingHistoryPaths: [`note-history-0:${deletedPath}`],
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).not.toBeNull();
    expect(result.note!.commit).toBe(previousCommit);
    expect(result.note!.noteHistoryDistance).toBe(1);
    expect(result.walked).toBe(2);
  });

  it("reports capped=false and walked=0 when no notes ref exists", async () => {
    const { io } = mockIO({ notesHistory: [] });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).toBeNull();
    expect(result.capped).toBe(false);
    expect(result.walked).toBe(0);
  });
});

describe("findNearestUserNote — WU-subdir containment filtering", () => {
  const manifestJson = (files: Record<string, string>): string =>
    JSON.stringify({ version: 2, files });

  it("resolves the most-recent note that carries the current WU's subdir", async () => {
    const commit = "a".repeat(40);
    const path = notePathFor(commit);
    const { io } = mockIO({
      head: "head",
      notesHistory: ["nh0"],
      changedPathsByNoteCommit: { nh0: [path] },
      noteContentByHistoryPath: {
        [`nh0:${path}`]: manifestJson({
          "wu-a/SESSION-NOTES.md": "notes",
          "WORKING-MEMORY.md": "mem",
        }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "wu-a",
    });

    expect(result.note?.commit).toBe(commit);
  });

  it("skips a newer note whose only subdir is a different WU", async () => {
    const newer = "b".repeat(40);
    const older = "c".repeat(40);
    const newerPath = notePathFor(newer);
    const olderPath = notePathFor(older);
    const { io } = mockIO({
      head: "head",
      notesHistory: ["nh0", "nh1"],
      changedPathsByNoteCommit: { nh0: [newerPath], nh1: [olderPath] },
      noteContentByHistoryPath: {
        [`nh0:${newerPath}`]: manifestJson({ "other-wu/SESSION-NOTES.md": "x" }),
        [`nh1:${olderPath}`]: manifestJson({ "wu-a/SESSION-NOTES.md": "y" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "wu-a",
    });

    expect(result.note?.commit).toBe(older);
    expect(result.note?.noteHistoryDistance).toBe(1);
  });

  it("does not import a prior WU's notes on a fresh spawn (other-WU-only note skipped)", async () => {
    const commit = "d".repeat(40);
    const path = notePathFor(commit);
    const { io } = mockIO({
      head: "head",
      notesHistory: ["nh0"],
      changedPathsByNoteCommit: { nh0: [path] },
      noteContentByHistoryPath: {
        [`nh0:${path}`]: manifestJson({ "prior-wu/SESSION-NOTES.md": "old" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "fresh-wu",
    });

    expect(result.note).toBeNull();
  });

  it("returns no note when no walked note carries the WU subdir", async () => {
    const commit = "e".repeat(40);
    const path = notePathFor(commit);
    const { io } = mockIO({
      head: "head",
      notesHistory: ["nh0"],
      changedPathsByNoteCommit: { nh0: [path] },
      noteContentByHistoryPath: {
        [`nh0:${path}`]: manifestJson({ "WORKING-MEMORY.md": "mem" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "wu-a",
    });

    expect(result.note).toBeNull();
  });

  it("returns the first note regardless of WU when currentWuName is absent", async () => {
    const commit = "f".repeat(40);
    const path = notePathFor(commit);
    const { io } = mockIO({
      head: "head",
      notesHistory: ["nh0"],
      changedPathsByNoteCommit: { nh0: [path] },
      noteContentByHistoryPath: {
        [`nh0:${path}`]: manifestJson({ "other-wu/SESSION-NOTES.md": "x" }),
      },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(commit);
  });
});

describe("runUserLoad — walk-exhausted outcome", () => {
  it("returns walk-exhausted with walked and maxWalk when cap hit without match", async () => {
    const { io } = mockIO({
      notesHistory: Array.from({ length: 50 }, (_, i) => `note-history-${i}`),
    });

    const result = await runUserLoad({
      cwd: "/repo",
      io,
      identity: "andrew",
      maxAncestorWalk: 50,
    });

    expect(result).toEqual({
      kind: "walk-exhausted",
      walked: 50,
      maxWalk: 50,
    });
  });

  it("returns null when no notes ref exists", async () => {
    const { io } = mockIO({ notesHistory: [] });

    const result = await runUserLoad({
      cwd: "/repo",
      io,
      identity: "andrew",
    });

    expect(result).toBeNull();
  });
});

describe("runUserSave — save verification", () => {
  let cwd: string;
  let syncStatePath: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-save-test-"));
    syncStatePath = join(cwd, SYNC_STATE_RELATIVE);
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("does not advance sync-state when writeNote rejects", async () => {
    const io = mockSaveIO({ writeNoteRejects: true });

    await expect(
      runUserSave({ cwd, io, identity: "andrew" }),
    ).rejects.toThrow("write failed");

    expect(await exists(syncStatePath)).toBe(false);
  });

  it("throws a verification error and does not advance sync-state when readback is missing", async () => {
    const io = mockSaveIO({ readback: null });

    await expect(
      runUserSave({ cwd, io, identity: "andrew" }),
    ).rejects.toThrow(UserSaveVerificationError);

    expect(await exists(syncStatePath)).toBe(false);
  });

  it("throws a verification error and does not advance sync-state when readback is invalid JSON", async () => {
    const io = mockSaveIO({ readback: "{not-json" });

    await expect(
      runUserSave({ cwd, io, identity: "andrew" }),
    ).rejects.toThrow(UserSaveVerificationError);

    expect(await exists(syncStatePath)).toBe(false);
  });

  it("throws a verification error and does not advance sync-state when readback hash mismatches", async () => {
    const io = mockSaveIO({
      readback: JSON.stringify({
        version: 2,
        files: { "SESSION-NOTES.md": "# Different" },
      }),
    });

    await expect(
      runUserSave({ cwd, io, identity: "andrew" }),
    ).rejects.toThrow(UserSaveVerificationError);

    expect(await exists(syncStatePath)).toBe(false);
  });

  it("writes sync-state with verifiedAt after successful readback verification", async () => {
    const head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const io = mockSaveIO({ head });

    await runUserSave({ cwd, io, identity: "andrew" });

    expect(io.writeNote).toHaveBeenCalledWith("arc/user/andrew", expect.any(String), head);
    expect(io.readNote).toHaveBeenCalledWith("arc/user/andrew", head);
    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk).toMatchObject({
      version: 4,
      sourceCommit: head,
      sourceOperation: "save",
      verifiedAt: head,
    });
    expect(typeof onDisk.savedAt).toBe("string");
  });

  it("captures the materialized file list as the prior-file-list basis for drift detection", async () => {
    const io = mockSaveIO();

    await runUserSave({ cwd, io, identity: "andrew" });

    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk.priorFileList).toEqual(["SESSION-NOTES.md"]);
  });
});

interface SaveNotesMockConfig {
  head?: string;
  /** Current on-disk files being saved. */
  files: Record<string, string>;
  /** The most-recent note's manifest files (the prior merged state). */
  priorNoteFiles: Record<string, string>;
}

/**
 * Save IO whose git exec also serves the recent-note window read
 * (`readRecentUserNotes`) from a single prior note, so the removal-tombstone
 * wiring has a prior merged state to diff against.
 */
function mockSaveIOWithNotes(
  config: SaveNotesMockConfig,
): { io: UserIOContext; written: () => string | null } {
  const head = config.head ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const historyCommit = "n1";
  const annotated = "c1".padEnd(40, "0");
  const notePath = `${annotated.slice(0, 2)}/${annotated.slice(2)}`;
  const noteManifest = JSON.stringify({ version: 2, files: config.priorNoteFiles });
  let writtenNote: string | null = null;

  const io: UserIOContext = {
    exec: vi.fn(async (cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: head, stderr: "" };
      if (args[0] === "log") return { stdout: historyCommit, stderr: "" };
      if (args[0] === "diff-tree") return { stdout: notePath, stderr: "" };
      if (args[0] === "show") {
        if (args[1] === `${historyCommit}:${notePath}`) return { stdout: noteManifest, stderr: "" };
        throw new Error(`missing note content: ${args[1] ?? ""}`);
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const name = filePath.slice(filePath.lastIndexOf("/") + 1);
      const content = config.files[name];
      if (content === undefined) throw new Error(`unexpected file read: ${filePath}`);
      return content;
    }),
    writeFile: vi.fn(async () => undefined),
    readDir: vi.fn(async () => (
      Object.entries(config.files).map(([name, content]) => ({
        name,
        size: Buffer.byteLength(content, "utf-8"),
      }))
    )),
    mkdir: vi.fn(async () => undefined),
    writeNote: vi.fn(async (_ref: string, content: string) => { writtenNote = content; }),
    readNote: vi.fn(async () => writtenNote),
  };
  return { io, written: () => writtenNote };
}

describe("runUserSave — removal tombstones", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-save-tombstone-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("stamps a Removed marker into a cross-WU file whose entry is absent since the prior note", async () => {
    const wm = (...entries: string[]): string =>
      `# Working Memory\n\n## Memories\n\n${entries.join("\n\n")}\n\n---\n`;
    const entry = (header: string): string => `**${header}:**\n_Remove when: x._\n\nBody.`;

    const { io, written } = mockSaveIOWithNotes({
      files: { "WORKING-MEMORY.md": wm(entry("Kept")) },
      priorNoteFiles: { "WORKING-MEMORY.md": wm(entry("Kept"), entry("Dropped")) },
    });

    await runUserSave({ cwd, io, identity: "andrew" });

    const note = written();
    expect(note).not.toBeNull();
    const saved = (JSON.parse(note ?? "{}") as SyncManifest).files["WORKING-MEMORY.md"] ?? "";
    expect(saved).toContain("## Removed: **Dropped:**");
    expect(saved).not.toContain("## Removed: **Kept:**");
  });
});

interface LoadMockConfig {
  head?: string;
  manifest?: SyncManifest;
  /**
   * Per-file readback content keyed by manifest filename. `undefined` makes
   * the corresponding `io.readFile` reject (simulates a torn write or missing
   * file). Defaults to a faithful copy of `manifest.files` (happy path).
   */
  readback?: Record<string, string | undefined>;
}

function mockLoadIO(config: LoadMockConfig = {}): UserIOContext {
  const head = config.head ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const manifest: SyncManifest = config.manifest ?? {
    version: 2,
    files: { "SESSION-NOTES.md": "# Notes" },
  };
  const readback = config.readback ?? { ...manifest.files };
  const noteContent = JSON.stringify(manifest);
  const notePath = `${head.slice(0, 2)}/${head.slice(2)}`;

  return {
    exec: vi.fn(async (cmd: string, args: string[]) => {
      if (cmd !== "git") throw new Error(`unexpected exec: ${cmd}`);
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: head, stderr: "" };
      }
      if (args[0] === "log") {
        return { stdout: "note-history-0", stderr: "" };
      }
      if (args[0] === "diff-tree") {
        return { stdout: notePath, stderr: "" };
      }
      if (args[0] === "show") {
        return { stdout: noteContent, stderr: "" };
      }
      if (args[0] === "merge-base") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "rev-list" && args[1] === "--count") {
        return { stdout: "0", stderr: "" };
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const name = filePath.slice(filePath.lastIndexOf("/") + 1);
      if (Object.hasOwn(readback, name)) {
        const content = readback[name];
        if (content === undefined) {
          throw new Error(`ENOENT: ${filePath}`);
        }
        return content;
      }
      throw new Error(`unexpected readFile: ${filePath}`);
    }),
    writeFile: vi.fn(async () => undefined),
    readDir: vi.fn(async () => []),
    mkdir: vi.fn(async () => undefined),
    writeNote: vi.fn(async () => undefined),
    readNote: vi.fn(async () => noteContent),
  };
}

describe("runUserLoad — load verification", () => {
  let cwd: string;
  let syncStatePath: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-load-test-"));
    syncStatePath = join(cwd, SYNC_STATE_RELATIVE);
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("throws a verification error and does not advance sync-state when a materialized file is missing", async () => {
    const io = mockLoadIO({
      manifest: {
        version: 2,
        files: { "SESSION-NOTES.md": "# Notes" },
      },
      readback: { "SESSION-NOTES.md": undefined },
    });

    await expect(
      runUserLoad({ cwd, io, identity: "andrew" }),
    ).rejects.toThrow(UserLoadVerificationError);

    expect(await exists(syncStatePath)).toBe(false);
  });

  it("throws a verification error and does not advance sync-state when readback content does not match the manifest", async () => {
    const io = mockLoadIO({
      manifest: {
        version: 2,
        files: { "SESSION-NOTES.md": "# Notes" },
      },
      readback: { "SESSION-NOTES.md": "# Different content" },
    });

    await expect(
      runUserLoad({ cwd, io, identity: "andrew" }),
    ).rejects.toThrow(UserLoadVerificationError);

    expect(await exists(syncStatePath)).toBe(false);
  });

  it("writes sync-state with verifiedAt after readback hash matches the manifest", async () => {
    const head = "cccccccccccccccccccccccccccccccccccccccc";
    const io = mockLoadIO({
      head,
      manifest: {
        version: 2,
        files: { "SESSION-NOTES.md": "# Notes" },
      },
    });

    const result = await runUserLoad({ cwd, io, identity: "andrew" });

    expect(result?.kind).toBe("loaded");
    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk).toMatchObject({
      version: 4,
      sourceCommit: head,
      sourceOperation: "load",
      verifiedAt: head,
    });
    expect(typeof onDisk.savedAt).toBe("string");
  });
});

describe("runUserLoad — per-WU subdir materialization filtering", () => {
  let cwd: string;
  let userDir: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-load-filter-"));
    userDir = join(cwd, ".arc", "user", "andrew");
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function realFsLoadIO(manifest: SyncManifest): UserIOContext {
    const head = "f".repeat(40);
    const noteContent = JSON.stringify(manifest);
    const notePath = `${head.slice(0, 2)}/${head.slice(2)}`;
    return {
      exec: vi.fn(async (cmd: string, args: string[]) => {
        if (cmd !== "git") throw new Error(`unexpected exec: ${cmd}`);
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: head, stderr: "" };
        if (args[0] === "log") return { stdout: "nh0", stderr: "" };
        if (args[0] === "diff-tree") return { stdout: notePath, stderr: "" };
        if (args[0] === "show") return { stdout: noteContent, stderr: "" };
        if (args[0] === "merge-base") return { stdout: "", stderr: "" };
        if (args[0] === "rev-list" && args[1] === "--count") return { stdout: "0", stderr: "" };
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      }),
      readFile: vi.fn(async (p: string) => readFile(p, "utf-8")),
      writeFile: vi.fn(async (p: string, c: string) => {
        await writeFile(p, c, "utf-8");
      }),
      readDir: vi.fn(async () => []),
      mkdir: vi.fn(async (p: string, opts?: { recursive: boolean }) => {
        await mkdir(p, opts ?? { recursive: true });
        return undefined;
      }),
      writeNote: vi.fn(async () => undefined),
      readNote: vi.fn(async () => noteContent),
    };
  }

  it("materializes the current WU subdir and cross-WU flat files, dropping other WUs' subdirs", async () => {
    const io = realFsLoadIO({
      version: 2,
      files: {
        "wu-a/SESSION-NOTES.md": "a-notes",
        "wu-b/SESSION-NOTES.md": "b-notes",
        "WORKING-MEMORY.md": "mem",
      },
    });

    const result = await runUserLoad({ cwd, io, identity: "andrew", currentWuName: "wu-a" });

    expect(result?.kind).toBe("loaded");
    expect(await exists(join(userDir, "wu-a", "SESSION-NOTES.md"))).toBe(true);
    expect(await exists(join(userDir, "WORKING-MEMORY.md"))).toBe(true);
    expect(await exists(join(userDir, "wu-b", "SESSION-NOTES.md"))).toBe(false);
  });

  it("materializes cross-WU flat files but no per-WU subdir when no WU resolves", async () => {
    const io = realFsLoadIO({
      version: 2,
      files: {
        "wu-a/SESSION-NOTES.md": "a-notes",
        "WORKING-MEMORY.md": "mem",
      },
    });

    const result = await runUserLoad({ cwd, io, identity: "andrew" });

    expect(result?.kind).toBe("loaded");
    expect(await exists(join(userDir, "WORKING-MEMORY.md"))).toBe(true);
    expect(await exists(join(userDir, "wu-a", "SESSION-NOTES.md"))).toBe(false);
  });
});

describe("LocalSyncState v4 schema", () => {
  let cwd: string;
  let internalDir: string;
  let syncStatePath: string;
  const identity = "andrew";

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-sync-state-test-"));
    internalDir = join(cwd, ".arc", "user", identity, ".internal");
    await mkdir(internalDir, { recursive: true });
    syncStatePath = join(internalDir, ".sync-state.json");
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function realFsIO(overrides: Partial<UserIOContext> = {}): UserIOContext {
    return {
      exec: vi.fn(async () => ({ stdout: "", stderr: "" })),
      readFile: vi.fn(async (p: string) => readFile(p, "utf-8")),
      writeFile: vi.fn(async (p: string, c: string) => {
        await writeFile(p, c, "utf-8");
      }),
      mkdir: vi.fn(async (p: string) => mkdir(p, { recursive: true })),
      readDir: vi.fn(async () => []),
      readNote: vi.fn(async () => null),
      writeNote: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  it("reads v2 records without error and leaves savedAt undefined", async () => {
    const v2Record = {
      version: 2,
      materializedManifestHash: "abcdef0123456789",
      sourceCommit: "a".repeat(40),
      sourceOperation: "save" as const,
      verifiedAt: "a".repeat(40),
    };
    await writeFile(syncStatePath, `${JSON.stringify(v2Record, null, 2)}\n`, "utf-8");

    const state = await readLocalSyncState(cwd, realFsIO(), identity);

    expect(state).not.toBeNull();
    expect(state!.materializedManifestHash).toBe(v2Record.materializedManifestHash);
    expect(state!.sourceCommit).toBe(v2Record.sourceCommit);
    expect(state!.sourceOperation).toBe("save");
    expect(state!.verifiedAt).toBe(v2Record.verifiedAt);
    expect(state!.savedAt).toBeUndefined();
  });

  it("writes v4 records with savedAt populated and version: 4 via runUserSave", async () => {
    const head = "b".repeat(40);
    const userDir = join(cwd, ".arc", "user", identity);
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Notes", "utf-8");

    let writtenNote: string | null = null;
    const io = realFsIO({
      exec: vi.fn(async (cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: head, stderr: "" };
        }
        throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
      }),
      readDir: vi.fn(async () => [{ name: "SESSION-NOTES.md", size: 7 }]),
      writeNote: vi.fn(async (_ref: string, content: string) => {
        writtenNote = content;
      }),
      readNote: vi.fn(async () => writtenNote),
    });

    const before = Date.now();
    await runUserSave({ cwd, io, identity });
    const after = Date.now();

    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk.version).toBe(4);
    expect(onDisk.sourceCommit).toBe(head);
    expect(onDisk.sourceOperation).toBe("save");
    expect(onDisk.verifiedAt).toBe(head);
    expect(typeof onDisk.savedAt).toBe("string");
    const savedAtMs = Date.parse(onDisk.savedAt as string);
    expect(savedAtMs).toBeGreaterThanOrEqual(before);
    expect(savedAtMs).toBeLessThanOrEqual(after);
  });

  it("round-trips verifiedAt and partialPush across a v3 read and v4 write", async () => {
    const v3Record = {
      version: 3,
      materializedManifestHash: "deadbeef".repeat(2),
      sourceCommit: "c".repeat(40),
      sourceOperation: "save" as const,
      savedAt: "2026-05-06T10:30:00.000Z",
      verifiedAt: "c".repeat(40),
      partialPush: {
        localRefHash: "d".repeat(40),
        sourceCommit: "c".repeat(40),
      },
    };
    await writeFile(syncStatePath, `${JSON.stringify(v3Record, null, 2)}\n`, "utf-8");

    const beforeClear = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(beforeClear).not.toBeNull();
    expect(beforeClear!.savedAt).toBe(v3Record.savedAt);
    expect(beforeClear!.verifiedAt).toBe(v3Record.verifiedAt);
    expect(beforeClear!.partialPush).toEqual(v3Record.partialPush);

    await clearPartialPushMarker(cwd, realFsIO(), identity);

    const afterClear = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(afterClear).not.toBeNull();
    expect(afterClear!.partialPush).toBeUndefined();
    expect(afterClear!.savedAt).toBe(v3Record.savedAt);
    expect(afterClear!.verifiedAt).toBe(v3Record.verifiedAt);

    const reReadFromDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(reReadFromDisk.version).toBe(4);
    expect(reReadFromDisk.partialPush).toBeUndefined();
    expect(reReadFromDisk.savedAt).toBe(v3Record.savedAt);

    const localRefHash = "e".repeat(40);
    const recordIo = realFsIO({
      exec: vi.fn(async (cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: localRefHash, stderr: "" };
        }
        throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
      }),
    });
    await recordPartialPushMarker(cwd, recordIo, identity);

    const afterRecord = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(afterRecord).not.toBeNull();
    expect(afterRecord!.partialPush).toEqual({
      localRefHash,
      sourceCommit: v3Record.sourceCommit,
    });
    expect(afterRecord!.savedAt).toBe(v3Record.savedAt);
    expect(afterRecord!.verifiedAt).toBe(v3Record.verifiedAt);
  });

  it("never produces malformed JSON on disk under concurrent writes", async () => {
    const head = "f".repeat(40);
    const userDir = join(cwd, ".arc", "user", identity);
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "SESSION-NOTES.md"), "# Concurrent A", "utf-8");

    const makeIO = (content: string): UserIOContext => {
      let writtenNote: string | null = null;
      return realFsIO({
        exec: vi.fn(async (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
            return { stdout: head, stderr: "" };
          }
          throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
        }),
        readFile: vi.fn(async (p: string) => {
          if (p.endsWith("SESSION-NOTES.md")) return content;
          return readFile(p, "utf-8");
        }),
        readDir: vi.fn(async () => [{ name: "SESSION-NOTES.md", size: content.length }]),
        writeNote: vi.fn(async (_ref: string, c: string) => {
          writtenNote = c;
        }),
        readNote: vi.fn(async () => writtenNote),
      });
    };

    const results = await Promise.allSettled([
      runUserSave({ cwd, io: makeIO("# Variant A"), identity }),
      runUserSave({ cwd, io: makeIO("# Variant B"), identity }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const raw = await readFile(syncStatePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.version).toBe(4);
    expect(parsed.sourceCommit).toBe(head);
    expect(parsed.sourceOperation).toBe("save");
    expect(typeof parsed.savedAt).toBe("string");
    expect(typeof parsed.materializedManifestHash).toBe("string");
    expect((parsed.materializedManifestHash as string).length).toBeGreaterThan(0);
  });

  it("loads a v3 record with an unreachable sourceCommit without crashing", async () => {
    const v3Record = {
      version: 3,
      materializedManifestHash: "fffeee",
      sourceCommit: "0".repeat(40),
      sourceOperation: "load" as const,
      savedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(syncStatePath, `${JSON.stringify(v3Record, null, 2)}\n`, "utf-8");

    const state = await readLocalSyncState(cwd, realFsIO(), identity);

    expect(state).not.toBeNull();
    expect(state!.sourceCommit).toBe(v3Record.sourceCommit);
    expect(state!.savedAt).toBe(v3Record.savedAt);
    expect(state!.materializedManifestHash).toBe(v3Record.materializedManifestHash);
    expect(state!.sourceOperation).toBe("load");
  });

  it("normalizes a prior v3 record to version 4 on read and writes version 4", async () => {
    const v3Record = {
      version: 3,
      materializedManifestHash: "ab".repeat(8),
      sourceCommit: "c".repeat(40),
      sourceOperation: "load" as const,
      savedAt: "2026-05-06T10:30:00.000Z",
    };
    await writeFile(syncStatePath, `${JSON.stringify(v3Record)}\n`, "utf-8");

    const state = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(state!.version).toBe(4);
    expect(state!.materializedManifestHash).toBe(v3Record.materializedManifestHash);

    await writeLocalSyncState(cwd, realFsIO(), identity, "ff".repeat(8), "d".repeat(40), "save");
    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk.version).toBe(4);
  });

  it("reserves remote partial-push provenance per worktree (no single-HEAD assumption)", async () => {
    const record = {
      version: 4,
      materializedManifestHash: "1a".repeat(8),
      sourceCommit: "c".repeat(40),
      sourceOperation: "save" as const,
      savedAt: "2026-05-06T10:30:00.000Z",
      remoteMarkerProvenance: { "feat/worktree-foundation": { head: "aaa" } },
    };
    await writeFile(syncStatePath, `${JSON.stringify(record)}\n`, "utf-8");

    const state = await readLocalSyncState(cwd, realFsIO(), identity);
    // Keyed by worktree rather than a single global/main marker.
    expect(state!.remoteMarkerProvenance).toEqual(record.remoteMarkerProvenance);
  });

  it("tolerates absent reserved fields and preserves present ones across a rebuild-from-scratch save", async () => {
    const bare = {
      version: 4,
      materializedManifestHash: "2b".repeat(8),
      sourceCommit: "c".repeat(40),
      sourceOperation: "save" as const,
      savedAt: "2026-05-06T10:30:00.000Z",
    };
    await writeFile(syncStatePath, `${JSON.stringify(bare)}\n`, "utf-8");
    const bareRead = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(bareRead!.priorFileList).toBeUndefined();
    expect(bareRead!.remoteMarkerProvenance).toBeUndefined();

    const reserved = {
      ...bare,
      priorFileList: ["wu-a/SESSION-NOTES.md", "WORKING-MEMORY.md"],
      remoteMarkerProvenance: { "feat/x": { head: "aaa" } },
    };
    await writeFile(syncStatePath, `${JSON.stringify(reserved)}\n`, "utf-8");

    // writeLocalSyncState rebuilds the record from scratch — reserved fields must survive.
    await writeLocalSyncState(cwd, realFsIO(), identity, "33".repeat(8), "d".repeat(40), "save");
    const afterSave = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(afterSave!.priorFileList).toEqual(reserved.priorFileList);
    expect(afterSave!.remoteMarkerProvenance).toEqual(reserved.remoteMarkerProvenance);
  });

  it("keeps remote-marker provenance pluralizable — multiple worktree entries survive a round-trip", async () => {
    const record = {
      version: 4,
      materializedManifestHash: "4c".repeat(8),
      sourceCommit: "c".repeat(40),
      sourceOperation: "save" as const,
      savedAt: "2026-05-06T10:30:00.000Z",
      remoteMarkerProvenance: {
        "feat/a": { head: "aaa" },
        "feat/b": { head: "bbb" },
      },
    };
    await writeFile(syncStatePath, `${JSON.stringify(record)}\n`, "utf-8");

    const state = await readLocalSyncState(cwd, realFsIO(), identity);
    expect(Object.keys(state!.remoteMarkerProvenance!)).toEqual(["feat/a", "feat/b"]);
    expect(state!.remoteMarkerProvenance).toEqual(record.remoteMarkerProvenance);
  });

  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("generates and persists a new machine-id to .machine-id on first need when none is stored", async () => {
    const id = await getOrCreateMachineId(cwd, realFsIO(), identity);

    expect(id).toMatch(UUID_V4);
    const onDisk = (await readFile(join(internalDir, ".machine-id"), "utf-8")).trim();
    expect(onDisk).toBe(id);
  });

  it("returns the same machine-id on a subsequent read (idempotent — no regeneration)", async () => {
    const first = await getOrCreateMachineId(cwd, realFsIO(), identity);
    const second = await getOrCreateMachineId(cwd, realFsIO(), identity);

    expect(second).toBe(first);
    const onDisk = (await readFile(join(internalDir, ".machine-id"), "utf-8")).trim();
    expect(onDisk).toBe(first);
  });

  it("generates a random UUID, not derived from hostname or any environment value", async () => {
    const id = await getOrCreateMachineId(cwd, realFsIO(), identity);

    expect(id).toMatch(UUID_V4);
    expect(id).not.toContain(hostname());

    // A separate machine (distinct sync-state home) yields a distinct id — randomness, not a derived constant.
    const otherCwd = await mkdtemp(join(tmpdir(), "arc-machine-id-test-"));
    await mkdir(join(otherCwd, ".arc", "user", identity, ".internal"), { recursive: true });
    try {
      const otherId = await getOrCreateMachineId(otherCwd, realFsIO(), identity);
      expect(otherId).not.toBe(id);
    } finally {
      await rm(otherCwd, { recursive: true, force: true });
    }
  });

  it("adopts the winner's id when it loses the exclusive-create race (EEXIST read-back)", async () => {
    const winnerId = "99999999-9999-4999-8999-999999999999";
    // Force the lost-race branch: the injected create models a concurrent
    // first-caller that already wrote the canonical id, so our create collides.
    const losingCreate = vi.fn(async (path: string) => {
      await writeFile(path, winnerId, "utf-8");
      const err: NodeJS.ErrnoException = new Error("EEXIST: file already exists");
      err.code = "EEXIST";
      throw err;
    });

    const id = await getOrCreateMachineId(cwd, realFsIO(), identity, losingCreate);

    expect(id).toBe(winnerId);
    expect(losingCreate).toHaveBeenCalledOnce();
    const onDisk = (await readFile(join(internalDir, ".machine-id"), "utf-8")).trim();
    expect(onDisk).toBe(winnerId);
  });

  it("adopts a legacy .sync-state.json machineId into .machine-id instead of minting fresh", async () => {
    const legacyId = "abcdef01-1234-4abc-89ab-001122334455";
    await writeFile(syncStatePath, `${JSON.stringify({ machineId: legacyId }, null, 2)}\n`, "utf-8");

    const id = await getOrCreateMachineId(cwd, realFsIO(), identity);

    // The established identity migrates, rather than a fresh mint orphaning its marker key.
    expect(id).toBe(legacyId);
    const onDisk = (await readFile(join(internalDir, ".machine-id"), "utf-8")).trim();
    expect(onDisk).toBe(legacyId);
  });

  it("read-tolerates the legacy .sync-state.json machineId — never writes it back", async () => {
    const legacyId = "abcdef01-1234-4abc-89ab-001122334455";
    const before = `${JSON.stringify({ machineId: legacyId, materializedManifestHash: "x" }, null, 2)}\n`;
    await writeFile(syncStatePath, before, "utf-8");

    await getOrCreateMachineId(cwd, realFsIO(), identity);

    // The adopt is a one-way read: the legacy record is left byte-identical.
    expect(await readFile(syncStatePath, "utf-8")).toBe(before);
  });
});
