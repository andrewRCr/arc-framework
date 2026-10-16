import { describe, expect, it } from "vitest";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { checkWorktreeRemoval, clearMissingWorktreeRegistrations, removeWorktreeCheckout, releaseWorktreeCheckout, passingProjectionRemovalSlots, PROJECTION_LOCK_REASON } from "../../../src/lib/git/worktree-removal.js";

function fixture(options: { present?: boolean; lock?: string | null; status?: string; fail?: string } = {}) {
  let registered = true;
  let persisted = false;
  let unlocked = false;
  const exec: GitExec = async (_file, args) => {
    if (args[0] === "status") { if (options.fail === "status") throw Error("status unavailable"); return { stdout: options.status ?? "", stderr: "" }; }
    if (args[0] === "worktree" && args[1] === "list") return { stdout: registered ? `worktree /checkout\0HEAD abc\0branch refs/heads/topic\0${options.lock === undefined || unlocked ? "" : `locked${options.lock === null ? "" : ` ${options.lock}`}\0`}\0` : "", stderr: "" };
    if (args[1] === "unlock") { if (options.fail === "unlock") throw Error("unlock failed"); if (options.lock === undefined) throw Error("not locked"); unlocked = true; }
    if (args[1] === "remove") { if (options.fail === "remove") throw Error("remove failed"); if (options.lock !== undefined && !unlocked) throw Error("still locked"); registered = false; }
    return { stdout: "", stderr: "" };
  };
  const slots = { ...passingProjectionRemovalSlots, persist: async () => { if (options.fail === "persist") throw Error("persist failed"); persisted = true; return { kind: "persisted" as const }; } };
  return { exec, checkoutPath: "/checkout", primaryWorktreePath: "/primary", folderExists: async () => options.present !== false, slots, state: () => ({ registered, persisted, unlocked }) };
}

describe("checkout removal authorization", () => {
  it("permits clean checkouts and reports every dirty path including quoted names", async () => {
    expect(await checkWorktreeRemoval({ ...fixture(), disposition: "remove" })).toEqual({ kind: "removable" });
    expect(await checkWorktreeRemoval({ ...fixture({ status: ' M tracked\n?? "tab\\tfile"\nR  old -> new\n' }), disposition: "remove" })).toEqual({ kind: "refused", reason: "dirty", paths: ["tracked", "tab\tfile", "old", "new"] });
  });
  it("reports failed status as unobservable", async () => {
    expect(await checkWorktreeRemoval({ ...fixture({ fail: "status" }), disposition: "remove" })).toMatchObject({ kind: "refused", reason: "unobservable", detail: "status unavailable" });
  });
  it.each([true, false])("reports another owner's lock with folder fact %s", async (present) => {
    expect(await checkWorktreeRemoval({ ...fixture({ present, lock: "owner" }), disposition: "remove" })).toEqual({ kind: "refused", reason: "locked", path: "/checkout", lockReason: "owner", folderPresent: present });
  });
  it("treats a bare Git lock as owned by its operator", async () => {
    expect(await checkWorktreeRemoval({ ...fixture({ lock: null }), disposition: "remove" })).toEqual({ kind: "refused", reason: "locked", path: "/checkout", lockReason: null, folderPresent: true });
  });
  it("reports missing folders and accepts projection locks", async () => {
    expect(await checkWorktreeRemoval({ ...fixture({ present: false }), disposition: "remove" })).toEqual({ kind: "missing" });
    expect(await checkWorktreeRemoval({ ...fixture({ lock: PROJECTION_LOCK_REASON }), disposition: "remove" })).toEqual({ kind: "removable" });
  });
  it("does not ask the projection to observe a folder that is gone", async () => {
    expect(await checkWorktreeRemoval({ ...fixture({ present: false }), disposition: "remove", check: async () => { throw Error("projection cannot read missing folder"); } })).toEqual({ kind: "missing" });
  });
  it.each(["remove", "release"] as const)("preserves projection refusals and uncertainty for %s", async (disposition) => {
    expect(await checkWorktreeRemoval({ ...fixture(), disposition, check: async () => ({ kind: "would-refuse", remedy: { text: "repair" } }) })).toEqual({ kind: "refused", reason: "persist-would-refuse", remedy: { text: "repair" } });
    expect(await checkWorktreeRemoval({ ...fixture(), disposition, check: async () => ({ kind: "unobservable", detail: "store unreadable" }) })).toEqual({ kind: "refused", reason: "unobservable", detail: "store unreadable" });
  });
  it("release ignores dirty paths and Git locks, and keeps checkout unchanged", async () => {
    const f = fixture({ status: " M dirty\n", lock: "owner" });
    expect(await releaseWorktreeCheckout(f)).toEqual({ kind: "released" });
    expect(f.state()).toEqual({ registered: true, persisted: false, unlocked: false });
  });
  it("refusing release hooks stop before marker removal can proceed", async () => {
    expect(await releaseWorktreeCheckout({ ...fixture(), slots: { ...passingProjectionRemovalSlots, release: async () => ({ kind: "refused", remedy: { text: "repair" } }) } })).toMatchObject({ kind: "refused", check: { reason: "persist-would-refuse" } });
  });
});

describe("physical removal", () => {
  it("persists and removes a clean checkout", async () => {
    const f = fixture(); expect(await removeWorktreeCheckout(f)).toEqual({ kind: "removed" }); expect(f.state()).toEqual({ registered: false, persisted: true, unlocked: false });
  });
  it("refuses before writes", async () => {
    const f = fixture({ status: " M dirty\n" }); expect(await removeWorktreeCheckout(f)).toMatchObject({ kind: "refused", check: { reason: "dirty" } }); expect(f.state()).toEqual({ registered: true, persisted: false, unlocked: false });
  });
  it.each([true, false])("unlocks only projection locks, with folder present %s", async (present) => {
    const f = fixture({ present, lock: PROJECTION_LOCK_REASON }); expect(await removeWorktreeCheckout(f)).toEqual({ kind: present ? "removed" : "pruned" }); expect(f.state()).toEqual({ registered: false, persisted: present, unlocked: true });
  });
  it.each(["persist", "unlock", "remove"])("reports a failure at %s", async (fail) => {
    expect(await removeWorktreeCheckout(fixture({ fail, lock: PROJECTION_LOCK_REASON }))).toMatchObject({ kind: "failed", step: fail });
  });
});

describe("stale registration clearing", () => {
  it("keeps a checkout whose folder returns before stale removal", async () => {
    const f = fixture({ present: false }); let probes = 0;
    const result = await clearMissingWorktreeRegistrations({ ...f, branch: "topic", folderExists: async () => ++probes >= 3 });
    expect(result).toMatchObject({ kind: "refused", reason: expect.stringContaining("folder has returned") });
    expect(f.state()).toEqual({ registered: true, persisted: false, unlocked: false });
  });
  it("clears only a missing matching registration and respects foreign locks", async () => {
    const f = fixture({ present: false });
    expect(await clearMissingWorktreeRegistrations({ ...f, branch: "topic" })).toEqual({ kind: "clear", prunedPaths: ["/checkout"] });
    expect(f.state().registered).toBe(false);
    const locked = fixture({ present: false, lock: "operator" });
    expect(await clearMissingWorktreeRegistrations({ ...locked, branch: "topic" })).toMatchObject({ kind: "refused", reason: expect.stringContaining("git worktree unlock /checkout") });
    expect(locked.state().registered).toBe(true);
  });
});
