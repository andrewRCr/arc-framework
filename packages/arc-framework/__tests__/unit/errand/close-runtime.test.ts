/** Exact recorded-head cleanup for ordinary v3 Errand finalization. */

import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupOrdinaryErrandRefs,
  closeOrdinaryErrandAtRuntime,
} from "../../../src/lib/errand/close-runtime.js";
import { acquireErrandCloseHeadLock } from "../../../src/lib/errand/close-head-lock.js";
import type { CloseAuthorityGuard, CloseTarget } from "../../../src/lib/errand/close-locus.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import * as identityTransaction from "../../../src/lib/errand/identity-transaction.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

const EXPECTED = "a".repeat(40);

function gitError(message: string, exitCode: number): Error & { exitCode: number; stderr: string } {
  return Object.assign(new Error(message), { exitCode, stderr: message });
}

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
  worktreeFailure?: string;
  worktrees?: readonly { path: string; branch: string }[];
}): { exec: GitExec; state: { local: string | null; remote: string | null } } {
  const state = { local: options.local, remote: options.remote };
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "fetch") {
      if (options.fetchFailure !== undefined) throw gitError(options.fetchFailure, 128);
      if (state.remote === null) throw gitError("fatal: couldn't find remote ref refs/heads/chore/done", 128);
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      const ref = args.at(-1) ?? "";
      const oid = ref.includes("refs/arc/tmp/") ? state.remote : state.local;
      if (oid === null) throw gitError("reference is absent", 1);
      return { stdout: `${oid}\n`, stderr: "" };
    }
    if (args[0] === "push") {
      if (state.remote !== EXPECTED) throw gitError("stale info", 1);
      state.remote = null;
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "worktree") {
      if (options.worktreeFailure !== undefined) throw gitError(options.worktreeFailure, 128);
      const worktrees = options.worktrees ?? [{ path: "/repo", branch: "main" }];
      return {
        stdout: worktreePorcelainZ(worktrees.map((worktree) =>
          `worktree ${worktree.path}\nHEAD ${EXPECTED}\nbranch refs/heads/${worktree.branch}`).join("\n\n")),
        stderr: "",
      };
    }
    if (args[0] === "update-ref" && args[1] === "-d") {
      if ((args[2] ?? "").startsWith("refs/heads/")) {
        if (state.local !== args[3]) throw gitError("cannot lock ref", 1);
        state.local = null;
      }
      return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected git operation: ${args.join(" ")}`);
  };
  return { exec, state };
}

const BASE_GUARD: CloseAuthorityGuard = {
  checkoutPath: "/repo",
  revalidate: async () => ({ kind: "valid" }),
  acquire: async () => { throw new Error("cleanup does not acquire the caller-owned guard"); },
};

const LOCAL_DELETE_LEASE = async () => ({
  kind: "acquired" as const,
  release: async () => undefined,
});

const TEMP_DIRS: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(TEMP_DIRS.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function closeLockRuntime() {
  const checkoutPath = await mkdtemp(join(tmpdir(), "arc-close-runtime-"));
  TEMP_DIRS.push(checkoutPath);
  const gitDir = join(checkoutPath, ".git");
  await mkdir(gitDir);
  const lockPath = join(gitDir, "HEAD.lock");
  const exec: GitExec = async (_command, args) => {
    if (args.join(" ") === "rev-parse --git-path HEAD") {
      return { stdout: `${join(gitDir, "HEAD")}\n`, stderr: "" };
    }
    if (args.join(" ") === "worktree list --porcelain -z") {
      return {
        stdout: worktreePorcelainZ(`worktree ${checkoutPath}\nHEAD ${EXPECTED}\nbranch refs/heads/main`),
        stderr: "",
      };
    }
    throw gitError(`unsupported test operation: ${args.join(" ")}`, 1);
  };
  const acquired = await acquireErrandCloseHeadLock({
    exec,
    checkoutPath,
    identity: { slug: "done", claimId: "c".repeat(32) },
    revalidate: async () => ({ kind: "valid" }),
  });
  if (acquired.kind !== "acquired") throw new Error("expected acquired close lock");
  return { acquired, checkoutPath, exec, lockPath };
}

function reconcileIdentity(records: ReadonlyMap<string, OrdinaryErrandRecord>): void {
  vi.spyOn(identityTransaction, "transactTransientIdentities").mockImplementation(async (_io, params) => {
    const decision = await params.transform(records);
    if (decision.kind === "refused") return decision;
    return decision.kind === "applied"
      ? { kind: "applied", value: decision.value, tip: EXPECTED }
      : { kind: "idempotent", value: decision.value, tip: null };
  });
}

async function dispatchClose(exec: GitExec) {
  return closeOrdinaryErrandAtRuntime({
    slug: "done",
    base: "main",
    protection: "full",
    identity: "tester",
    exec,
    execInput: async () => { throw new Error("identity transaction should be mocked"); },
    readFrame: async () => { throw new Error("close should stop before occupancy"); },
    removeInbox: async () => ({ kind: "absent", nextOffer: null }),
  });
}

describe("closeOrdinaryErrandAtRuntime lock recovery", () => {
  it("preserves a live close receipt while reconciliation retains the identity", async () => {
    const runtime = await closeLockRuntime();
    reconcileIdentity(new Map([["done", awaiting()]]));

    await expect(dispatchClose(runtime.exec)).resolves.toMatchObject({
      outcome: "refused",
      operation: "errand-close",
    });
    await expect(readFile(runtime.lockPath, "utf8")).resolves.toContain("arc-errand-close-head-lock");

    await runtime.acquired.release();
  });

  it("recovers a close receipt only after reconciliation proves identity absence", async () => {
    const runtime = await closeLockRuntime();
    reconcileIdentity(new Map());

    await expect(dispatchClose(runtime.exec)).resolves.toMatchObject({
      outcome: "idempotent",
      operation: "errand-close",
    });
    await expect(readFile(runtime.lockPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("cleanupOrdinaryErrandRefs", () => {
  it("deletes exact local and remote heads and replays already-deleted refs", async () => {
    const exact = fakeGit({ local: EXPECTED, remote: EXPECTED });
    await expect(cleanupOrdinaryErrandRefs(
      exact.exec,
      target(),
      null,
      LOCAL_DELETE_LEASE,
    )).resolves.toEqual({ kind: "applied" });
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

  it("refuses when the local head moved off the recorded change request", async () => {
    const moved = "b".repeat(40);
    const git = fakeGit({ local: moved, remote: EXPECTED });

    await expect(cleanupOrdinaryErrandRefs(git.exec, target())).resolves.toMatchObject({
      kind: "refused",
      reason: "preservation-unproven",
    });
    expect(git.state).toEqual({ local: moved, remote: EXPECTED });
  });

  it("retains both refs when the remote cannot be read", async () => {
    const git = fakeGit({ local: EXPECTED, remote: EXPECTED, fetchFailure: "fatal: network unreachable" });

    await expect(cleanupOrdinaryErrandRefs(git.exec, target())).resolves.toMatchObject({ kind: "error" });
    expect(git.state).toEqual({ local: EXPECTED, remote: EXPECTED });
  });

  it("retains a local branch checked out by any registered worktree", async () => {
    const git = fakeGit({
      local: EXPECTED,
      remote: null,
      worktrees: [
        { path: "/repo", branch: "main" },
        { path: "/repo-linked", branch: "chore/done" },
      ],
    });

    await expect(cleanupOrdinaryErrandRefs(git.exec, target(), BASE_GUARD)).resolves.toEqual({
      kind: "refused",
      reason: "preservation-unproven",
      message: "Local Errand branch is checked out by registered worktree '/repo-linked'.",
    });
    expect(git.state.local).toBe(EXPECTED);
  });

  it("retains the local branch when registered worktree occupancy cannot be read", async () => {
    const git = fakeGit({
      local: EXPECTED,
      remote: null,
      worktreeFailure: "fatal: worktree registry unreadable",
    });

    await expect(cleanupOrdinaryErrandRefs(git.exec, target(), BASE_GUARD)).resolves.toMatchObject({
      kind: "refused",
      reason: "preservation-unproven",
      message: expect.stringContaining("worktree registry unreadable"),
    });
    expect(git.state.local).toBe(EXPECTED);
  });
});
