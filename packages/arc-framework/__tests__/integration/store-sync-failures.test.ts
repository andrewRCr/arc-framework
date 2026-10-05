/** Producer-classified remote failures and local throws that stop before Errand publication. */
import { rename, writeFile, unlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncFixture, syncNotesRef, syncErrandRef, syncPut, seedAheadErrand } from "../helpers/store/sync-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeCommit } from "../helpers/integration.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { ArcError } from "../../src/lib/kernel/errors.js";
import { UserSaveVerificationError } from "../../src/commands/user/types.js";
import { acquireAdvisoryLock, releaseAdvisoryLock, withAdvisoryLock, AdvisoryLockTimeoutError } from "../../src/lib/advisory-lock.js";

async function preparedReconcile() {
  const h = await syncFixture();
  const remoteErrand = await seedAheadErrand(h);
  await makeCommit(h.cloneA, "Local notes commit");
  await h.a.exec("git", ["push", "origin", "HEAD:refs/heads/notes-a"]);
  await h.b.exec("git", ["fetch", "origin"]);
  await h.b.inbox("Remote notes\n");
  success(await h.b.store.sync());
  await h.a.inbox("Local notes\n");
  return { h, remoteErrand };
}

describe("Store sync failure behavior", () => {
  it("maps a configured remote outage to unreachable and recovers after restoring the repository", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    success(await h.a.store.write(syncPut()));
    const away = `${h.origin}-away`;
    await rename(h.origin, away);
    try {
      const publishes = success(await h.a.store.sync()).publishes;
      expect(publishes).toEqual([
        { status: "failed", families: ["personal"], failure: expect.objectContaining({ code: "unreachable", class: "recoverable", cause: "error", remedy: { text: expect.any(String) } }) },
        { status: "failed", families: ["work-item", "claims"], failure: expect.objectContaining({ code: "unreachable", class: "recoverable", cause: "error", remedy: { text: expect.any(String) } }) },
      ]);
    } finally { await rename(away, h.origin); }
    expect(success(await h.a.store.sync()).publishes.map((publish) => publish.status)).toEqual(["pushed", "pushed"]);
  });

  it("preserves an actual notes host refusal and still publishes the independent Errand ref", async () => {
    const h = await syncFixture();
    const remoteBefore = await seedAheadErrand(h);
    await h.a.inbox();
    const hook = join(h.origin, "hooks/pre-receive");
    await writeFile(hook, `#!/bin/sh\nwhile read old new ref; do\n  case "$ref" in\n    ${syncNotesRef}) echo 'notes policy rejects publish' >&2; exit 1;;\n  esac\ndone\nexit 0\n`, { mode: 0o755 });
    try {
      const publishes = success(await h.a.store.sync()).publishes;
      expect(publishes[0]).toMatchObject({ status: "failed", families: ["personal"], failure: { code: "refused", class: "terminal", message: expect.stringContaining("notes policy rejects publish") } });
      expect(publishes[1]).toEqual({ status: "pushed", families: ["work-item", "claims"] });
      expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).not.toBe(remoteBefore);
    } finally { await unlink(hook); }
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "pushed", families: ["personal"] });
  });

  it.each([
    { kind: "nonzero-exit" as const, stderr: "fatal: Could not resolve host: notes.example", cause: "network", prefix: false },
    { kind: "nonzero-exit" as const, stderr: "fatal: Authentication failed for notes.example", cause: "auth", prefix: false },
    { kind: "timed-out" as const, stderr: "git operation timed out", cause: "timeout", prefix: false },
    { kind: "nonzero-exit" as const, stderr: "fatal: Authentication failed for notes.example", cause: "auth", prefix: true },
  ])("maps notes $cause transport facts with Git global prefix $prefix", async ({ kind, stderr, cause, prefix }) => {
    const h = await syncFixture();
    await h.a.inbox();
    const base = h.a.ports.exec;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "ls-remote" && args.includes(syncNotesRef)) throw new GitProcessError({ kind, command, args: prefix ? ["--no-lazy-fetch", ...args] : args, stderr, ...(kind === "nonzero-exit" ? { exitCode: 128 } : { timedOut: true }) });
      return base(command, args, options);
    };
    expect(success(await h.a.store.sync()).publishes[0]).toMatchObject({ status: "failed", families: ["personal"], failure: { code: "unreachable", class: "recoverable", cause } });
  });

  it.each(["local", "spawn"] as const)("throws a notes %s failure with its original cause before publishing Errands", async (kind) => {
    const h = await syncFixture();
    const before = await seedAheadErrand(h);
    await h.a.inbox();
    const original = kind === "spawn" ? new GitProcessError({ kind: "spawn-failure", command: "git", args: ["ls-remote", "origin", syncNotesRef], cause: new Error("Git executable missing") })
      : new Error("fatal: Could not read from remote repository (local injected defect)");
    const base = h.a.ports.exec;
    h.a.ports.exec = async (command, args, options) => {
      if (kind === "spawn" ? args[0] === "ls-remote" && args.includes(syncNotesRef) : args[0] === "rev-parse" && args.includes("--quiet") && args.includes(syncNotesRef)) throw original;
      return base(command, args, options);
    };
    await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: original });
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(before);
  });

  it("throws a failed save readback without treating verification failure as empty notes", async () => {
    const h = await syncFixture();
    const before = await seedAheadErrand(h);
    await h.a.inbox();
    const base = h.a.ports.execInput;
    let corrupted = false;
    h.a.ports.execInput = async (args, content, options) => {
      const result = await base(args, content, options);
      if (!corrupted && args[0] === "notes" && args.includes("add")) {
        corrupted = true;
        const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout;
        await h.a.execInput(["notes", "--ref", syncNotesRef, "add", "--force", "-F", "-", head], "invalid saved note");
      }
      return result;
    };
    let failure: unknown;
    try { await h.a.store.sync(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ArcError);
    expect(failure).toMatchObject({ cause: expect.any(UserSaveVerificationError) });
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(before);
  });

  it("throws an actual reconcile lock timeout and leaves the remote's ahead Errand unpublished", async () => {
    const { h, remoteErrand } = await preparedReconcile();
    const base = h.a.ports.locks.notes;
    let holds = 0;
    h.a.ports.locks.notes = async (operation) => {
      if (++holds !== 2) return base(operation);
      const holder = await acquireAdvisoryLock(h.a.lockPath);
      try { return await withAdvisoryLock(h.a.lockPath, operation, { maxWaitMs: 20 }); }
      finally { await releaseAdvisoryLock(holder); }
    };
    await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: expect.any(AdvisoryLockTimeoutError) });
    expect(holds).toBe(2);
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(remoteErrand);
  });

  it("throws a lineage-check failure and never runs the independent Errand push", async () => {
    const { h, remoteErrand } = await preparedReconcile();
    const original = new Error("Lineage objects cannot be read");
    const base = h.a.ports.exec;
    let checked = false;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "ls-tree" && args.some((arg) => arg.includes("__incoming_")) && args.includes(".arc-user-notes-compaction-manifest.json")) { checked = true; throw original; }
      return base(command, args, options);
    };
    await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: original });
    expect(checked).toBe(true);
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(remoteErrand);
  });

  it("throws an actual save lock timeout before publishing either ref", async () => {
    const h = await syncFixture();
    const before = await seedAheadErrand(h);
    await h.a.inbox();
    const held = await acquireAdvisoryLock(h.a.lockPath);
    try {
      await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: expect.any(AdvisoryLockTimeoutError) });
      expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(before);
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", syncNotesRef])).stdout).toBe("");
    } finally { await releaseAdvisoryLock(held); }
  });

  it("maps a failed locked notes fetch to transport failure while continuing the Errand publish", async () => {
    const { h, remoteErrand } = await preparedReconcile();
    const base = h.a.ports.exec;
    let fetched = false;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "fetch" && args.some((arg) => arg.includes(`${syncNotesRef}__incoming_`))) {
        fetched = true;
        throw new GitProcessError({ kind: "nonzero-exit", command, args, exitCode: 128, stderr: "fatal: Could not resolve host: notes.example" });
      }
      return base(command, args, options);
    };
    const publishes = success(await h.a.store.sync()).publishes;
    expect(publishes[0]).toMatchObject({ status: "failed", families: ["personal"], failure: { code: "unreachable", class: "recoverable", cause: "network" } });
    expect(publishes[1]).toEqual({ status: "pushed", families: ["work-item", "claims"] });
    expect(fetched).toBe(true);
    expect((await h.remote("git", ["rev-parse", syncErrandRef])).stdout).not.toBe(remoteErrand);
  });

  it("keeps a local notes command error local even when an artifact name is a remote command", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    const original = new GitProcessError({ kind: "nonzero-exit", command: "git", args: ["--no-lazy-fetch", "cat-file", "blob", "push"], exitCode: 128, stderr: "fatal: Authentication failed for a local fixture" });
    const base = h.a.ports.exec;
    h.a.ports.exec = async (command, args, options) => {
      if (args[0] === "rev-parse" && args.includes("--quiet") && args.includes(syncNotesRef)) throw original;
      return base(command, args, options);
    };
    await expect(h.a.store.sync()).rejects.toMatchObject({ code: "store.sync-failed", cause: original });
  });

  it("never reads excluded dot-named leaves while assembling the notes save", async () => {
    const h = await syncFixture();
    await h.a.inbox();
    const hidden = join(h.cloneA, ".arc/user/andrew/.hidden");
    await h.a.file(".hidden", "Machine-local secret\n");
    await chmod(hidden, 0);
    try {
      expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "pushed", families: ["personal"] });
      const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout;
      expect(JSON.parse((await h.remote("git", ["notes", "--ref", syncNotesRef, "show", head])).stdout).files).not.toHaveProperty(".hidden");
    } finally { await chmod(hidden, 0o600); }
  });

  it("maps an outage on the post-merge notes push as unreachable rather than a local throw", async () => {
    const { h } = await preparedReconcile();
    const away = `${h.origin}-away`;
    const base = h.a.ports.exec;
    let moved = false;
    h.a.ports.exec = async (command, args, options) => {
      if (!moved && args[0] === "push" && args.some((arg) => arg.endsWith(`:${syncNotesRef}`))) {
        moved = true;
        await rename(h.origin, away);
      }
      return base(command, args, options);
    };
    try {
      expect(success(await h.a.store.sync()).publishes).toEqual([
        { status: "failed", families: ["personal"], failure: expect.objectContaining({ code: "unreachable", class: "recoverable", cause: "error" }) },
        { status: "failed", families: ["work-item", "claims"], failure: expect.objectContaining({ code: "unreachable", class: "recoverable", cause: "error" }) },
      ]);
      expect(moved).toBe(true);
    } finally { if (moved) await rename(away, h.origin); }
  });
});
