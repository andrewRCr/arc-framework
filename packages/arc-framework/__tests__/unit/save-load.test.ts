/**
 * Unit tests for the save-load command layer.
 *
 * Covers `findNearestUserNote`'s user-note resolution plus the sync-state
 * markers written by save/load.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { basename, dirname, join } from "node:path";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";

import {
  findNearestUserNote,
  runUserLoad,
  runUserSave,
} from "../../src/commands/user/save-load.js";
import {
  clearPartialPushMarker,
  getNotesLockPath,
  getOrCreateMachineId,
  NO_COMPARABLE_SOURCE_COMMIT,
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
  annotatedNoteCommits?: string[];
  reachableHeadCommits?: string[];
  maximalCommits?: string[];
  localSyncState?: {
    sourceCommit: string;
    sourceOperation: "save" | "load";
  };
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
  /** Per-note content keyed by annotated commit for `git notes show <commit>`. */
  noteContentByCommit?: Record<string, string | null>;
}

function mockIO(config: GitMockConfig = {}): { io: UserIOContext; execCalls: [string, string[]][] } {
  const head = config.head ?? "h0";
  const annotatedNoteCommits = config.annotatedNoteCommits ?? [];
  const reachableHeadCommits = config.reachableHeadCommits ?? [];
  const maximalCommits = config.maximalCommits ?? reachableHeadCommits;
  const localSyncState = config.localSyncState;
  const notesHistory = config.notesHistory ?? [];
  const changedPathsByNoteCommit = config.changedPathsByNoteCommit ?? {};
  const missingHistoryPaths = new Set(config.missingHistoryPaths ?? []);
  const reachableCommits = new Set(config.reachableCommits ?? []);
  const ancestorDistances = config.ancestorDistances ?? {};
  const noteContent = config.noteContent === undefined
    ? JSON.stringify({ version: 2, files: {} })
    : config.noteContent;
  const noteContentByHistoryPath = config.noteContentByHistoryPath ?? {};
  const noteContentByCommit = config.noteContentByCommit ?? {};

  const execCalls: [string, string[]][] = [];

  const exec = vi.fn(async (cmd: string, args: string[]) => {
    execCalls.push([cmd, args]);
    if (args[0] === "rev-parse" && args[1] === "HEAD") {
      return { stdout: head, stderr: "" };
    }
    if (args[0] === "notes" && args[2] === "list") {
      return {
        stdout: annotatedNoteCommits.map((commit) => `${"0".repeat(40)} ${commit}`).join("\n"),
        stderr: "",
      };
    }
    if (args[0] === "notes" && args[2] === "show") {
      const commit = args[3] ?? "";
      const content = Object.hasOwn(noteContentByCommit, commit)
        ? noteContentByCommit[commit]
        : noteContent;
      if (content === null) {
        throw new Error(`missing note: ${commit}`);
      }
      return { stdout: content ?? "", stderr: "" };
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
    if (args[0] === "rev-list" && args[1] === "HEAD") {
      return { stdout: reachableHeadCommits.join("\n"), stderr: "" };
    }
    if (args[0] === "merge-base" && args[1] === "--independent") {
      return { stdout: maximalCommits.join("\n"), stderr: "" };
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
    readFile: vi.fn(async (filePath: string) => {
      if (filePath.endsWith(".sync-state.json") && localSyncState !== undefined) {
        return JSON.stringify({
          version: 4,
          materializedManifestHash: "hash",
          ...localSyncState,
        });
      }
      return "";
    }),
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
  const files = config.files ?? { "WORKING-MEMORY.md": "# Notes" };
  let writtenNote: string | null = null;

  return {
    exec: vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: head, stderr: "" };
      }
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
        return { stdout: ".git\n", stderr: "" };
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const name = basename(filePath);
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

describe("findNearestUserNote — causally-maximal reachable resolution", () => {
  it("resolves a single reachable note", async () => {
    const commit = "a".repeat(40);
    const { io } = mockIO({
      head: commit,
      annotatedNoteCommits: [commit],
      reachableHeadCommits: [commit],
      maximalCommits: [commit],
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(commit);
    expect(result.note?.ancestorDistance).toBe(0);
    expect(result.note?.fromAncestor).toBe(false);
    expect(result.note?.reachableFromHead).toBe(true);
  });

  it("resolves the tip note from a reachable linear chain", async () => {
    const older = "a".repeat(40);
    const tip = "c".repeat(40);
    const { io } = mockIO({
      head: tip,
      annotatedNoteCommits: [older, tip],
      reachableHeadCommits: [tip, older],
      maximalCommits: [tip],
      ancestorDistances: { [tip]: 0 },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(tip);
  });

  it("keeps the descendant save when a later note update re-anchors an older commit", async () => {
    const older = "a".repeat(40);
    const descendant = "d".repeat(40);
    const { io, execCalls } = mockIO({
      head: descendant,
      annotatedNoteCommits: [older, descendant],
      reachableHeadCommits: [older, descendant],
      maximalCommits: [descendant],
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(descendant);
    expect(execCalls.some(([, args]) => args[0] === "log")).toBe(false);
  });

  it("finds a reachable far-behind note without an ancestor-walk cap", async () => {
    const farBehind = "f".repeat(40);
    const head = "e".repeat(40);
    const { io, execCalls } = mockIO({
      head,
      annotatedNoteCommits: [farBehind],
      reachableHeadCommits: [head, farBehind],
      maximalCommits: [farBehind],
      ancestorDistances: { [farBehind]: 1500 },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(farBehind);
    expect(result.note?.ancestorDistance).toBe(1500);
    expect(execCalls.some(([, args]) => args[0] === "log")).toBe(false);
  });

  it("reports no note without treating the candidate count as a walk cap", async () => {
    const { io } = mockIO({ annotatedNoteCommits: [] });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note).toBeNull();
  });

  it("resolves a concurrent maximal note named by the local sync-state pointer", async () => {
    const siblingA = "a".repeat(40);
    const siblingB = "b".repeat(40);
    const { io } = mockIO({
      head: "f".repeat(40),
      annotatedNoteCommits: [siblingA, siblingB],
      reachableHeadCommits: [siblingA, siblingB],
      maximalCommits: [siblingA, siblingB],
      localSyncState: { sourceCommit: siblingB, sourceOperation: "save" },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(siblingB);
  });

  it("resolves the smallest SHA from a concurrent maximal set with no pointer match", async () => {
    const smaller = "a".repeat(40);
    const larger = "b".repeat(40);
    const { io } = mockIO({
      head: "f".repeat(40),
      annotatedNoteCommits: [larger, smaller],
      reachableHeadCommits: [larger, smaller],
      maximalCommits: [larger, smaller],
      localSyncState: { sourceCommit: "c".repeat(40), sourceOperation: "save" },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(smaller);
  });

  it("uses pointer membership for concurrent notes even when the pointer came from a load", async () => {
    const smaller = "a".repeat(40);
    const loaded = "b".repeat(40);
    const { io } = mockIO({
      head: "f".repeat(40),
      annotatedNoteCommits: [smaller, loaded],
      reachableHeadCommits: [smaller, loaded],
      maximalCommits: [smaller, loaded],
      localSyncState: { sourceCommit: loaded, sourceOperation: "load" },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(loaded);
  });
});

describe("findNearestUserNote — WU-subdir containment filtering", () => {
  const manifestJson = (files: Record<string, string>): string =>
    JSON.stringify({ version: 2, files });

  it("resolves a reachable note that carries the current WU's subdir", async () => {
    const commit = "a".repeat(40);
    const { io } = mockIO({
      head: commit,
      annotatedNoteCommits: [commit],
      reachableHeadCommits: [commit],
      maximalCommits: [commit],
      noteContentByCommit: {
        [commit]: manifestJson({
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

  it("skips a reachable note whose only subdir is a different WU", async () => {
    const otherWu = "b".repeat(40);
    const matchingWu = "c".repeat(40);
    const { io } = mockIO({
      head: matchingWu,
      annotatedNoteCommits: [otherWu, matchingWu],
      reachableHeadCommits: [otherWu, matchingWu],
      maximalCommits: [matchingWu],
      noteContentByCommit: {
        [otherWu]: manifestJson({ "other-wu/SESSION-NOTES.md": "x" }),
        [matchingWu]: manifestJson({ "wu-a/SESSION-NOTES.md": "y" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "wu-a",
    });

    expect(result.note?.commit).toBe(matchingWu);
  });

  it("reads WU-filter content only for reachable candidates before reducing", async () => {
    const unreachable = "a".repeat(40);
    const otherWu = "b".repeat(40);
    const olderMatchingWu = "c".repeat(40);
    const latestMatchingWu = "d".repeat(40);
    const { io, execCalls } = mockIO({
      head: latestMatchingWu,
      annotatedNoteCommits: [unreachable, otherWu, olderMatchingWu, latestMatchingWu],
      reachableHeadCommits: [otherWu, olderMatchingWu, latestMatchingWu],
      maximalCommits: [latestMatchingWu],
      noteContentByCommit: {
        [unreachable]: null,
        [otherWu]: manifestJson({ "other-wu/SESSION-NOTES.md": "x" }),
        [olderMatchingWu]: manifestJson({ "wu-a/SESSION-NOTES.md": "older" }),
        [latestMatchingWu]: manifestJson({ "wu-a/SESSION-NOTES.md": "latest" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "wu-a",
    });

    const noteShowCommits = execCalls
      .filter(([, args]) => args[0] === "notes" && args[2] === "show")
      .map(([, args]) => args[3]);
    const reduceCall = execCalls.find(([, args]) => (
      args[0] === "merge-base" && args[1] === "--independent"
    ));

    expect(result.note?.commit).toBe(latestMatchingWu);
    expect(noteShowCommits).toEqual([otherWu, olderMatchingWu, latestMatchingWu]);
    expect(reduceCall?.[1]).toEqual([
      "merge-base", "--independent", olderMatchingWu, latestMatchingWu,
    ]);
  });

  it("can resolve different commits for whole-tree and per-WU reads over the same notes", async () => {
    const matchingWu = "a".repeat(40);
    const otherWu = "b".repeat(40);
    const sharedState = {
      head: otherWu,
      annotatedNoteCommits: [matchingWu, otherWu],
      reachableHeadCommits: [matchingWu, otherWu],
      noteContentByCommit: {
        [matchingWu]: manifestJson({ "wu-a/SESSION-NOTES.md": "own" }),
        [otherWu]: manifestJson({ "other-wu/SESSION-NOTES.md": "sibling" }),
      },
    };
    const { io: wholeTreeIo } = mockIO({
      ...sharedState,
      maximalCommits: [otherWu],
    });
    const { io: perWuIo } = mockIO({
      ...sharedState,
      maximalCommits: [matchingWu],
    });

    const wholeTreeResult = await findNearestUserNote({
      cwd: "/repo", io: wholeTreeIo, identity: "andrew",
    });
    const perWuResult = await findNearestUserNote({
      cwd: "/repo", io: perWuIo, identity: "andrew", currentWuName: "wu-a",
    });

    expect(wholeTreeResult.note?.commit).toBe(otherWu);
    expect(perWuResult.note?.commit).toBe(matchingWu);
  });

  it("does not import a prior WU's notes on a fresh spawn (other-WU-only note skipped)", async () => {
    const commit = "d".repeat(40);
    const { io } = mockIO({
      head: commit,
      annotatedNoteCommits: [commit],
      reachableHeadCommits: [commit],
      maximalCommits: [commit],
      noteContentByCommit: {
        [commit]: manifestJson({ "prior-wu/SESSION-NOTES.md": "old" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "fresh-wu",
    });

    expect(result.note).toBeNull();
  });

  it("returns no note when no reachable note carries the WU subdir", async () => {
    const commit = "e".repeat(40);
    const { io } = mockIO({
      head: commit,
      annotatedNoteCommits: [commit],
      reachableHeadCommits: [commit],
      maximalCommits: [commit],
      noteContentByCommit: {
        [commit]: manifestJson({ "WORKING-MEMORY.md": "mem" }),
      },
    });

    const result = await findNearestUserNote({
      cwd: "/repo", io, identity: "andrew", currentWuName: "wu-a",
    });

    expect(result.note).toBeNull();
  });

  it("returns the reachable-maximal note regardless of WU when currentWuName is absent", async () => {
    const commit = "f".repeat(40);
    const { io } = mockIO({
      head: commit,
      annotatedNoteCommits: [commit],
      reachableHeadCommits: [commit],
      maximalCommits: [commit],
      noteContentByCommit: {
        [commit]: manifestJson({ "other-wu/SESSION-NOTES.md": "x" }),
      },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(commit);
  });
});

describe("findNearestUserNote — off-ancestry pointer fallback", () => {
  const manifestJson = (files: Record<string, string>): string =>
    JSON.stringify({ version: 2, files });

  it("returns this machine's saved pointer note when no notes are reachable from HEAD", async () => {
    const pointerCommit = "a".repeat(40);
    const { io } = mockIO({
      head: "b".repeat(40),
      annotatedNoteCommits: [pointerCommit],
      reachableHeadCommits: [],
      localSyncState: { sourceCommit: pointerCommit, sourceOperation: "save" },
      noteContentByCommit: {
        [pointerCommit]: manifestJson({ "WORKING-MEMORY.md": "mem" }),
      },
    });

    const result = await findNearestUserNote({ cwd: "/repo", io, identity: "andrew" });

    expect(result.note?.commit).toBe(pointerCommit);
    expect(result.note?.reachableFromHead).toBe(false);
    expect(result.note?.fromAncestor).toBe(false);
    expect(result.note?.ancestorDistance).toBe(0);
  });

  it("applies the current-WU filter before returning the off-ancestry pointer note", async () => {
    const pointerCommit = "a".repeat(40);
    const matchingIO = mockIO({
      head: "b".repeat(40),
      annotatedNoteCommits: [pointerCommit],
      reachableHeadCommits: [],
      localSyncState: { sourceCommit: pointerCommit, sourceOperation: "save" },
      noteContentByCommit: {
        [pointerCommit]: manifestJson({ "wu-a/SESSION-NOTES.md": "notes" }),
      },
    }).io;
    const nonmatchingIO = mockIO({
      head: "b".repeat(40),
      annotatedNoteCommits: [pointerCommit],
      reachableHeadCommits: [],
      localSyncState: { sourceCommit: pointerCommit, sourceOperation: "save" },
      noteContentByCommit: {
        [pointerCommit]: manifestJson({ "other-wu/SESSION-NOTES.md": "notes" }),
      },
    }).io;

    const matching = await findNearestUserNote({
      cwd: "/repo", io: matchingIO, identity: "andrew", currentWuName: "wu-a",
    });
    const nonmatching = await findNearestUserNote({
      cwd: "/repo", io: nonmatchingIO, identity: "andrew", currentWuName: "wu-a",
    });

    expect(matching.note?.commit).toBe(pointerCommit);
    expect(matching.note?.reachableFromHead).toBe(false);
    expect(nonmatching.note).toBeNull();
  });

  it("returns no note when nothing is reachable and no local save pointer applies", async () => {
    const noteCommit = "a".repeat(40);
    const noPointerIO = mockIO({
      head: "b".repeat(40),
      annotatedNoteCommits: [noteCommit],
      reachableHeadCommits: [],
      noteContentByCommit: {
        [noteCommit]: manifestJson({ "WORKING-MEMORY.md": "mem" }),
      },
    }).io;
    const loadPointerIO = mockIO({
      head: "b".repeat(40),
      annotatedNoteCommits: [noteCommit],
      reachableHeadCommits: [],
      localSyncState: { sourceCommit: noteCommit, sourceOperation: "load" },
      noteContentByCommit: {
        [noteCommit]: manifestJson({ "WORKING-MEMORY.md": "mem" }),
      },
    }).io;

    const noPointer = await findNearestUserNote({ cwd: "/repo", io: noPointerIO, identity: "andrew" });
    const loadPointer = await findNearestUserNote({ cwd: "/repo", io: loadPointerIO, identity: "andrew" });

    expect(noPointer.note).toBeNull();
    expect(loadPointer.note).toBeNull();
  });
});

describe("runUserLoad — empty resolution", () => {
  it("returns null when no reachable note and no recent note source exists", async () => {
    const commit = "a".repeat(40);
    const { io } = mockIO({
      annotatedNoteCommits: [commit],
      reachableHeadCommits: [],
      notesHistory: [],
    });

    const result = await runUserLoad({
      cwd: "/repo",
      io,
      identity: "andrew",
    });

    expect(result).toBeNull();
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
        files: { "WORKING-MEMORY.md": "# Different" },
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
    expect(onDisk.priorFileList).toEqual(["WORKING-MEMORY.md"]);
  });
});

/** Records concurrent occupancy of `runUserSave`'s note-write critical section. */
interface CriticalSectionRecorder {
  active: number;
  maxActive: number;
  commits: string[];
}

/**
 * Save IO whose `writeNote` reports critical-section occupancy into a shared
 * recorder and holds the section open briefly — so two unserialized peers would
 * be caught overlapping (`maxActive > 1`). The lock keeps `maxActive` at 1.
 */
function concurrentSaveIO(
  head: string,
  recorder: CriticalSectionRecorder,
  config: { writeNoteThrows?: boolean } = {},
): UserIOContext {
  const files = { "WORKING-MEMORY.md": "# Notes" };
  let writtenNote: string | null = null;

  return {
    exec: vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: head, stderr: "" };
      }
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
        return { stdout: ".git\n", stderr: "" };
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const name = basename(filePath);
      const content = files[name as keyof typeof files];
      if (content === undefined) throw new Error(`unexpected file read: ${filePath}`);
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
    writeNote: vi.fn(async (_ref: string, content: string, commit?: string) => {
      recorder.active += 1;
      recorder.maxActive = Math.max(recorder.maxActive, recorder.active);
      // Hold the section open so an unserialized peer would overlap here.
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (config.writeNoteThrows) {
        recorder.active -= 1;
        throw new Error("write failed");
      }
      writtenNote = content;
      recorder.commits.push(commit ?? "");
      recorder.active -= 1;
    }),
    readNote: vi.fn(async () => writtenNote),
  };
}

describe("runUserSave — note-write serialization (advisory lock)", () => {
  let cwd: string;
  const headA = "aa".padEnd(40, "0");
  const headB = "bb".padEnd(40, "0");

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-save-lock-test-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("serializes two racing note writes so both land without collapsing to one", async () => {
    const recorder: CriticalSectionRecorder = { active: 0, maxActive: 0, commits: [] };

    await Promise.all([
      runUserSave({ cwd, io: concurrentSaveIO(headA, recorder), identity: "andrew" }),
      runUserSave({ cwd, io: concurrentSaveIO(headB, recorder), identity: "andrew" }),
    ]);

    // The lock keeps the two note writes from overlapping...
    expect(recorder.maxActive).toBe(1);
    // ...and both writes land — neither is silently dropped.
    expect([...recorder.commits].sort()).toEqual([headA, headB].sort());
  });

  it("releases the lock when the note write throws, so the next save proceeds", async () => {
    const recorder: CriticalSectionRecorder = { active: 0, maxActive: 0, commits: [] };

    const failingIo = concurrentSaveIO(headA, recorder, { writeNoteThrows: true });
    await expect(
      runUserSave({
        cwd,
        io: failingIo,
        identity: "andrew",
      }),
    ).rejects.toThrow("write failed");

    // The lock was released in `finally` despite the throw — no orphaned lockfile.
    expect(await exists(await getNotesLockPath(failingIo.exec, cwd, "andrew"))).toBe(false);

    // A subsequent save acquires cleanly rather than deadlocking on a stuck lock.
    const result = await runUserSave({
      cwd,
      io: concurrentSaveIO(headB, recorder),
      identity: "andrew",
    });
    expect(result.fileCount).toBe(1);
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
      if (args[0] === "rev-parse" && args[1] === "--git-common-dir") return { stdout: ".git\n", stderr: "" };
      if (args[0] === "log") return { stdout: historyCommit, stderr: "" };
      if (args[0] === "diff-tree") return { stdout: notePath, stderr: "" };
      if (args[0] === "show") {
        if (args[1] === `${historyCommit}:${notePath}`) return { stdout: noteManifest, stderr: "" };
        throw new Error(`missing note content: ${args[1] ?? ""}`);
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    }),
    readFile: vi.fn(async (filePath: string) => {
      const name = basename(filePath);
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
    files: { "WORKING-MEMORY.md": "# Notes" },
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
      if (args[0] === "notes" && args[2] === "list") {
        return { stdout: `${"0".repeat(40)} ${head}`, stderr: "" };
      }
      if (args[0] === "notes" && args[2] === "show") {
        return { stdout: noteContent, stderr: "" };
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
      if (args[0] === "rev-list" && args[1] === "HEAD") {
        return { stdout: head, stderr: "" };
      }
      if (args[0] === "merge-base" && args[1] === "--independent") {
        return { stdout: head, stderr: "" };
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
      const name = basename(filePath);
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
        files: { "WORKING-MEMORY.md": "# Notes" },
      },
      readback: { "WORKING-MEMORY.md": undefined },
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
        files: { "WORKING-MEMORY.md": "# Notes" },
      },
      readback: { "WORKING-MEMORY.md": "# Different content" },
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
        files: { "WORKING-MEMORY.md": "# Notes" },
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

  function realFsLoadIO(
    manifest: SyncManifest,
    options: {
      head?: string;
      noteCommit?: string;
      reachableHeadCommits?: string[];
      branch?: string;
    } = {},
  ): UserIOContext {
    const head = options.head ?? "f".repeat(40);
    const noteCommit = options.noteCommit ?? head;
    const reachableHeadCommits = options.reachableHeadCommits ?? [noteCommit];
    const branch = options.branch ?? "fix/current";
    const noteContent = JSON.stringify(manifest);
    const notePath = `${noteCommit.slice(0, 2)}/${noteCommit.slice(2)}`;
    return {
      exec: vi.fn(async (cmd: string, args: string[]) => {
        if (cmd !== "git") throw new Error(`unexpected exec: ${cmd}`);
        if (args[0] === "rev-parse" && args[1] === "HEAD") return { stdout: head, stderr: "" };
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
          return { stdout: branch, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: `${"0".repeat(40)} ${noteCommit}`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show") return { stdout: noteContent, stderr: "" };
        if (args[0] === "log") return { stdout: "nh0", stderr: "" };
        if (args[0] === "diff-tree") return { stdout: notePath, stderr: "" };
        if (args[0] === "show") return { stdout: noteContent, stderr: "" };
        if (args[0] === "rev-list" && args[1] === "HEAD") return { stdout: reachableHeadCommits.join("\n"), stderr: "" };
        if (args[0] === "merge-base" && args[1] === "--independent") {
          return { stdout: reachableHeadCommits.join("\n"), stderr: "" };
        }
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

  it("records a sentinel basis, not a notes-ref history commit, for cross-WU-only loads", async () => {
    const io = realFsLoadIO({
      version: 2,
      files: {
        "wu-a/SESSION-NOTES.md": "a-notes",
        "WORKING-MEMORY.md": "mem",
      },
    });

    const result = await runUserLoad({ cwd, io, identity: "andrew", currentWuName: "brand-new-wu" });

    expect(result?.kind).toBe("loaded");
    expect(await exists(join(userDir, "WORKING-MEMORY.md"))).toBe(true);
    expect(await exists(join(userDir, "wu-a", "SESSION-NOTES.md"))).toBe(false);
    const syncState = JSON.parse(
      await readFile(join(cwd, SYNC_STATE_RELATIVE), "utf-8"),
    ) as Record<string, unknown>;
    expect(syncState.sourceCommit).toBe(NO_COMPARABLE_SOURCE_COMMIT);
    expect(syncState.sourceCommit).not.toBe("nh0");
  });

  it("returns null instead of writing a sentinel sync state when no files are loadable", async () => {
    const io = realFsLoadIO({
      version: 2,
      files: {
        "wu-a/SESSION-NOTES.md": "a-notes",
      },
    });

    const result = await runUserLoad({ cwd, io, identity: "andrew", currentWuName: "brand-new-wu" });

    expect(result).toBeNull();
    expect(await exists(join(cwd, SYNC_STATE_RELATIVE))).toBe(false);
  });

  it("materializes an off-ancestry pointer fallback with current-WU filtering and branch labeling", async () => {
    const head = "b".repeat(40);
    const savedCommit = "a".repeat(40);
    const io = realFsLoadIO(
      {
        version: 2,
        files: {
          "wu-a/SESSION-NOTES.md": "a-notes",
          "wu-b/SESSION-NOTES.md": "b-notes",
          "WORKING-MEMORY.md": "mem",
        },
      },
      {
        head,
        noteCommit: savedCommit,
        reachableHeadCommits: [],
        branch: "fix/off-ancestry",
      },
    );
    await writeLocalSyncState(
      cwd, io, "andrew", "hash", savedCommit, "save", savedCommit,
      ["wu-a/SESSION-NOTES.md", "wu-b/SESSION-NOTES.md", "WORKING-MEMORY.md"],
    );

    const result = await runUserLoad({ cwd, io, identity: "andrew", currentWuName: "wu-a" });

    expect(result).toMatchObject({
      kind: "loaded",
      reachableFromHead: false,
      currentBranch: "fix/off-ancestry",
      fromAncestor: false,
      ancestorDistance: 0,
    });
    expect(await exists(join(userDir, "wu-a", "SESSION-NOTES.md"))).toBe(true);
    expect(await readFile(join(userDir, "wu-a", "SESSION-NOTES.md"), "utf-8")).toBe("a-notes");
    expect(await exists(join(userDir, "WORKING-MEMORY.md"))).toBe(true);
    expect(await exists(join(userDir, "wu-b", "SESSION-NOTES.md"))).toBe(false);
    const syncState = JSON.parse(
      await readFile(join(cwd, SYNC_STATE_RELATIVE), "utf-8"),
    ) as Record<string, unknown>;
    expect(syncState.sourceCommit).toBe(savedCommit);
    expect(syncState.sourceCommit).not.toBe(NO_COMPARABLE_SOURCE_COMMIT);
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
      exec: vi.fn(async (cmd: string, args: string[], options?: { cwd?: string }) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: ".git\n", stderr: "" };
        }
        throw new Error(`unexpected git call from ${options?.cwd ?? "<none>"}: ${cmd} ${args.join(" ")}`);
      }),
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

  function machineIdStore(root: string = cwd): string {
    return join(root, ".git", "arc", "user", identity, ".internal", ".machine-id");
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
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Notes", "utf-8");

    let writtenNote: string | null = null;
    const io = realFsIO({
      exec: vi.fn(async (cmd: string, args: string[]) => {
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: head, stderr: "" };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: ".git\n", stderr: "" };
        }
        throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
      }),
      readDir: vi.fn(async () => [{ name: "WORKING-MEMORY.md", size: 7 }]),
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
    await writeFile(join(userDir, "WORKING-MEMORY.md"), "# Concurrent A", "utf-8");

    const makeIO = (content: string): UserIOContext => {
      let writtenNote: string | null = null;
      return realFsIO({
        exec: vi.fn(async (cmd: string, args: string[]) => {
          if (cmd === "git" && args[0] === "rev-parse" && args[1] === "HEAD") {
            return { stdout: head, stderr: "" };
          }
          if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
            return { stdout: ".git\n", stderr: "" };
          }
          throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
        }),
        readFile: vi.fn(async (p: string) => {
          if (p.endsWith("WORKING-MEMORY.md")) return content;
          return readFile(p, "utf-8");
        }),
        readDir: vi.fn(async () => [{ name: "WORKING-MEMORY.md", size: content.length }]),
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
    const onDisk = (await readFile(machineIdStore(), "utf-8")).trim();
    expect(onDisk).toBe(id);
    expect(await exists(join(internalDir, ".machine-id"))).toBe(false);
  });

  it("stores machine-id in the git common dir so sibling worktrees share it without checkout pollution", async () => {
    const commonGitDir = join(cwd, ".git");
    const siblingCwd = join(dirname(cwd), `${basename(cwd)}-sibling`);
    await mkdir(siblingCwd, { recursive: true });
    const exec = vi.fn(async (cmd: string, args: string[], options?: { cwd?: string }) => {
      if (cmd === "git" && args[0] === "rev-parse" && args[1] === "--git-common-dir") {
        return { stdout: `${commonGitDir}\n`, stderr: "" };
      }
      throw new Error(`unexpected git call from ${options?.cwd ?? "<none>"}: ${cmd} ${args.join(" ")}`);
    });
    const io = realFsIO({ exec });

    const first = await getOrCreateMachineId(cwd, io, identity);
    const second = await getOrCreateMachineId(siblingCwd, io, identity);

    expect(second).toBe(first);
    expect(exec).toHaveBeenCalledWith("git", ["rev-parse", "--git-common-dir"], { cwd });
    expect(exec).toHaveBeenCalledWith("git", ["rev-parse", "--git-common-dir"], { cwd: siblingCwd });
    const commonStore = join(commonGitDir, "arc", "user", identity, ".internal", ".machine-id");
    expect((await readFile(commonStore, "utf-8")).trim()).toBe(first);
    expect(await exists(join(cwd, ".arc", "user", identity, ".internal", ".machine-id"))).toBe(false);
    expect(await exists(join(siblingCwd, ".arc", "user", identity, ".internal", ".machine-id"))).toBe(false);
  });

  it("returns the same machine-id on a subsequent read (idempotent — no regeneration)", async () => {
    const first = await getOrCreateMachineId(cwd, realFsIO(), identity);
    const second = await getOrCreateMachineId(cwd, realFsIO(), identity);

    expect(second).toBe(first);
    const onDisk = (await readFile(machineIdStore(), "utf-8")).trim();
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
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, winnerId, "utf-8");
      const err: NodeJS.ErrnoException = new Error("EEXIST: file already exists");
      err.code = "EEXIST";
      throw err;
    });

    const id = await getOrCreateMachineId(cwd, realFsIO(), identity, losingCreate);

    expect(id).toBe(winnerId);
    expect(losingCreate).toHaveBeenCalledOnce();
    const onDisk = (await readFile(machineIdStore(), "utf-8")).trim();
    expect(onDisk).toBe(winnerId);
  });

  it("rethrows a non-ENOENT read error rather than minting a second identity", async () => {
    // A permission error reading .machine-id is not "no id yet": masking it would
    // mint a fresh id and orphan this machine's sync-state marker key.
    const eacces: NodeJS.ErrnoException = new Error("EACCES: permission denied");
    eacces.code = "EACCES";
    const io = { ...realFsIO(), readFile: vi.fn(async () => Promise.reject(eacces)) };

    await expect(getOrCreateMachineId(cwd, io, identity)).rejects.toThrow("EACCES");
    // The error aborted before any create — no id was written behind it.
    expect(await exists(machineIdStore())).toBe(false);
  });

  it("adopts a legacy .sync-state.json machineId into .machine-id instead of minting fresh", async () => {
    const legacyId = "abcdef01-1234-4abc-89ab-001122334455";
    await writeFile(syncStatePath, `${JSON.stringify({ machineId: legacyId }, null, 2)}\n`, "utf-8");

    const id = await getOrCreateMachineId(cwd, realFsIO(), identity);

    // The established identity migrates, rather than a fresh mint orphaning its marker key.
    expect(id).toBe(legacyId);
    const onDisk = (await readFile(machineIdStore(), "utf-8")).trim();
    expect(onDisk).toBe(legacyId);
  });

  it("adopts a legacy checkout-local .machine-id into the common-dir store", async () => {
    const legacyId = "abcdef01-1234-4abc-89ab-001122334455";
    const legacyPath = join(internalDir, ".machine-id");
    await writeFile(legacyPath, legacyId, "utf-8");

    const id = await getOrCreateMachineId(cwd, realFsIO(), identity);

    expect(id).toBe(legacyId);
    expect((await readFile(machineIdStore(), "utf-8")).trim()).toBe(legacyId);
    expect((await readFile(legacyPath, "utf-8")).trim()).toBe(legacyId);
  });

  it("read-tolerates the legacy .sync-state.json machineId — never writes it back", async () => {
    const legacyId = "abcdef01-1234-4abc-89ab-001122334455";
    const before = `${JSON.stringify({ machineId: legacyId, materializedManifestHash: "x" }, null, 2)}\n`;
    await writeFile(syncStatePath, before, "utf-8");

    await getOrCreateMachineId(cwd, realFsIO(), identity);

    // The adopt is a one-way read: the legacy record is left byte-identical.
    expect(await readFile(syncStatePath, "utf-8")).toBe(before);
  });

  it("drops the machineId field from records it writes, even when a prior record carried one", async () => {
    const priorRecord = {
      version: 4,
      machineId: "abcdef01-1234-4abc-89ab-001122334455",
      materializedManifestHash: "old",
      sourceCommit: "a".repeat(40),
      sourceOperation: "save" as const,
    };
    await writeFile(syncStatePath, `${JSON.stringify(priorRecord, null, 2)}\n`, "utf-8");

    await writeLocalSyncState(cwd, realFsIO(), identity, "ab".repeat(8), "b".repeat(40), "save");

    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk.machineId).toBeUndefined();
    expect(onDisk.sourceCommit).toBe("b".repeat(40));
  });

  it("drops the legacy machineId field when clearing a partial-push marker", async () => {
    const priorRecord = {
      version: 4,
      machineId: "abcdef01-1234-4abc-89ab-001122334455",
      materializedManifestHash: "h",
      sourceCommit: "a".repeat(40),
      sourceOperation: "save" as const,
      partialPush: { localRefHash: "d".repeat(40), sourceCommit: "a".repeat(40) },
    };
    await writeFile(syncStatePath, `${JSON.stringify(priorRecord, null, 2)}\n`, "utf-8");

    await clearPartialPushMarker(cwd, realFsIO(), identity);

    const onDisk = JSON.parse(await readFile(syncStatePath, "utf-8")) as Record<string, unknown>;
    expect(onDisk.machineId).toBeUndefined();
    expect(onDisk.partialPush).toBeUndefined();
  });
});
