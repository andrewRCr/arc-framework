/** Unit coverage for proof-gated notes divergence reconciliation. */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserIOContext } from "../../src/commands/user/types.js";
import type { ReconcileNotesLock } from "../../src/commands/user/push-fetch.js";
import type { GitExec } from "../../src/lib/git/index.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  serializeNotesCompactionManifest,
  type NotesCompactionManifest,
} from "../../src/lib/user-sync/compaction-manifest.js";

const mockClearPartialPushMarker = vi.fn();

vi.mock("../../src/lib/user-sync/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/user-sync/index.js")>()),
  clearPartialPushMarker: (...args: unknown[]) => mockClearPartialPushMarker(...args),
}));

const { reconcileNotesPush } = await import("../../src/commands/user/push-fetch.js");

const REF = "refs/notes/arc/user/andrew";
const LOCAL_TIP = "1".repeat(40);
const REMOTE_TIP = "2".repeat(40);
const RACED_REMOTE_TIP = "3".repeat(40);
const MERGED_TIP = "4".repeat(40);
const NOTE_COMMIT = "a".repeat(40);
const MANIFEST_BLOB = "b".repeat(40);
const VALID_NOTE = JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "x" } });

interface ReconcileGitOptions {
  moveRemoteBeforeLockedFetch?: boolean;
  racedRemoteManifest?: NotesCompactionManifest | "malformed";
  postMergeHistory?: "empty" | "annotated";
  corruptMergedNote?: boolean;
  rejectRollback?: boolean;
  rejectRepush?: boolean;
}

interface ReconcileGit {
  exec: GitExec;
  calls: string[][];
  events: string[];
  localTip: () => string;
  remoteTip: () => string;
}

function buildReconcileGit(options: ReconcileGitOptions = {}): ReconcileGit {
  const calls: string[][] = [];
  const events: string[] = [];
  const fetched = new Map<string, string>();
  const manifestBlobs = new Map<string, string>();
  let localTip = LOCAL_TIP;
  let remoteTip = REMOTE_TIP;

  const manifestFor = (commitish: string): NotesCompactionManifest | "malformed" | null => {
    const tip = commitish === REF ? localTip : (fetched.get(commitish) ?? commitish);
    if (tip === RACED_REMOTE_TIP) return options.racedRemoteManifest ?? null;
    return null;
  };

  const exec: GitExec = async (_command, args) => {
    calls.push(args);
    switch (args[0]) {
      case "rev-parse": {
        const ref = args.at(-1) ?? "";
        if (ref === REF) return success(localTip);
        const tip = fetched.get(ref);
        if (tip !== undefined) return success(tip);
        throw gitError(`missing ref ${ref}`, 1);
      }
      case "ls-remote":
        return success(`${remoteTip}\t${REF}`);
      case "fetch": {
        const refspec = args.at(-1) ?? "";
        const destination = refspec.split(":")[1] ?? "";
        if (destination.includes("__incoming_") && options.moveRemoteBeforeLockedFetch === true) {
          remoteTip = RACED_REMOTE_TIP;
        }
        fetched.set(destination, remoteTip);
        events.push(destination.includes("__incoming_")
          ? `fetch:incoming:${remoteTip}`
          : `fetch:publication:${remoteTip}`);
        return success();
      }
      case "ls-tree": {
        const commitish = args[2] ?? "";
        const manifest = manifestFor(commitish);
        if (manifest === null) return success();
        manifestBlobs.set(
          MANIFEST_BLOB,
          manifest === "malformed" ? "not-json" : serializeNotesCompactionManifest(manifest),
        );
        return success(`100644 blob ${MANIFEST_BLOB}\t${NOTES_COMPACTION_MANIFEST_PATH}`);
      }
      case "cat-file":
        return success(manifestBlobs.get(args[2] ?? "") ?? "");
      case "merge-base":
        if (args[3] === MERGED_TIP) return success();
        throw gitError("not ancestor", 1);
      case "log":
        if (options.postMergeHistory === "annotated" && args.at(-1)?.endsWith(`..${MERGED_TIP}`) === true) {
          return success(`ARC-NOTES-HISTORY-COMMIT\0\0\nA\0${NOTE_COMMIT}\0`);
        }
        return success();
      case "notes":
        if (args[3] === "merge" && args.includes("cat_sort_uniq")) {
          localTip = MERGED_TIP;
          events.push("merge");
          return success();
        }
        if (args[3] === "list") {
          events.push("scan");
          return success(`note-object ${NOTE_COMMIT}`);
        }
        if (args[3] === "show") {
          return success(options.corruptMergedNote === true ? `${VALID_NOTE}\n${VALID_NOTE}` : VALID_NOTE);
        }
        if (args[3] === "merge" && args[4] === "--abort") return success();
        throw new Error(`unexpected notes command: ${args.join(" ")}`);
      case "push":
        events.push("push");
        if (options.rejectRepush === true) throw nonFastForward();
        remoteTip = (args[2] ?? "").split(":")[0] ?? remoteTip;
        return success();
      case "update-ref":
        if (args[1] === "-d") {
          fetched.delete(args[2] ?? "");
          events.push(`cleanup:${args[2] ?? ""}`);
          return success();
        }
        if (args[1] === REF) {
          if (options.rejectRollback === true) throw new Error("compare-and-swap rejected");
          localTip = args[2] ?? localTip;
          events.push("rollback");
          return success();
        }
        throw new Error(`unexpected update-ref: ${args.join(" ")}`);
      default:
        throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    }
  };

  return { exec, calls, events, localTip: () => localTip, remoteTip: () => remoteTip };
}

