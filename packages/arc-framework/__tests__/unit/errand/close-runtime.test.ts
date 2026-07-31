/** Exact recorded-head cleanup for ordinary v3 Errand finalization. */

import { describe, expect, it } from "vitest";

import { cleanupOrdinaryErrandRefs } from "../../../src/lib/errand/close-runtime.js";
import type { CloseTarget } from "../../../src/lib/errand/close-locus.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const EXPECTED = "a".repeat(40);

function awaiting(): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "done",
    claimId: "c".repeat(32),
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "done",
    branch: "chore/done",
    origin: "description",
    originEntry: null,
    state: "awaiting-merge",
    savedHead: null,
    changeRequest: {
      repositoryRef: "owner/repo",
      hostRef: "github.com",
      baseRef: "main",
      headRef: "chore/done",
      headSha: EXPECTED,
    },
  }) as OrdinaryErrandRecord;
}

/** The close target an awaiting record produces: its own recorded change request. */
function target(): CloseTarget {
  const record = awaiting();
  if (record.state !== "awaiting-merge") throw new Error("expected awaiting tail");
  return { record, changeRequest: record.changeRequest };
}

function fakeGit(options: {
  local: string | null;
  remote: string | null;
  fetchFailure?: string;
}): { exec: GitExec; state: { local: string | null; remote: string | null } } {
  const state = { local: options.local, remote: options.remote };
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "fetch") {
      if (options.fetchFailure !== undefined) throw { exitCode: 128, stderr: options.fetchFailure };
      if (state.remote === null) throw { exitCode: 128, stderr: "fatal: couldn't find remote ref refs/heads/chore/done" };
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      const ref = args.at(-1) ?? "";
      const oid = ref.includes("refs/arc/tmp/") ? state.remote : state.local;
      if (oid === null) throw { exitCode: 1, stderr: "" };
      return { stdout: `${oid}\n`, stderr: "" };
    }
    if (args[0] === "push") {
      if (state.remote !== EXPECTED) throw { exitCode: 1, stderr: "stale info" };
      state.remote = null;
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "update-ref" && args[1] === "-d") {
      if ((args[2] ?? "").startsWith("refs/heads/")) {
        if (state.local !== args[3]) throw { exitCode: 1, stderr: "cannot lock ref" };
        state.local = null;
      }
      return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected git operation: ${args.join(" ")}`);
  };
  return { exec, state };
}

describe("cleanupOrdinaryErrandRefs", () => {
  it("deletes exact local and remote heads and replays already-deleted refs", async () => {
    const exact = fakeGit({ local: EXPECTED, remote: EXPECTED });
    await expect(cleanupOrdinaryErrandRefs(exact.exec, target())).resolves.toEqual({ kind: "applied" });
    expect(exact.state).toEqual({ local: null, remote: null });

    const absent = fakeGit({ local: null, remote: null });
    await expect(cleanupOrdinaryErrandRefs(absent.exec, target())).resolves.toEqual({ kind: "idempotent" });
  });

  it("refuses moved heads before deleting either preservation ref", async () => {
    const moved = "b".repeat(40);
    const git = fakeGit({ local: EXPECTED, remote: moved });

    await expect(cleanupOrdinaryErrandRefs(git.exec, target())).resolves.toMatchObject({
      kind: "refused",
      reason: "preservation-unproven",
    });
    expect(git.state).toEqual({ local: EXPECTED, remote: moved });
  });

  it("retains both refs when the remote cannot be read", async () => {
    const git = fakeGit({ local: EXPECTED, remote: EXPECTED, fetchFailure: "fatal: network unreachable" });

    await expect(cleanupOrdinaryErrandRefs(git.exec, target())).resolves.toMatchObject({ kind: "error" });
    expect(git.state).toEqual({ local: EXPECTED, remote: EXPECTED });
  });
});

