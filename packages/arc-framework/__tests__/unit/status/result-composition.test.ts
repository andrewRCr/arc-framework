/** Focused Result error and Probe-adapter coverage for status composition. */

import { describe, expect, it } from "vitest";

import { err, ok } from "../../../src/lib/kernel/index.js";
import {
  SessionCompositionError,
  SessionIdentityMissingError,
  SessionProbeError,
  toProbe,
  type SessionStatusError,
} from "../../../src/commands/status/result-composition.js";

describe("status Result error taxonomy", () => {
  it("retains identity, probe, and composition context", () => {
    const cause = new Error("probe failed");
    const identity = new SessionIdentityMissingError("user");
    const probe = new SessionProbeError("worktree", cause);
    const composition = new SessionCompositionError("resolve-load-set", "loadSet", cause);

    expect(identity).toMatchObject({ code: "session.identity-missing", slot: "user" });
    expect(probe).toMatchObject({
      code: "session.probe-failed",
      slot: "worktree",
      message: "probe failed",
      originalCause: cause,
      cause,
    });
    expect(composition).toMatchObject({
      code: "session.composition-failed",
      operation: "resolve-load-set",
      slot: "loadSet",
      originalCause: cause,
      cause,
    });
  });

  it("retains String(cause) for non-Error failures", () => {
    const cause = { kind: "marker" };
    expect(new SessionProbeError("config", cause)).toMatchObject({
      message: "[object Object]",
      originalCause: cause,
    });
  });
});

describe("toProbe", () => {
  it("adapts success without changing value identity", () => {
    const value = { retained: true };
    expect(toProbe(ok<typeof value, SessionStatusError>(value))).toEqual({ ok: true, value });
  });

  it.each([
    [new SessionIdentityMissingError("user"), "identity-missing"],
    [new SessionProbeError("worktree", new Error("probe failed")), "runtime"],
    [new SessionCompositionError("resolve-load-set", "loadSet", "composition failed"), "runtime"],
  ] as const)("maps $code through the stable wire error channel", (error, kind) => {
    expect(toProbe(err<never, SessionStatusError>(error))).toEqual({
      ok: false,
      error: { kind, message: error.message },
    });
  });
});
