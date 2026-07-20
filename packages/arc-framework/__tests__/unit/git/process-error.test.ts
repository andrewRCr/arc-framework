import { describe, expect, it } from "vitest";

import {
  GitProcessError,
  gitFailureText,
  isGitProcessError,
  normalizeGitRejection,
} from "../../../src/lib/git/process-error.js";

describe("GitProcessError", () => {
  it.each([
    ["canceled", "git.canceled"],
    ["timed-out", "git.timed-out"],
    ["output-limit", "git.output-limit"],
    ["nonzero-exit", "git.nonzero-exit"],
    ["spawn-failure", "git.spawn-failure"],
    ["unexpected", "git.unexpected"],
  ] as const)("maps %s to %s", (kind, code) => {
    const error = new GitProcessError({ kind, command: "git", args: ["status"] });

    expect(error).toMatchObject({ code, command: "git", args: ["status"], stdout: "", stderr: "" });
    expect(isGitProcessError(error)).toBe(true);
  });

  it("retains full streams while bounding single-line diagnostics and messages", () => {
    const stderr = `first line\n${"x".repeat(8_000)}`;
    const error = new GitProcessError({
      kind: "nonzero-exit",
      command: "git",
      args: ["fetch", "origin"],
      exitCode: 128,
      stderr,
    });

    expect(error.stderr).toBe(stderr);
    expect(error.diagnosticStderr.length).toBeLessThan(stderr.length);
    expect(error.message).toContain("git fetch");
    expect(error.message).toContain("nonzero-exit (exit 128)");
    expect(error.message).not.toContain("\n");
    expect(error.message.length).toBeLessThanOrEqual(1_024);
  });

  it("preserves partial output-limit streams and cause identity", () => {
    const cause = new Error("buffer exceeded");
    const error = new GitProcessError({
      kind: "output-limit",
      command: "git",
      args: ["show"],
      isMaxBuffer: true,
      stdout: "partial stdout",
      stderr: "partial stderr",
      cause,
    });

    expect(error).toMatchObject({
      isMaxBuffer: true,
      stdout: "partial stdout",
      stderr: "partial stderr",
      cause,
    });
    expect(error.expectedOutcome).toBeUndefined();
  });

  it("rejects expected outcomes outside non-zero exits", () => {
    expect(() => new GitProcessError({
      kind: "unexpected",
      command: "git",
      args: [],
      expectedOutcome: "stale-lease",
    })).toThrow(/expectedOutcome/);
  });
});

describe("normalizeGitRejection", () => {
  it("preserves typed identity and normalizes process failures by precedence", () => {
    const typed = new GitProcessError({ kind: "unexpected", command: "git", args: [] });
    expect(normalizeGitRejection(typed, { command: "git", args: [] })).toBe(typed);

    expect(normalizeGitRejection({ timedOut: true, isMaxBuffer: true }, {
      command: "git", args: ["fetch"],
    }).kind).toBe("timed-out");
    expect(normalizeGitRejection({ isMaxBuffer: true, isCanceled: true, stdout: "partial" }, {
      command: "git", args: ["show"],
    })).toMatchObject({ kind: "output-limit", stdout: "partial", isMaxBuffer: true });
    expect(normalizeGitRejection({ isCanceled: true }, {
      command: "git", args: ["fetch"],
    }).kind).toBe("canceled");
    expect(normalizeGitRejection({ signal: "SIGTERM", stderr: "terminated" }, {
      command: "git", args: ["status"],
    })).toMatchObject({ kind: "nonzero-exit", signal: "SIGTERM", exitCode: undefined });
    expect(normalizeGitRejection(Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }), {
      command: "git", args: ["status"],
    }).kind).toBe("spawn-failure");
    expect(normalizeGitRejection("bad", { command: "git", args: [] }).kind).toBe("unexpected");
  });

  it("preserves byte-backed partial streams from buffered execa failures", () => {
    const error = normalizeGitRejection({
      isMaxBuffer: true,
      stdout: Uint8Array.from([0, 1, 128, 255]),
      stderr: Uint8Array.from([69, 82, 82]),
    }, { command: "git", args: ["cat-file", "blob", "abc"] });

    expect([...error.stdout].map((character) => character.charCodeAt(0))).toEqual([0, 1, 128, 255]);
    expect(error.stderr).toBe("ERR");
  });

  it.each([
    [["fetch", "origin", "missing"], 128, "fatal: couldn't find remote ref missing", "absent-remote-ref"],
    [["push", "origin", "--delete", "missing"], 1, "error: remote ref does not exist", "absent-remote-ref"],
    [["push", "origin", "--force-with-lease=refs/heads/x:abc", "x"], 1, "! [rejected] x (stale info)", "stale-lease"],
    [["push", "origin", "--force-with-lease", "x"], 1, "! [rejected] x (fetch first)", "stale-lease"],
  ] as const)("classifies expected Git outcomes for %j", (args, exitCode, stderr, expectedOutcome) => {
    expect(normalizeGitRejection({ exitCode, stderr }, { command: "git", args: [...args] }))
      .toMatchObject({ kind: "nonzero-exit", expectedOutcome });
  });

  it.each([
    ["not-git", ["push", "--force-with-lease", "x"], 1, "[rejected]"],
    ["git", ["status", "--force-with-lease"], 1, "[rejected]"],
    ["git", ["push", "--delete", "x"], 1, "[rejected]"],
    [
      "git",
      ["push", "origin", "--force-with-lease=refs/heads/x:abc", ":refs/heads/x"],
      1,
      "! [rejected] (delete) -> x (fetch first)",
    ],
    ["git", ["fetch", "origin", "x"], 1, "couldn't find remote ref x"],
  ] as const)("does not over-classify %s %j", (command, args, exitCode, stderr) => {
    expect(normalizeGitRejection({ exitCode, stderr }, { command, args: [...args] }).expectedOutcome)
      .toBeUndefined();
  });

  it("never classifies expected outcomes from message-only evidence", () => {
    const legacy = Object.assign(new Error("fatal: couldn't find remote ref missing"), { code: 128 });
    const error = normalizeGitRejection(legacy, { command: "git", args: ["fetch", "origin", "missing"] });

    expect(error.expectedOutcome).toBeUndefined();
    expect(gitFailureText(legacy)).toBe(legacy.message);
    expect(gitFailureText({ stderr: "stderr", message: "message" })).toBe("stderr");
  });
});
