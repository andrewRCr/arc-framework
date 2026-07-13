/**
 * Unit tests for runUserPush — focused on the idempotent no-op recovery path.
 *
 * The pre-check matrix and divergence-recovery paths are covered elsewhere
 * (pushability.test.ts, push-recovery.test.ts). These tests exercise the
 * remote-ref-state probe that lets `arc user push` no-op when the remote
 * already matches local — the recovery semantic that makes "re-run
 * `arc user push`" reliably idempotent after a partial-push failure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../src/lib/git/index.js";
import type { UserIOContext } from "../../src/commands/user/types.js";

const mockClearPartialPushMarker = vi.fn();
const mockRecordPartialPushMarker = vi.fn();
const mockRunUserLoad = vi.fn();

vi.mock("../../src/commands/user/save-load.js", () => ({
  runUserLoad: (...args: unknown[]) => mockRunUserLoad(...args),
}));

vi.mock("../../src/lib/user-sync/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/user-sync/index.js")>()),
  clearPartialPushMarker: (...args: unknown[]) => mockClearPartialPushMarker(...args),
  recordPartialPushMarker: (...args: unknown[]) => mockRecordPartialPushMarker(...args),
}));

const { runUserFetch, runUserPull, runUserPush } = await import("../../src/commands/user/push-fetch.js");

// --- Test fixtures ---

type ResponseFn = (
  args: string[],
  options?: GitExecOptions,
) => ExecResult | Promise<ExecResult>;

interface ExecStub {
  exec: GitExec;
  calls: Array<{ args: string[] }>;
}

function buildExec(responses: Record<string, ExecResult | ResponseFn>): ExecStub {
  const calls: Array<{ args: string[] }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ args });
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
    if (tokens.length === args.length && tokens.every((token, i) => token === "*" || args[i] === token)) {
      return key;
    }
  }
  return null;
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

const NOTES_REF = "refs/notes/arc/user/andrew";
const LOCAL_TIP = "1111111111111111111111111111111111111111";
const REMOTE_TIP = "2222222222222222222222222222222222222222";
const NEW_LOCAL_TIP = "3333333333333333333333333333333333333333";
const REV_PARSE_LOCAL = `rev-parse --verify --quiet ${NOTES_REF}`;
const LS_REMOTE_NOTES = `ls-remote origin ${NOTES_REF}`;
const PUSH_NOTES = `push origin ${LOCAL_TIP}:${NOTES_REF}`;
const FETCH_TEMP_NOTES = "fetch --refmap= origin *";
const DELETE_TEMP_REF = "update-ref -d *";

describe("runUserPush — proof-gated publication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("remote already matches local → no-ops; partial-push marker cleared", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${LOCAL_TIP}\n`, stderr: "" },
      [LS_REMOTE_NOTES]: { stdout: `${LOCAL_TIP}\t${NOTES_REF}\n`, stderr: "" },
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      "rev-parse --verify --quiet *": { stdout: `${LOCAL_TIP}\n`, stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
      [PUSH_NOTES]: () => {
        throw new Error("push should not have fired on no-op path");
      },
    });
    const io = buildIo(exec);

    const result = await runUserPush({ cwd: "/repo", io, identity: "andrew" });

    expect(result).toEqual({ kind: "noop" });
    const pushCalls = calls.filter((c) => c.args[0] === "push");
    expect(pushCalls).toEqual([]);
    expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
    expect(mockClearPartialPushMarker).toHaveBeenCalledWith("/repo", io, "andrew");
  });

  it("safe absent-remote history pushes the captured tip and clears the marker", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${LOCAL_TIP}\n`, stderr: "" },
      [LS_REMOTE_NOTES]: { stdout: "", stderr: "" },
      [`ls-tree --full-tree ${LOCAL_TIP} -- .arc-user-notes-compaction-manifest.json`]: {
        stdout: "",
        stderr: "",
      },
      [`log --name-status -z -M100% -m --root --format=ARC-NOTES-HISTORY-COMMIT%x00 ${LOCAL_TIP}`]: {
        stdout: "",
        stderr: "",
      },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
      [PUSH_NOTES]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserPush({ cwd: "/repo", io, identity: "andrew" });

    expect(result).toEqual({ kind: "pushed" });
    const pushCalls = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushCalls).toEqual([["push", "origin", `${LOCAL_TIP}:${NOTES_REF}`]]);
    expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
    expect(mockClearPartialPushMarker).toHaveBeenCalledWith("/repo", io, "andrew");
  });

  it("missing publication plumbing refuses without transport or marker clearing", async () => {
    const annotated = "a".repeat(40);
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${LOCAL_TIP}\n`, stderr: "" },
      [LS_REMOTE_NOTES]: { stdout: "", stderr: "" },
      [`ls-tree --full-tree ${LOCAL_TIP} -- .arc-user-notes-compaction-manifest.json`]: {
        stdout: "",
        stderr: "",
      },
      [`log --name-status -z -M100% -m --root --format=ARC-NOTES-HISTORY-COMMIT%x00 ${LOCAL_TIP}`]: {
        stdout: `ARC-NOTES-HISTORY-COMMIT\0\0\nA\0${annotated}\0`,
        stderr: "",
      },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserPush({ cwd: "/repo", io, identity: "andrew" });
    expect(result).toMatchObject({
      kind: "refused",
      reason: "proof-unavailable",
    });
    expect(result.kind === "refused" ? result.message : "").toContain("Restore remote and object visibility");
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("an absent canonical ref is a non-transport miss and preserves the marker", async () => {
    const missingRef = Object.assign(new Error("missing ref"), { code: 1 });
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: () => { throw missingRef; },
    });
    const io = buildIo(exec);

    await expect(runUserPush({ cwd: "/repo", io, identity: "andrew" }))
      .resolves.toEqual({ kind: "no-local-notes" });
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("force: true stays on the planner-free direct push path", async () => {
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${LOCAL_TIP}\n`, stderr: "" },
      [`push --force origin ${NOTES_REF}`]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserPush({
      cwd: "/repo",
      io,
      identity: "andrew",
      force: true,
    });

    expect(result).toEqual({ kind: "pushed" });
    const pushCalls = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushCalls).toEqual([["push", "--force", "origin", NOTES_REF]]);
    expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
  });

  it("force: true skips transport when the canonical local ref is absent", async () => {
    const missingRef = Object.assign(new Error("missing ref"), { code: 1 });
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: () => { throw missingRef; },
    });
    const io = buildIo(exec);

    await expect(runUserPush({ cwd: "/repo", io, identity: "andrew", force: true }))
      .resolves.toEqual({ kind: "no-local-notes" });
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });

  it("force: true propagates unexpected canonical ref read failures", async () => {
    const readFailure = Object.assign(new Error("ref database unavailable"), { code: 128 });
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: () => { throw readFailure; },
    });
    const io = buildIo(exec);

    await expect(runUserPush({ cwd: "/repo", io, identity: "andrew", force: true }))
      .rejects.toThrow("ref database unavailable");
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    expect(mockClearPartialPushMarker).not.toHaveBeenCalled();
  });
});

describe("runUserFetch — ancestry-guarded updates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("remote-ahead fetch fast-forwards the local notes ref with an expected-old guard", async () => {
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => (
        ref === NOTES_REF
          ? { stdout: `${LOCAL_TIP}\n`, stderr: "" }
          : { stdout: `${REMOTE_TIP}\n`, stderr: "" }
      ),
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`merge-base --is-ancestor ${LOCAL_TIP} ${REMOTE_TIP}`]: { stdout: "", stderr: "" },
      [`update-ref ${NOTES_REF} ${REMOTE_TIP} ${LOCAL_TIP}`]: { stdout: "", stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result).toEqual({ kind: "fast-forwarded", localTip: LOCAL_TIP, remoteTip: REMOTE_TIP });
    expect(calls.map((c) => c.args).filter((args) => args[0] === "update-ref")).toEqual([
      ["update-ref", NOTES_REF, REMOTE_TIP, LOCAL_TIP],
      ["update-ref", "-d", expect.stringMatching(/__fetch_/u)],
    ]);
  });

  it("local-ahead fetch refuses and leaves the local notes ref untouched", async () => {
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => (
        ref === NOTES_REF
          ? { stdout: `${LOCAL_TIP}\n`, stderr: "" }
          : { stdout: `${REMOTE_TIP}\n`, stderr: "" }
      ),
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`merge-base --is-ancestor ${LOCAL_TIP} ${REMOTE_TIP}`]: () => {
        throw new Error("not ancestor");
      },
      [`merge-base --is-ancestor ${REMOTE_TIP} ${LOCAL_TIP}`]: { stdout: "", stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result).toEqual({ kind: "refused-local-ahead", localTip: LOCAL_TIP, remoteTip: REMOTE_TIP });
    expect(calls.map((c) => c.args).filter((args) => args[0] === "update-ref")).toEqual([
      ["update-ref", "-d", expect.stringMatching(/__fetch_/u)],
    ]);
  });

  it("diverged fetch refuses and leaves the local notes ref untouched", async () => {
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => (
        ref === NOTES_REF
          ? { stdout: `${LOCAL_TIP}\n`, stderr: "" }
          : { stdout: `${REMOTE_TIP}\n`, stderr: "" }
      ),
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`merge-base --is-ancestor ${LOCAL_TIP} ${REMOTE_TIP}`]: () => {
        throw new Error("not ancestor");
      },
      [`merge-base --is-ancestor ${REMOTE_TIP} ${LOCAL_TIP}`]: () => {
        throw new Error("not ancestor");
      },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result).toEqual({ kind: "refused-diverged", localTip: LOCAL_TIP, remoteTip: REMOTE_TIP });
    expect(calls.map((c) => c.args).filter((args) => args[0] === "update-ref")).toEqual([
      ["update-ref", "-d", expect.stringMatching(/__fetch_/u)],
    ]);
  });

  it("remote-only fetch creates the local notes ref with an absent-ref guard", async () => {
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => {
        if (ref === NOTES_REF) throw new Error("missing ref");
        return { stdout: `${REMOTE_TIP}\n`, stderr: "" };
      },
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`update-ref ${NOTES_REF} ${REMOTE_TIP} *`]: { stdout: "", stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result).toEqual({ kind: "created", remoteTip: REMOTE_TIP });
    expect(calls.map((c) => c.args).filter((args) => args[0] === "update-ref")).toEqual([
      ["update-ref", NOTES_REF, REMOTE_TIP, ""],
      ["update-ref", "-d", expect.stringMatching(/__fetch_/u)],
    ]);
  });

  it("mid-fetch local advance fails the guarded update rather than resetting the ref", async () => {
    let localReads = 0;
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => {
        if (ref !== NOTES_REF) return { stdout: `${REMOTE_TIP}\n`, stderr: "" };
        localReads += 1;
        return {
          stdout: `${localReads === 1 ? LOCAL_TIP : NEW_LOCAL_TIP}\n`,
          stderr: "",
        };
      },
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`merge-base --is-ancestor ${LOCAL_TIP} ${REMOTE_TIP}`]: { stdout: "", stderr: "" },
      [`update-ref ${NOTES_REF} ${REMOTE_TIP} ${LOCAL_TIP}`]: () => {
        throw new Error(`cannot lock ref '${NOTES_REF}': is at ${NEW_LOCAL_TIP} but expected ${LOCAL_TIP}`);
      },
      [`merge-base --is-ancestor ${REMOTE_TIP} ${NEW_LOCAL_TIP}`]: { stdout: "", stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result).toEqual({ kind: "refused-local-ahead", localTip: NEW_LOCAL_TIP, remoteTip: REMOTE_TIP });
    expect(calls.map((c) => c.args).filter((args) => args[0] === "update-ref")).toEqual([
      ["update-ref", NOTES_REF, REMOTE_TIP, LOCAL_TIP],
      ["update-ref", "-d", expect.stringMatching(/__fetch_/u)],
    ]);
  });

  it("mid-fetch local advance still fast-forwards when the new local tip remains behind remote", async () => {
    let localReads = 0;
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => {
        if (ref !== NOTES_REF) return { stdout: `${REMOTE_TIP}\n`, stderr: "" };
        localReads += 1;
        return {
          stdout: `${localReads === 1 ? LOCAL_TIP : NEW_LOCAL_TIP}\n`,
          stderr: "",
        };
      },
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`merge-base --is-ancestor ${LOCAL_TIP} ${REMOTE_TIP}`]: { stdout: "", stderr: "" },
      [`update-ref ${NOTES_REF} ${REMOTE_TIP} ${LOCAL_TIP}`]: () => {
        throw new Error(`cannot lock ref '${NOTES_REF}': is at ${NEW_LOCAL_TIP} but expected ${LOCAL_TIP}`);
      },
      [`merge-base --is-ancestor ${NEW_LOCAL_TIP} ${REMOTE_TIP}`]: { stdout: "", stderr: "" },
      [`update-ref ${NOTES_REF} ${REMOTE_TIP} ${NEW_LOCAL_TIP}`]: { stdout: "", stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result).toEqual({ kind: "fast-forwarded", localTip: NEW_LOCAL_TIP, remoteTip: REMOTE_TIP });
    expect(calls.map((c) => c.args).filter((args) => args[0] === "update-ref")).toEqual([
      ["update-ref", NOTES_REF, REMOTE_TIP, LOCAL_TIP],
      ["update-ref", NOTES_REF, REMOTE_TIP, NEW_LOCAL_TIP],
      ["update-ref", "-d", expect.stringMatching(/__fetch_/u)],
    ]);
  });

  it("bounds repeated CAS rejections when the local ref keeps moving under fetch", async () => {
    const movingTips = [
      LOCAL_TIP,
      NEW_LOCAL_TIP,
      "4444444444444444444444444444444444444444",
      "5555555555555555555555555555555555555555",
    ];
    let localReads = 0;
    const { exec, calls } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => {
        if (ref !== NOTES_REF) return { stdout: `${REMOTE_TIP}\n`, stderr: "" };
        const tip = movingTips[localReads] ?? movingTips[movingTips.length - 1];
        localReads += 1;
        return { stdout: `${tip}\n`, stderr: "" };
      },
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      "merge-base --is-ancestor * *": { stdout: "", stderr: "" },
      [`update-ref ${NOTES_REF} ${REMOTE_TIP} *`]: (args) => {
        const expected = args[3];
        throw new Error(
          `cannot lock ref '${NOTES_REF}': is at ${movingTips[localReads] ?? NEW_LOCAL_TIP} but expected ${expected}`,
        );
      },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserFetch({ io, identity: "andrew" });

    expect(result.kind).toBe("remote-unavailable");
    if (result.kind === "remote-unavailable") {
      expect(result.error.message).toContain("exceeded retry attempts");
    }
    expect(calls.map((c) => c.args).filter((args) =>
      args[0] === "update-ref" && args[1] === NOTES_REF,
    )).toHaveLength(3);
  });

  it("pull skips disk load when fetch refuses", async () => {
    const { exec } = buildExec({
      "rev-parse --verify *": ({ 2: ref }) => (
        ref === NOTES_REF
          ? { stdout: `${LOCAL_TIP}\n`, stderr: "" }
          : { stdout: `${REMOTE_TIP}\n`, stderr: "" }
      ),
      [FETCH_TEMP_NOTES]: { stdout: "", stderr: "" },
      [`merge-base --is-ancestor ${LOCAL_TIP} ${REMOTE_TIP}`]: () => {
        throw new Error("not ancestor");
      },
      [`merge-base --is-ancestor ${REMOTE_TIP} ${LOCAL_TIP}`]: { stdout: "", stderr: "" },
      [DELETE_TEMP_REF]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserPull({ cwd: "/repo", io, identity: "andrew" });

    expect(result).toEqual({ kind: "refused-local-ahead", localTip: LOCAL_TIP, remoteTip: REMOTE_TIP });
    expect(mockRunUserLoad).not.toHaveBeenCalled();
  });
});
