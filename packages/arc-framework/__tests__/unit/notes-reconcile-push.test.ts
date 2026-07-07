/**
 * Unit tests for `reconcileNotesPush` — the auto-reconciling notes-leg pusher.
 *
 * On a non-fast-forward rejection of the shared user-notes ref (two worktrees
 * pushing concurrently), the pusher fetches the remote ref into a temp tracking
 * ref, merges it losslessly via `git notes merge -s cat_sort_uniq`, and
 * re-pushes — automatically, with no prompt. A clean push needs no merge. This
 * replaces the lossy re-save recovery for the notes leg; force-push stays an
 * explicit opt-in elsewhere.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ExecResult, GitExec, GitExecOptions } from "../../src/lib/git/index.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
import type { ReconcileNotesLock } from "../../src/commands/user/push-fetch.js";

const mockClearPartialPushMarker = vi.fn();

vi.mock("../../src/commands/user/save-load.js", () => ({
  clearPartialPushMarker: (...args: unknown[]) => mockClearPartialPushMarker(...args),
  runUserLoad: vi.fn(),
}));

const { reconcileNotesPush } = await import("../../src/commands/user/push-fetch.js");

const REF = "refs/notes/arc/user/andrew";
const TEMP_PREFIX = "refs/notes/arc/user/andrew__incoming_";
const SHORT_REF = "arc/user/andrew";
const NOTE_COMMIT = "c0ffeec0ffeec0ffeec0ffeec0ffeec0ffeec0ff";
const VALID_NOTE = JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "x" } });

type ResponseFn = (args: string[], options?: GitExecOptions) => ExecResult | Promise<ExecResult>;

interface ExecStub {
  exec: GitExec;
  calls: string[][];
}

/**
 * Build an exec whose responses are keyed by a space-joined arg prefix; `*`
 * matches any token. A response may be a value or a function (for stateful
 * cases such as a push that rejects once then succeeds).
 */
function buildExec(responses: Record<string, ExecResult | ResponseFn>): ExecStub {
  const calls: string[][] = [];
  const exec: GitExec = async (_cmd, args, options) => {
    calls.push(args);
    const key = matchKey(args, responses);
    if (key === null) throw new Error(`unmatched git invocation: ${args.join(" ")}`);
    const entry = responses[key];
    if (entry === undefined) throw new Error(`matched key '${key}' has no response`);
    return typeof entry === "function" ? entry(args, options) : entry;
  };
  return { exec, calls };
}

function matchKey(args: string[], responses: Record<string, unknown>): string | null {
  for (const key of Object.keys(responses)) {
    const tokens = key.split(" ");
    if (
      tokens.length === args.length
      && tokens.every((token, i) => token === "*" || args[i] === token)
    ) return key;
  }
  return null;
}

function fetchedTempRefs(calls: string[][]): string[] {
  return calls
    .filter((args) => args[0] === "fetch" && args[1] === "--refmap=" && args[2] === "origin")
    .map((args) => args[3]?.split(":")[1])
    .filter((ref): ref is string => typeof ref === "string" && ref.startsWith(TEMP_PREFIX));
}

function mergedTempRefs(calls: string[][]): string[] {
  return calls
    .filter(
      (args) =>
        args[0] === "notes"
        && args[1] === "--ref"
        && args[2] === SHORT_REF
        && args[3] === "merge"
        && args.includes("cat_sort_uniq"),
    )
    .map((args) => args[args.length - 1])
    .filter((ref): ref is string => typeof ref === "string" && ref.startsWith(TEMP_PREFIX));
}

function deletedTempRefs(calls: string[][]): string[] {
  return calls
    .filter((args) => args[0] === "update-ref" && args[1] === "-d")
    .map((args) => args[2])
    .filter((ref): ref is string => typeof ref === "string" && ref.startsWith(TEMP_PREFIX));
}

