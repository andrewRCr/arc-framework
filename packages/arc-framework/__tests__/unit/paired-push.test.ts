/**
 * Unit tests for runPairedPush — paired worktree + notes push helper.
 *
 * Covers worst-outcome semantics, push-ordering invariant, partial-push marker
 * recording on partial failure, pre-check blocking, force-push advisory
 * refusal, and the injected-notes-pusher delegate. The pushability matrix
 * itself is tested in __tests__/unit/git/pushability.test.ts; these tests
 * exercise orchestration around it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../src/lib/git/index.js";
import type {
  PairedPushMarkerContext,
  PairedPushMarkerPublisher,
  PairedPushNotesContext,
  PairedPushNotesPusher,
  PairedPushNotesPusherResult,
  UserIOContext,
} from "../../src/commands/user/types.js";

const mockRecordPartialPushMarker = vi.fn();
const mockClearPartialPushMarker = vi.fn();
const mockRunUserSave = vi.fn();
const mockPlanNotesExport = vi.fn();
const mockCleanupNotesExport = vi.fn();

vi.mock("../../src/commands/user/save-load.js", () => ({
  runUserSave: (opts: unknown) => mockRunUserSave(opts),
}));

vi.mock("../../src/lib/user-sync/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/user-sync/index.js")>()),
  recordPartialPushMarker: (...args: unknown[]) => mockRecordPartialPushMarker(...args),
  clearPartialPushMarker: (...args: unknown[]) => mockClearPartialPushMarker(...args),
}));

const { UserSaveError } = await import("../../src/commands/user/types.js");

const { runPairedPush } = await import("../../src/commands/user/paired-push.js");

// --- Test fixtures ---

type ResponseFn = (
  args: string[],
  options?: GitExecOptions,
) => ExecResult | Promise<ExecResult>;

interface ExecStub {
  exec: GitExec;
  calls: Array<{ args: string[] }>;
}

function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
  pushEvents?: string[],
): ExecStub {
  const calls: Array<{ args: string[] }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ args });
    if (pushEvents !== undefined && args[0] === "push") {
      pushEvents.push(args.join(" "));
    }
    void cmd;
    const key = matchKey(args, responses);
    if (key === null) {
      throw new Error(`unmatched git invocation: ${args.join(" ")}`);
    }
    const entry = responses[key];
    if (entry === undefined) {
      throw new Error(`matched key '${key}' has no response`);
    }
    return typeof entry === "function" ? entry(args, options) : entry;
  };
  return { exec, calls };
}

function matchKey(
  args: string[],
  responses: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(responses)) {
    const tokens = key.split(" ");
    if (tokens.every((token, i) => token === "*" || args[i] === token)) {
      return key;
    }
  }
  return null;
}

/** Build an access function whose `present` paths resolve, others reject. */
function buildAccess(present: string[]): (path: string) => Promise<void> {
  const set = new Set(present);
  return async (path: string) => {
    if (!set.has(path)) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  };
}

const REBASE_MERGE_PATH = "rev-parse --git-path rebase-merge";
const REBASE_APPLY_PATH = "rev-parse --git-path rebase-apply";
const REV_PARSE_HEAD = "rev-parse --abbrev-ref HEAD";
const REV_PARSE_UPSTREAM = "rev-parse --abbrev-ref @{upstream}";
const CONFIG_GET_FETCH = "config --get-all remote.origin.fetch";

