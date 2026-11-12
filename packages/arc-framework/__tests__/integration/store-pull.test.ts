/** Fetch-only notes reconciliation preserves remote state and exposes recoverable failures. */
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncFixture, syncNotesRef } from "../helpers/store/sync-fixture.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeNotesTreeCommit, makeUserIO } from "../helpers/integration.js";
import { runUserSave } from "../../src/commands/user/save-load.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";

const inboxPath = (root: string) => join(root, ".arc/user/andrew/USER-INBOX.md");
async function saveLocal(h: Awaited<ReturnType<typeof syncFixture>>, side: "a" | "b") {
  const checkout = h[side];
  await runUserSave({ cwd: checkout.root, io: makeUserIO(checkout.root), identity: "andrew", withNotesLock: checkout.ports.locks.notes });
}
async function remoteNote(h: Awaited<ReturnType<typeof syncFixture>>) {
  await h.a.inbox("Remote bytes\n");
  success(await h.a.store.push());
  return (await h.remote("git", ["rev-parse", syncNotesRef])).stdout;
}

describe("repository store pull", () => {
  it("fetches missing notes and loads their bytes without changing the remote", async () => {
    const h = await syncFixture();
    const before = await remoteNote(h);
    const result = success(await h.b.store.pull());
    expect(result).toEqual({ states: [], pulls: [{ status: "pulled", role: "state", remote: "origin", families: ["personal"], notices: [] }] });
    expect(await readFile(inboxPath(h.cloneB), "utf8")).toBe("Remote bytes\n");
    expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout).toBe(before);
  });
  it("loads equal-tip notes again and reports noop", async () => {
    const h = await syncFixture();
    await remoteNote(h);
    success(await h.b.store.pull());
    await h.b.file("USER-INBOX.md", "Unsaved bytes\n");
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "noop" });
    expect(await readFile(inboxPath(h.cloneB), "utf8")).toBe("Remote bytes\n");
  });
  it("treats a reachable remote without a notes ref as noop", async () => {
    const h = await syncFixture();
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "noop", families: ["personal"], notices: [] });
  });
  it("reports noop when the fetched notes ref contains no saved note", async () => {
    const h = await syncFixture();
    const empty = await makeNotesTreeCommit(h.cloneA, []);
    await h.a.exec("git", ["update-ref", syncNotesRef, empty.tip]);
    await h.a.exec("git", ["push", "origin", `${syncNotesRef}:${syncNotesRef}`]);
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "noop" });
    await expect(readFile(inboxPath(h.cloneB), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("leaves local-ahead notes and their unsynced bytes intact", async () => {
    const h = await syncFixture();
    const before = await remoteNote(h);
    success(await h.b.store.pull());
    await h.b.inbox("Local ahead\n");
    await saveLocal(h, "b");
    const local = (await h.b.exec("git", ["rev-parse", syncNotesRef])).stdout;
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "noop" });
    expect((await h.b.exec("git", ["rev-parse", syncNotesRef])).stdout).toBe(local);
    expect(await readFile(inboxPath(h.cloneB), "utf8")).toBe("Local ahead\n");
    expect((await h.remote("git", ["rev-parse", syncNotesRef])).stdout).toBe(before);
  });
  it("refuses diverged notes and pulls successfully after their ref is repaired", async () => {
    const h = await syncFixture();
    await remoteNote(h);
    success(await h.b.store.pull());
    await h.a.file("remote.md", "Remote addition\n");
    success(await h.a.store.push());
    await h.b.file("local.md", "Local addition\n");
    await saveLocal(h, "b");
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "failed", notices: [],
      failure: { code: "refused", class: "terminal", remedy: { text: expect.stringContaining("arc sync") } } });
    const local = (await h.b.exec("git", ["rev-parse", syncNotesRef])).stdout.trim();
    const remote = (await h.remote("git", ["rev-parse", syncNotesRef])).stdout.trim();
    await h.b.exec("git", ["update-ref", syncNotesRef, remote, local]);
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "noop" });
    expect(await readFile(join(h.cloneB, ".arc/user/andrew/remote.md"), "utf8")).toBe("Remote addition\n");
  });
  it("reports an unreachable remote and succeeds after it returns", async () => {
    const h = await syncFixture();
    await remoteNote(h);
    const away = `${h.origin}-away`;
    await rename(h.origin, away);
    try {
      expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "failed", failure: { code: "unreachable", cause: "error" } });
    } finally { await rename(away, h.origin); }
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "pulled" });
    expect(await readFile(inboxPath(h.cloneB), "utf8")).toBe("Remote bytes\n");
  });
  it("reports a local fetched-ref update failure and succeeds after repair", async () => {
    const h = await syncFixture();
    await remoteNote(h);
    const base = h.b.ports.exec;
    h.b.ports.exec = async (command, args, options) => {
      if (args[0] === "update-ref" && args[1] === syncNotesRef) throw new GitProcessError({
        kind: "nonzero-exit", command, args, exitCode: 128, stderr: "fatal: cannot lock ref: Permission denied",
      });
      return base(command, args, options);
    };
    try {
      expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "failed", failure: { code: "unreachable", cause: "error" } });
    } finally { h.b.ports.exec = base; }
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "pulled" });
  });
  it("throws a local materialization failure and retries loading after repair", async () => {
    const h = await syncFixture();
    await remoteNote(h);
    const write = h.b.ports.fs.writeFile;
    const failure = Object.assign(new Error("Local materialization denied"), { code: "EACCES" });
    h.b.ports.fs.writeFile = async (path, content) => {
      if (path === inboxPath(h.cloneB)) throw failure;
      return write(path, content);
    };
    try { await expect(h.b.store.pull()).rejects.toMatchObject({ cause: failure }); }
    finally { h.b.ports.fs.writeFile = write; }
    expect(success(await h.b.store.pull()).pulls[0]).toMatchObject({ status: "noop" });
    expect(await readFile(inboxPath(h.cloneB), "utf8")).toBe("Remote bytes\n");
  });
  it.each(["no-remote", "no-identity"] as const)("reports %s without fetching", async (state) => {
    const h = await trackedWriteFixture();
    h.ports.identity = async () => state === "no-identity" ? null : SlugSchema.parse("andrew");
    h.ports.remote = async () => state === "no-remote" ? null : "origin";
    h.ports.exec = async () => { throw new Error("No Git call should be needed"); };
    const result = success(await h.store.pull());
    expect(result.pulls).toEqual([]);
    expect(result.states).toMatchObject([{ status: state, ...(state === "no-identity" ? { families: ["personal"] } : {}) }]);
  });
  it("reports no maintenance measurements on the interim backend", async () => {
    const h = await trackedWriteFixture();
    expect(success(await h.store.maintain())).toEqual({ measurements: null });
  });
});
