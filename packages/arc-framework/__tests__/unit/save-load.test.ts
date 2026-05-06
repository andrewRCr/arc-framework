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
import { tmpdir } from "node:os";

import {
  clearPartialPushMarker,
  findNearestUserNote,
  readLocalSyncState,
  recordPartialPushMarker,
  runUserLoad,
  runUserSave,
} from "../../src/commands/user/save-load.js";
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
      return { stdout: noteContent ?? "", stderr: "" };
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
      version: 3,
      sourceCommit: head,
      sourceOperation: "save",
      verifiedAt: head,
    });
    expect(typeof onDisk.savedAt).toBe("string");
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
      version: 3,
      sourceCommit: head,
      sourceOperation: "load",
      verifiedAt: head,
    });
    expect(typeof onDisk.savedAt).toBe("string");
  });
});

describe("LocalSyncState v3 schema", () => {
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

  it("writes v3 records with savedAt populated and version: 3 via runUserSave", async () => {
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
    expect(onDisk.version).toBe(3);
    expect(onDisk.sourceCommit).toBe(head);
    expect(onDisk.sourceOperation).toBe("save");
    expect(onDisk.verifiedAt).toBe(head);
    expect(typeof onDisk.savedAt).toBe("string");
    const savedAtMs = Date.parse(onDisk.savedAt as string);
    expect(savedAtMs).toBeGreaterThanOrEqual(before);
    expect(savedAtMs).toBeLessThanOrEqual(after);
  });

  it("round-trips verifiedAt and partialPush across v3 read/write", async () => {
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
    expect(reReadFromDisk.version).toBe(3);
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
    expect(parsed.version).toBe(3);
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
});