/** Common exec responses for a clean repository on branch 'main'. */
function cleanRepoResponses(): Record<string, ExecResult | ResponseFn> {
  return {
    [REBASE_MERGE_PATH]: { stdout: "/repo/.git/rebase-merge", stderr: "" },
    [REBASE_APPLY_PATH]: { stdout: "/repo/.git/rebase-apply", stderr: "" },
    [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
    [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
    [CONFIG_GET_FETCH]: {
      stdout:
        "+refs/heads/*:refs/remotes/origin/*\n+refs/notes/arc/user/*:refs/notes/arc/user/*",
      stderr: "",
    },
    "push origin main": { stdout: "", stderr: "" },
  };
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

interface PushNotesStub {
  pushNotes: PairedPushNotesPusher;
  calls: PairedPushNotesContext[];
}

function stubPushNotes(
  result: PairedPushNotesPusherResult | ((ctx: PairedPushNotesContext) => PairedPushNotesPusherResult),
): PushNotesStub {
  const calls: PairedPushNotesContext[] = [];
  const pushNotes: PairedPushNotesPusher = async (context) => {
    calls.push(context);
    return typeof result === "function" ? result(context) : result;
  };
  return { pushNotes, calls };
}

interface PublishMarkerStub {
  publishMarker: PairedPushMarkerPublisher;
  calls: PairedPushMarkerContext[];
}

/**
 * Marker-publish stub that records each invocation (and order, when an `order`
 * sink is passed). `throws: true` exercises the best-effort isolation guard.
 */
function stubPublishMarker(opts?: { order?: string[]; throws?: boolean }): PublishMarkerStub {
  const calls: PairedPushMarkerContext[] = [];
  const publishMarker: PairedPushMarkerPublisher = async (context) => {
    calls.push(context);
    opts?.order?.push("marker");
    if (opts?.throws === true) throw new Error("marker publish boom");
  };
  return { publishMarker, calls };
}

const COMMON_OPTIONS = {
  identity: "andrew",
  cwd: "/repo",
  branch: "main",
  planNotesExport: mockPlanNotesExport,
  cleanupNotesExport: mockCleanupNotesExport,
};

const NOTES_EXPORT_TARGET = {
  ref: "refs/notes/arc/user/andrew__branch_export_test",
  destinationRef: "refs/notes/arc/user/andrew",
  tip: "f".repeat(40),
  annotatedCommits: ["a".repeat(40)],
  omittedCommits: [],
  supersedesLocal: true,
  localIncludesRemote: true,
};

/** No-op delay so auto-retry tests don't wait on real backoff timers. */
const noopSleep = async (): Promise<void> => {};

describe("runPairedPush", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockPlanNotesExport.mockResolvedValue({ kind: "planned", target: NOTES_EXPORT_TARGET });
    mockCleanupNotesExport.mockResolvedValue(undefined);
    mockRecordPartialPushMarker.mockResolvedValue(true);
  });

  it("save and both push legs succeed → result reports success; save precedes pushes", async () => {
    const events: string[] = [];
    mockRunUserSave.mockImplementation(async () => {
      events.push("save");
      return {
        identity: "andrew",
        commit: "abc1234",
        fileCount: 1,
        warnings: [],
      };
    });
    const { exec, calls } = buildExec(cleanRepoResponses(), events);
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(0);
    expect(result.save).toEqual({
      status: "success",
      result: {
        identity: "andrew",
        commit: "abc1234",
        fileCount: 1,
        warnings: [],
      },
    });
    expect(result.worktree).toMatchObject({ status: "success" });
    expect(result.notes).toEqual({ status: "success" });
    expect(mockRunUserSave).toHaveBeenCalledWith({
      cwd: "/repo",
      io,
      identity: "andrew",
    });

    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([["push", "origin", "main"]]);

    expect(notesCalls).toHaveLength(1);
    expect(notesCalls[0]).toEqual({
      io,
      identity: "andrew",
      cwd: "/repo",
      access,
      worktreeBranch: "main",
      notesExportTarget: NOTES_EXPORT_TARGET,
    });

    expect(events).toEqual(["save", "push origin main"]);
    expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
    expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
    expect(mockClearPartialPushMarker).toHaveBeenCalledWith(
      "/repo",
      io,
      "andrew",
    );
  });

  it("save failure short-circuits both push legs", async () => {
    const saveError = new UserSaveError("No eligible files found in user directory to save.");
    mockRunUserSave.mockRejectedValue(saveError);
    const { exec, calls } = buildExec(cleanRepoResponses());
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(1);
    expect(result.save).toEqual({ status: "failed", error: saveError });
    expect(result.worktree).toEqual({
      status: "skipped",
      reason: "save-failed",
    });
    expect(result.notes).toEqual({
      status: "skipped",
      reason: "save-failed",
    });

    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([]);
    expect(notesCalls).toEqual([]);
    expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("worktree succeeds, notes-pusher returns failed → mixed result; partial-push marker recorded", async () => {
    const notesError = new Error("[remote rejected] notes/arc/user/andrew");
    const { exec } = buildExec(cleanRepoResponses());
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes } = stubPushNotes({ status: "failed", error: notesError });

    const result = await runPairedPush({ io, access, pushNotes, sleep: noopSleep, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(1);
    expect(result.save?.status).toBe("success");
    expect(result.worktree).toMatchObject({ status: "success" });
    expect(result.notes).toEqual({ status: "failed", error: notesError });
    expect(result.partialPushMarkerRecorded).toBe(true);

    expect(mockRecordPartialPushMarker).toHaveBeenCalledTimes(1);
    expect(mockRecordPartialPushMarker).toHaveBeenCalledWith(
      "/repo",
      io,
      "andrew",
    );
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("notes failure reports when the partial-push marker could not be recorded", async () => {
    const notesError = new Error("[remote rejected] notes/arc/user/andrew");
    mockRecordPartialPushMarker.mockResolvedValue(false);
    const { exec } = buildExec(cleanRepoResponses());
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes } = stubPushNotes({ status: "failed", error: notesError });

    const result = await runPairedPush({ io, access, pushNotes, sleep: noopSleep, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(1);
    expect(result.notes).toEqual({ status: "failed", error: notesError });
    expect(result.partialPushMarkerRecorded).toBe(false);
    expect(mockRecordPartialPushMarker).toHaveBeenCalledTimes(1);
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("push-ordering invariant: notes-pusher never fires when worktree push fails", async () => {
    const responses = cleanRepoResponses();
    const worktreeError = new Error("error: failed to push some refs to 'origin'");
    responses["push origin main"] = () => {
      throw worktreeError;
    };
    const { exec, calls } = buildExec(responses);
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(1);
    expect(result.save?.status).toBe("success");
    expect(result.worktree).toMatchObject({ status: "failed", error: worktreeError });
    expect(result.notes).toEqual({
      status: "skipped",
      reason: "preceding-leg-failed",
    });

    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([["push", "origin", "main"]]);
    expect(notesCalls).toEqual([]);

    expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("pre-check failure (rebase in progress) → neither leg fires; condition surfaced", async () => {
    const { exec, calls } = buildExec(cleanRepoResponses());
    const io = buildIo(exec);
    const access = buildAccess(["/repo/.git/rebase-merge"]);
    const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(1);
    expect(result.save).toEqual({
      status: "skipped",
      reason: "blocked-by-precheck",
    });
    expect(result.worktree).toEqual({
      status: "skipped",
      reason: "blocked-by-precheck",
    });
    expect(result.notes).toEqual({
      status: "skipped",
      reason: "blocked-by-precheck",
    });

    const rebase = result.conditions.find((c) => c.kind === "rebase-in-progress");
    expect(rebase?.disposition).toBe("block");
    expect(rebase?.rebaseForm).toBe("rebase-merge");

    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([]);
    expect(notesCalls).toEqual([]);

    expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("force-push-required advisory refuses paired flow even though matrix marks allowed", async () => {
    const { exec, calls } = buildExec(cleanRepoResponses());
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({
      io,
      access,
      pushNotes,
      worktreeSyncState: "diverged",
      ...COMMON_OPTIONS,
    });

    expect(result.exitCode).toBe(1);
    expect(result.save).toEqual({ status: "skipped", reason: "blocked-by-precheck" });
    expect(result.worktree).toEqual({ status: "skipped", reason: "blocked-by-precheck" });
    expect(result.notes).toEqual({ status: "skipped", reason: "blocked-by-precheck" });

    const advisory = result.conditions.find((c) => c.kind === "force-push-required");
    expect(advisory?.disposition).toBe("advisory");

    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([]);
    expect(notesCalls).toEqual([]);
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "noop" } as const, true],
    [{ status: "ok-recovered", via: "force" } as const, true],
    [{ status: "ok-recovered", via: "merge" } as const, true],
  ])(
    "notes-pusher recovery outcome %j → success; clear partial-push marker",
    async (outcome, expectClear) => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { pushNotes } = stubPushNotes(outcome);

      const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

      expect(result.exitCode).toBe(0);
      expect(result.notes).toEqual(outcome);
      expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
      if (expectClear) {
        expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
      }
    },
  );

  it.each([
    [{ status: "cancelled" } as const],
    [{ status: "no-remote" } as const],
    [{ status: "failed-nontty-conflict" } as const],
    [
      {
        status: "blocked",
        conditions: [
          {
            kind: "detached-head",
            disposition: "block",
            guidance: "detached head",
          },
        ],
      } satisfies PairedPushNotesPusherResult,
    ],
  ])(
    "notes-pusher non-success outcome %j → marker recorded; exitCode 1",
    async (outcome) => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { pushNotes } = stubPushNotes(outcome);

      const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

      expect(result.exitCode).toBe(1);
      expect(result.notes).toEqual(outcome);
      expect(result.partialPushMarkerRecorded).toBe(true);
      expect(mockRecordPartialPushMarker).toHaveBeenCalledTimes(1);
      expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
    },
  );

  it("setUpstream: true → worktree push fires with -u; caller-resolvable no-upstream filtered from refusal", async () => {
    const responses = cleanRepoResponses();
    // Simulate the no-upstream branch state: REV_PARSE_UPSTREAM throws.
    responses[REV_PARSE_UPSTREAM] = () => {
      throw new Error("fatal: no upstream configured for branch 'main'");
    };
    const { exec, calls } = buildExec(responses);
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({
      io,
      access,
      pushNotes,
      ...COMMON_OPTIONS,
      setUpstream: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.worktree).toMatchObject({ status: "success" });
    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([["push", "origin", "main", "-u"]]);
  });

  it("setUpstream success path does not surface the resolved no-upstream condition (no stderr leak)", async () => {
    const responses = cleanRepoResponses();
    responses[REV_PARSE_UPSTREAM] = () => {
      throw new Error("fatal: no upstream configured for branch 'main'");
    };
    const { exec } = buildExec(responses);
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({
      io, access, pushNotes, ...COMMON_OPTIONS, setUpstream: true,
    });

    expect(result.exitCode).toBe(0);
    // The no-upstream condition was auto-resolved by the `-u` push; it must not
    // remain in the surfaced conditions, or renderPairedResult would log its
    // "Set upstream first" guidance to stderr on a successful upstream-init sync.
    expect(result.conditions.some((c) => c.kind === "no-upstream-branch")).toBe(false);
  });

  it("setUpstream notes-plan miss does not surface the resolved no-upstream condition", async () => {
    const responses = cleanRepoResponses();
    responses[REV_PARSE_UPSTREAM] = () => {
      throw new Error("fatal: no upstream configured for branch 'main'");
    };
    mockPlanNotesExport.mockResolvedValue({ kind: "skipped", reason: "empty-export" });
    const { exec } = buildExec(responses);
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({
      io, access, pushNotes, ...COMMON_OPTIONS, setUpstream: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.worktree).toMatchObject({ status: "success" });
    expect(result.notes).toMatchObject({
      status: "refused",
      message: expect.stringContaining("empty-export"),
    });
    expect(result.conditions.some((c) => c.kind === "no-upstream-branch")).toBe(false);
  });

  it("setUpstream: false (default) with no-upstream → refuses before save fires", async () => {
    const responses = cleanRepoResponses();
    responses[REV_PARSE_UPSTREAM] = () => {
      throw new Error("fatal: no upstream configured for branch 'main'");
    };
    const { exec, calls } = buildExec(responses);
    const io = buildIo(exec);
    const access = buildAccess([]);
    const { pushNotes } = stubPushNotes({ status: "success" });

    const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

    expect(result.exitCode).toBe(1);
    expect(result.save).toEqual({ status: "skipped", reason: "blocked-by-precheck" });
    expect(result.worktree).toEqual({ status: "skipped", reason: "blocked-by-precheck" });
    expect(mockRunUserSave).not.toHaveBeenCalled();
    const pushArgs = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushArgs).toEqual([]);
  });

  describe("marker-before-notes publish", () => {
    it("publishMarker fires after the worktree push and before the notes leg", async () => {
      const order: string[] = [];
      mockRunUserSave.mockImplementation(async () => {
        order.push("save");
        return { identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] };
      });
      const { exec } = buildExec(cleanRepoResponses(), order);
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { publishMarker, calls: markerCalls } = stubPublishMarker({ order });
      const notesCalls: PairedPushNotesContext[] = [];
      const pushNotes: PairedPushNotesPusher = async (context) => {
        notesCalls.push(context);
        order.push("notes");
        return { status: "success" };
      };

      const result = await runPairedPush({
        io, access, pushNotes, publishMarker, ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(0);
      // Worktree push, then marker, then notes — the producer ordering invariant.
      expect(order).toEqual(["save", "push origin main", "marker", "notes"]);
      expect(markerCalls).toEqual([
        {
          io,
          identity: "andrew",
          cwd: "/repo",
          worktreeBranch: "main",
          notesExportTarget: NOTES_EXPORT_TARGET,
        },
      ]);
      expect(notesCalls).toHaveLength(1);
    });

    it("publishMarker never fires when the worktree push fails", async () => {
      const responses = cleanRepoResponses();
      responses["push origin main"] = () => {
        throw new Error("error: failed to push some refs to 'origin'");
      };
      const { exec } = buildExec(responses);
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { publishMarker, calls: markerCalls } = stubPublishMarker();
      const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

      const result = await runPairedPush({
        io, access, pushNotes, publishMarker, ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(1);
      expect(result.worktree).toMatchObject({ status: "failed" });
      expect(markerCalls).toEqual([]);
      expect(notesCalls).toEqual([]);
    });

    it("publishMarker never fires when the pre-check blocks both legs", async () => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess(["/repo/.git/rebase-merge"]);
      const { publishMarker, calls: markerCalls } = stubPublishMarker();
      const { pushNotes } = stubPushNotes({ status: "success" });

      const result = await runPairedPush({
        io, access, pushNotes, publishMarker, ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(1);
      expect(markerCalls).toEqual([]);
      expect(mockRunUserSave).not.toHaveBeenCalled();
    });

    it("a throwing publishMarker delegate never breaks the notes leg (best-effort)", async () => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { publishMarker } = stubPublishMarker({ throws: true });
      const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

      const result = await runPairedPush({
        io, access, pushNotes, publishMarker, ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(0);
      expect(result.notes).toEqual({ status: "success" });
      expect(notesCalls).toHaveLength(1);
    });

    it("absent publishMarker → notes leg proceeds unchanged (degrade-safe default)", async () => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { pushNotes, calls: notesCalls } = stubPushNotes({ status: "success" });

      const result = await runPairedPush({ io, access, pushNotes, ...COMMON_OPTIONS });

      expect(result.exitCode).toBe(0);
      expect(result.notes).toEqual({ status: "success" });
      expect(notesCalls).toHaveLength(1);
    });
  });

  describe("notes-leg auto-retry", () => {
    it("notes leg fails transiently then succeeds on auto-retry → success; marker cleared, no offer", async () => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      let n = 0;
      const pushNotes: PairedPushNotesPusher = async () => {
        n += 1;
        return n === 1 ? { status: "failed", error: new Error("transient blip") } : { status: "success" };
      };

      const result = await runPairedPush({
        io, access, pushNotes, sleep: noopSleep, ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(0);
      expect(result.notes).toEqual({ status: "success" });
      expect(result.retryOffer).toBeUndefined();
      expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
      expect(mockRecordPartialPushMarker).not.toHaveBeenCalled();
      expect(n).toBe(2);
    });

    it("notes leg persistently fails → bounded retry, offer surfaced, marker recorded; never blocks", async () => {
      const notesError = new Error("[remote rejected] notes/arc/user/andrew");
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { pushNotes, calls } = stubPushNotes({ status: "failed", error: notesError });

      const result = await runPairedPush({
        io, access, pushNotes, sleep: noopSleep,
        notesRetryConfig: { maxAutoRetries: 2, backoffMs: [0, 0] },
        ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(1);
      expect(result.notes).toEqual({ status: "failed", error: notesError });
      // Structured offer (not a throw, not a silent swallow) for the caller to resolve.
      expect(result.retryOffer).toEqual({ autoRetries: 2 });
      expect(mockRecordPartialPushMarker).toHaveBeenCalledTimes(1);
      expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
      // Bounded: one initial attempt + maxAutoRetries before surfacing.
      expect(calls).toHaveLength(3);
    });

    it("a terminal notes failure surfaces the offer without auto-retrying", async () => {
      const { exec } = buildExec(cleanRepoResponses());
      const io = buildIo(exec);
      const access = buildAccess([]);
      const { pushNotes, calls } = stubPushNotes({ status: "no-remote" });

      const result = await runPairedPush({
        io, access, pushNotes, sleep: noopSleep, ...COMMON_OPTIONS,
      });

      expect(result.exitCode).toBe(1);
      expect(result.notes).toEqual({ status: "no-remote" });
      expect(result.retryOffer).toEqual({ autoRetries: 0 });
      expect(mockRecordPartialPushMarker).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(1);
    });
  });
});