function buildIo(exec: GitExec): UserIOContext {
  return {
    exec,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readDir: vi.fn(),
    readNote: vi.fn(),
    writeNote: vi.fn(),
  } as unknown as UserIOContext;
}

function buildLock(events: string[]): ReconcileNotesLock {
  return {
    acquire: vi.fn(async () => {
      events.push("lock:acquire");
      return { path: "/repo/.notes.lock", pid: 1, token: "test" };
    }),
    release: vi.fn(async () => {
      events.push("lock:release");
    }),
  };
}

function compactionManifest(generation: number): NotesCompactionManifest {
  return { version: 1, generation, preCompactionTip: null, pruned: [] };
}

function success(stdout = ""): { stdout: string; stderr: string } {
  return { stdout, stderr: "" };
}

function gitError(message: string, code: number): Error {
  return Object.assign(new Error(message), { code });
}

function nonFastForward(): Error {
  return new Error("error: failed to push some refs\n ! [rejected] (non-fast-forward)");
}

function incomingLifecycle(calls: string[][]): { fetched: string; deleted: string[] } {
  const fetch = calls.find((args) => args[0] === "fetch" && args.at(-1)?.includes("__incoming_") === true);
  const fetched = fetch?.at(-1)?.split(":")[1] ?? "";
  const deleted = calls
    .filter((args) => args[0] === "update-ref" && args[1] === "-d")
    .map((args) => args[2] ?? "");
  return { fetched, deleted };
}

describe("reconcileNotesPush", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("merges under the lock, then recaptures and publishes after release", async () => {
    const git = buildReconcileGit();
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toEqual({ kind: "reconciled" });
    expect(git.remoteTip()).toBe(MERGED_TIP);
    expect(git.events.indexOf("merge")).toBeLessThan(git.events.indexOf("lock:release"));
    expect(git.events.indexOf("lock:release")).toBeLessThan(git.events.indexOf("push"));
    const incoming = incomingLifecycle(git.calls);
    expect(incoming.fetched).toMatch(/__incoming_/u);
    expect(incoming.deleted).toContain(incoming.fetched);
    expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
  });

  it("preserves the validated local merge when post-merge proof refuses", async () => {
    const git = buildReconcileGit({ postMergeHistory: "annotated" });
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toMatchObject({ kind: "refused", reason: "proof-unavailable" });
    expect(git.localTip()).toBe(MERGED_TIP);
    expect(git.remoteTip()).toBe(REMOTE_TIP);
    expect(git.events).not.toContain("push");
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("merges the fresh remote tip when origin moves before the locked fetch", async () => {
    const git = buildReconcileGit({ moveRemoteBeforeLockedFetch: true });
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toEqual({ kind: "reconciled" });
    expect(git.events).toContain(`fetch:incoming:${RACED_REMOTE_TIP}`);
    expect(git.remoteTip()).toBe(MERGED_TIP);
  });

  it("refuses a raced compaction boundary before merge and preserves both refs", async () => {
    const git = buildReconcileGit({
      moveRemoteBeforeLockedFetch: true,
      racedRemoteManifest: compactionManifest(1),
    });
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toMatchObject({ kind: "refused", reason: "compaction-lineage" });
    expect(git.localTip()).toBe(LOCAL_TIP);
    expect(git.remoteTip()).toBe(RACED_REMOTE_TIP);
    expect(git.events).not.toContain("merge");
    const incoming = incomingLifecycle(git.calls);
    expect(incoming.deleted).toContain(incoming.fetched);
  });

  it("fails malformed raced compaction metadata before merge", async () => {
    const git = buildReconcileGit({
      moveRemoteBeforeLockedFetch: true,
      racedRemoteManifest: "malformed",
    });
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toMatchObject({ kind: "failed" });
    expect(git.localTip()).toBe(LOCAL_TIP);
    expect(git.events).not.toContain("merge");
  });

  it("rolls back an unparseable merge and never publishes it", async () => {
    const git = buildReconcileGit({ corruptMergedNote: true });
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toMatchObject({ kind: "conflict" });
    expect(git.localTip()).toBe(LOCAL_TIP);
    expect(git.remoteTip()).toBe(REMOTE_TIP);
    expect(git.events).toContain("rollback");
    expect(git.events).not.toContain("push");
  });

  it("reports a post-plan non-fast-forward while preserving the merged local ref", async () => {
    const git = buildReconcileGit({ rejectRepush: true });
    const result = await reconcileNotesPush({
      io: buildIo(git.exec),
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(git.events),
    });

    expect(result).toMatchObject({ kind: "conflict" });
    expect(git.localTip()).toBe(MERGED_TIP);
    expect(git.remoteTip()).toBe(REMOTE_TIP);
  });
});
