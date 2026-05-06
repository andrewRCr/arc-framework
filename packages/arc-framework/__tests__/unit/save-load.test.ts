/**
 * Unit tests for the save-load command layer (notes-ref history cap + diagnostic).
 *
 * Covers `findNearestUserNote`'s notes-ref history cap (default 1000), explicit
 * --max-walk override, and the discriminated walk-exhausted outcome surfaced
 * by `runUserLoad`.
 */

import { describe, it, expect, vi } from "vitest";

import { findNearestUserNote, runUserLoad, runUserSave } from "../../src/commands/user/save-load.js";
import {
  UserLoadVerificationError,
  UserSaveVerificationError,
} from "../../src/commands/user/types.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
import type { SyncManifest } from "../../src/lib/git/index.js";

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
  it("does not advance sync-state when writeNote rejects", async () => {
    const io = mockSaveIO({ writeNoteRejects: true });

    await expect(
      runUserSave({ cwd: "/repo", io, identity: "andrew" }),
    ).rejects.toThrow("write failed");

    expect(io.writeFile).not.toHaveBeenCalled();
  });

  it("throws a verification error and does not advance sync-state when readback is missing", async () => {
    const io = mockSaveIO({ readback: null });

    await expect(
      runUserSave({ cwd: "/repo", io, identity: "andrew" }),
    ).rejects.toThrow(UserSaveVerificationError);

    expect(io.writeFile).not.toHaveBeenCalled();
  });

  it("throws a verification error and does not advance sync-state when readback is invalid JSON", async () => {
    const io = mockSaveIO({ readback: "{not-json" });

    await expect(
      runUserSave({ cwd: "/repo", io, identity: "andrew" }),
    ).rejects.toThrow(UserSaveVerificationError);

    expect(io.writeFile).not.toHaveBeenCalled();
  });

  it("throws a verification error and does not advance sync-state when readback hash mismatches", async () => {
    const io = mockSaveIO({
      readback: JSON.stringify({
        version: 2,
        files: { "SESSION-NOTES.md": "# Different" },
      }),
    });

    await expect(
      runUserSave({ cwd: "/repo", io, identity: "andrew" }),
    ).rejects.toThrow(UserSaveVerificationError);

    expect(io.writeFile).not.toHaveBeenCalled();
  });

  it("writes sync-state with verifiedAt after successful readback verification", async () => {
    const head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const io = mockSaveIO({ head });

    await runUserSave({ cwd: "/repo", io, identity: "andrew" });

    expect(io.writeNote).toHaveBeenCalledWith("arc/user/andrew", expect.any(String), head);
    expect(io.readNote).toHaveBeenCalledWith("arc/user/andrew", head);
    expect(io.writeFile).toHaveBeenCalledTimes(1);
    const [syncStatePath, syncStateContent] = vi.mocked(io.writeFile).mock.calls[0]!;
    expect(syncStatePath).toBe("/repo/.arc/user/andrew/.internal/.sync-state.json");
    expect(JSON.parse(syncStateContent)).toMatchObject({
      version: 2,
      sourceCommit: head,
      sourceOperation: "save",
      verifiedAt: head,
    });
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

const SYNC_STATE_PATH = "/repo/.arc/user/andrew/.internal/.sync-state.json";

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

function syncStateWrites(io: UserIOContext): unknown[] {
  return vi.mocked(io.writeFile).mock.calls.filter(([path]) => path === SYNC_STATE_PATH);
}

describe("runUserLoad — load verification", () => {
  it("throws a verification error and does not advance sync-state when a materialized file is missing", async () => {
    const io = mockLoadIO({
      manifest: {
        version: 2,
        files: { "SESSION-NOTES.md": "# Notes" },
      },
      readback: { "SESSION-NOTES.md": undefined },
    });

    await expect(
      runUserLoad({ cwd: "/repo", io, identity: "andrew" }),
    ).rejects.toThrow(UserLoadVerificationError);

    expect(syncStateWrites(io)).toHaveLength(0);
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
      runUserLoad({ cwd: "/repo", io, identity: "andrew" }),
    ).rejects.toThrow(UserLoadVerificationError);

    expect(syncStateWrites(io)).toHaveLength(0);
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

    const result = await runUserLoad({ cwd: "/repo", io, identity: "andrew" });

    expect(result?.kind).toBe("loaded");
    const writes = syncStateWrites(io);
    expect(writes).toHaveLength(1);
    const [, syncStateContent] = writes[0]! as [string, string];
    expect(JSON.parse(syncStateContent)).toMatchObject({
      version: 2,
      sourceCommit: head,
      sourceOperation: "load",
      verifiedAt: head,
    });
  });
});
