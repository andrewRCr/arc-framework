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
const REV_PARSE_LOCAL = `rev-parse --verify ${NOTES_REF}`;
const LS_REMOTE_NOTES = `ls-remote origin ${NOTES_REF}`;
const PUSH_NOTES = `push origin ${NOTES_REF}`;
const FETCH_TEMP_NOTES = "fetch --refmap= origin *";
const DELETE_TEMP_REF = "update-ref -d *";
const LOCAL_TIP = "1111111111111111111111111111111111111111";
const REMOTE_TIP = "2222222222222222222222222222222222222222";
const NEW_LOCAL_TIP = "3333333333333333333333333333333333333333";

describe("runUserPush — idempotent no-op recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("remote already matches local → no-ops; partial-push marker cleared", async () => {
    const sameHash = "abc1234567890";
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${sameHash}\n`, stderr: "" },
      [LS_REMOTE_NOTES]: { stdout: `${sameHash}\t${NOTES_REF}\n`, stderr: "" },
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

  it("re-attempt after transient failure: remote differs → push fires; marker cleared on success", async () => {
    const localHash = "abc1234567890";
    const remoteHash = "deadbeefcafe";
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${localHash}\n`, stderr: "" },
      [LS_REMOTE_NOTES]: { stdout: `${remoteHash}\t${NOTES_REF}\n`, stderr: "" },
      [PUSH_NOTES]: { stdout: "", stderr: "" },
    });
    const io = buildIo(exec);

    const result = await runUserPush({ cwd: "/repo", io, identity: "andrew" });

    expect(result).toEqual({ kind: "pushed" });
    const pushCalls = calls
      .map((c) => c.args)
      .filter((args) => args[0] === "push");
    expect(pushCalls).toEqual([["push", "origin", NOTES_REF]]);
    expect(mockClearPartialPushMarker).toHaveBeenCalledTimes(1);
    expect(mockClearPartialPushMarker).toHaveBeenCalledWith("/repo", io, "andrew");
  });

  it("force: true skips the no-op probe and pushes unconditionally", async () => {
    const sameHash = "abc1234567890";
    const { exec, calls } = buildExec({
      [REV_PARSE_LOCAL]: { stdout: `${sameHash}\n`, stderr: "" },
      [LS_REMOTE_NOTES]: () => {
        throw new Error("ls-remote should not have fired on force path");
      },
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