function expectSingleTempRefLifecycle(calls: string[][]): string {
  const fetchedRefs = fetchedTempRefs(calls);
  expect(fetchedRefs).toHaveLength(1);
  const [incoming] = fetchedRefs;
  expect(incoming).toBeDefined();
  if (incoming === undefined) throw new Error("missing fetched temp ref");
  expect(mergedTempRefs(calls)).toContain(incoming);
  expect(deletedTempRefs(calls)).toContain(incoming);
  return incoming;
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

function buildLock(events: string[] = []): ReconcileNotesLock {
  const handle = { path: "/repo/.git/arc/user/andrew/.internal/.notes.lock", pid: 1, token: "test" };
  return {
    acquire: vi.fn(async () => {
      events.push("lock:acquire");
      return handle;
    }),
    release: vi.fn(async () => {
      events.push("lock:release");
    }),
  };
}

const nonFastForward = (): never => {
  throw new Error("error: failed to push some refs\n ! [rejected] (non-fast-forward)");
};

describe("reconcileNotesPush", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("second push hits non-ff → fetches, notes-merges, and re-pushes successfully", async () => {
    let pushCount = 0;
    const events: string[] = [];
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: { stdout: "localhash", stderr: "" },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => {
        events.push(`push:${pushCount + 1}`);
        pushCount += 1;
        if (pushCount === 1) return nonFastForward();
        return { stdout: "", stderr: "" };
      },
      [`fetch --refmap= origin *`]: () => {
        events.push("fetch");
        return { stdout: "", stderr: "" };
      },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: () => {
        events.push("merge");
        return { stdout: "", stderr: "" };
      },
      [`notes --ref ${SHORT_REF} list`]: () => {
        events.push("scan");
        return { stdout: `noteobj ${NOTE_COMMIT}`, stderr: "" };
      },
      [`notes --ref ${SHORT_REF} show *`]: { stdout: VALID_NOTE, stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);
    const lock = buildLock(events);

    const result = await reconcileNotesPush({ io, identity: "andrew", cwd: "/repo", lock });

    expect(result.kind).toBe("reconciled");
    expect(events).toEqual([
      "push:1",
      "lock:acquire",
      "fetch",
      "merge",
      "scan",
      "lock:release",
      "push:2",
    ]);

    // The lossless cat_sort_uniq notes merge fired against the fetched temp ref.
    expectSingleTempRefLifecycle(calls);

    // Push fired twice: the rejected attempt, then the post-merge re-push.
    const pushes = calls.filter((args) => args[0] === "push");
    expect(pushes).toHaveLength(2);
  });

  it("second non-ff during reconcile re-push → conflict and temp ref cleanup", async () => {
    let pushCount = 0;
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: { stdout: "localhash", stderr: "" },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => {
        pushCount += 1;
        if (pushCount <= 2) return nonFastForward();
        return { stdout: "", stderr: "" };
      },
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} list`]: { stdout: `noteobj ${NOTE_COMMIT}`, stderr: "" },
      [`notes --ref ${SHORT_REF} show *`]: { stdout: VALID_NOTE, stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.message).toContain("reconcile re-push");
    }
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(2);
    expectSingleTempRefLifecycle(calls);
    expect(calls.some((args) => args[0] === "update-ref" && args[1] === REF)).toBe(false);
  });

  it("clean fast-forward push → no fetch or merge invoked", async () => {
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: { stdout: "localhash", stderr: "" },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({ io, identity: "andrew", cwd: "/repo" });

    expect(result.kind).toBe("pushed");
    expect(calls.some((args) => args[0] === "notes" && args.includes("merge"))).toBe(false);
    expect(calls.some((args) => args[0] === "fetch")).toBe(false);
  });

  it("remote already matches local → noop, no push or merge", async () => {
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: { stdout: "samehash", stderr: "" },
      [`ls-remote origin ${REF}`]: { stdout: `samehash\t${REF}`, stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({ io, identity: "andrew", cwd: "/repo" });

    expect(result.kind).toBe("noop");
    expect(calls.some((args) => args[0] === "push")).toBe(false);
    expect(calls.some((args) => args[0] === "notes")).toBe(false);
  });

  it("same-commit collision yields an unparseable merged note → conflict, no re-push, ref rolled back", async () => {
    const noteA = JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "from-a" } });
    const noteB = JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "from-b" } });
    let revParseCount = 0;
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: () => {
        revParseCount += 1;
        if (revParseCount === 1) return { stdout: "local-tip", stderr: "" };
        return { stdout: revParseCount === 2 ? "premerge-tip" : "postmerge-tip", stderr: "" };
      },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => nonFastForward(),
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} list`]: { stdout: `noteobj ${NOTE_COMMIT}`, stderr: "" },
      // cat_sort_uniq concatenated two manifests for the same commit → invalid JSON.
      [`notes --ref ${SHORT_REF} show *`]: { stdout: `${noteA}\n${noteB}`, stderr: "" },
      [`update-ref ${REF} premerge-tip postmerge-tip`]: { stdout: "", stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("conflict");
    // The corrupt merge was never pushed — only the initial rejected push fired.
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(1);
    // Local ref rolled back to its pre-merge tip; nothing corrupt persisted.
    expect(
      calls.some((args) =>
        args[0] === "update-ref"
        && args[1] === REF
        && args[2] === "premerge-tip"
        && args[3] === "postmerge-tip",
      ),
    ).toBe(true);
  });

  it("CAS-declined corrupt rollback reports conflict and does not re-push", async () => {
    const noteA = JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "from-a" } });
    const noteB = JSON.stringify({ version: 2, files: { "SESSION-NOTES.md": "from-b" } });
    let revParseCount = 0;
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: () => {
        revParseCount += 1;
        if (revParseCount === 1) return { stdout: "local-tip", stderr: "" };
        return { stdout: revParseCount === 2 ? "premerge-tip" : "postmerge-tip", stderr: "" };
      },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => nonFastForward(),
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} list`]: { stdout: `noteobj ${NOTE_COMMIT}`, stderr: "" },
      [`notes --ref ${SHORT_REF} show *`]: { stdout: `${noteA}\n${noteB}`, stderr: "" },
      [`update-ref ${REF} premerge-tip postmerge-tip`]: () => {
        throw new Error("fatal: cannot lock ref: is at newer-tip but expected postmerge-tip");
      },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.message).toContain("rollback could not be applied safely");
    }
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(1);
  });

  it("notes-list scan failure fails closed, rolls back, and does not re-push", async () => {
    let revParseCount = 0;
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: () => {
        revParseCount += 1;
        if (revParseCount === 1) return { stdout: "local-tip", stderr: "" };
        return { stdout: revParseCount === 2 ? "premerge-tip" : "postmerge-tip", stderr: "" };
      },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => nonFastForward(),
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} list`]: () => {
        throw new Error("fatal: failed to read notes tree");
      },
      [`update-ref ${REF} premerge-tip postmerge-tip`]: { stdout: "", stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.message).toContain("could not be verified");
    }
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(1);
    expect(
      calls.some((args) =>
        args[0] === "update-ref"
        && args[1] === REF
        && args[2] === "premerge-tip"
        && args[3] === "postmerge-tip",
      ),
    ).toBe(true);
  });

  it("per-note show failure fails closed, rolls back, and does not re-push", async () => {
    let revParseCount = 0;
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: () => {
        revParseCount += 1;
        if (revParseCount === 1) return { stdout: "local-tip", stderr: "" };
        return { stdout: revParseCount === 2 ? "premerge-tip" : "postmerge-tip", stderr: "" };
      },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => nonFastForward(),
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} list`]: { stdout: `noteobj ${NOTE_COMMIT}`, stderr: "" },
      [`notes --ref ${SHORT_REF} show *`]: () => {
        throw new Error("fatal: failed to read note blob");
      },
      [`update-ref ${REF} premerge-tip postmerge-tip`]: { stdout: "", stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.message).toContain(NOTE_COMMIT.slice(0, 8));
      expect(result.message).toContain("could not be verified");
    }
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(1);
    expect(
      calls.some((args) =>
        args[0] === "update-ref"
        && args[1] === REF
        && args[2] === "premerge-tip"
        && args[3] === "postmerge-tip",
      ),
    ).toBe(true);
  });

  it("empty notes list after merge is clean and allows the re-push", async () => {
    let pushCount = 0;
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: { stdout: "localhash", stderr: "" },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => {
        pushCount += 1;
        if (pushCount === 1) return nonFastForward();
        return { stdout: "", stderr: "" };
      },
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} list`]: { stdout: "", stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("reconciled");
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(2);
  });

  it("notes-merge command failure → conflict, merge aborted", async () => {
    const { exec, calls } = buildExec({
      [`rev-parse --verify ${REF}`]: { stdout: "premerge-tip", stderr: "" },
      [`ls-remote origin ${REF}`]: { stdout: `remotehash\t${REF}`, stderr: "" },
      [`push origin ${REF}`]: () => nonFastForward(),
      [`fetch --refmap= origin *`]: { stdout: "", stderr: "" },
      [`notes --ref ${SHORT_REF} merge -s cat_sort_uniq *`]: () => {
        throw new Error("fatal: a notes merge is already in-progress");
      },
      [`notes --ref ${SHORT_REF} merge --abort`]: { stdout: "", stderr: "" },
      [`update-ref -d *`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await reconcileNotesPush({
      io,
      identity: "andrew",
      cwd: "/repo",
      lock: buildLock(),
    });

    expect(result.kind).toBe("conflict");
    expect(calls.some((args) => args[0] === "notes" && args.includes("--abort"))).toBe(true);
    expect(calls.filter((args) => args[0] === "push")).toHaveLength(1);
  });
});
