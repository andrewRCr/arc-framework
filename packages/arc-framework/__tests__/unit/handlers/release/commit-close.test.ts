/** Release task checks run only after authorization and audit their own refusal. */
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runReleaseCommit, type ReleaseCommitDeps } from "../../../../src/handlers/release/commit.js";
import { ARC_CONFIG_FIELDS, type ConfigSettings } from "../../../../src/lib/config/schema.js";
import { AuditEntrySchema, type AuditEntry } from "../../../../src/lib/release/schema.js";
let cwd: string;
beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), "arc-release-close-")); await mkdir(join(cwd, ".arc", "active"), { recursive: true }); });
afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });
function harness() {
  let committed = false; let checked = false; let closed = false;
  const audit: AuditEntry[] = []; const errors: string[] = [];
  const continuation = { text: "Run arc task close 1.1.", argv: ["arc", "task", "close", "1.1"] };
  const deps: ReleaseCommitDeps = {
    cwd, identity: "test-user", argv: ["-m", "feat: work"], currentBranch: "feat/work",
    settings: { settings: Object.fromEntries(ARC_CONFIG_FIELDS.map((field) => [field.key, field.defaultValue])) as ConfigSettings,
      resolved: { commitInterlock: { value: "on-task-approval", source: "git-config" }, pushInterlock: { value: "manual", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" }, notesPush: { value: "on-sync", source: "default" }, releaseOptedIn: { value: "true", source: "git-config" } },
      defaultsApplied: [], warnings: [] },
    spawnGit: async () => { committed = true; return { exitCode: 0, stdout: "", stderr: "" }; }, resolveHead: async () => (committed ? "a" : "b").repeat(40),
    listRemoteRefsContainingHead: async () => [],
    preflightCommitMessage: async () => ({ kind: "pass-through" }), createMessageSnapshot: () => { throw new Error("no snapshot required"); },
    persistMessageRetry: () => { throw new Error("no retry required"); }, cleanupConsumedMessageRetry: async () => false,
    preflightRemedy: "correct the message", writeStderr: (text) => { errors.push(text); },
    appendAudit: async ({ entry }) => { audit.push(AuditEntrySchema.parse(entry)); return { ok: true }; },
    taskClose: { continuation, precheck: async () => { checked = true; return { status: "ready" }; },
      close: async () => { closed = true; return { status: "closed" }; } },
  };
  return { deps, audit, errors, state: () => ({ committed, checked, closed }) };
}
it("pass-through message preflight still checks and closes around the commit", async () => {
  const h = harness(); expect(await runReleaseCommit(h.deps)).toEqual({ exitCode: 0 });
  expect(h.state()).toEqual({ committed: true, checked: true, closed: true });
  expect(h.audit[0]).toMatchObject({ decision: "proceeded", outcome: { kind: "commit" } });
});
it.each(["branch-unlinked", "task-invalid", "base-unavailable", "paused", "unsupported"])("audits %s without committing", async (check) => {
  const h = harness(); h.deps.taskClose = { continuation: { text: "arc task close", argv: ["arc", "task", "close"] },
    precheck: async () => ({ status: "refused", check, reason: "The task context is invalid.", remedy: { text: "repair the task context" } }),
    close: () => { throw new Error("must not close"); } };
  expect(await runReleaseCommit(h.deps)).toEqual({ exitCode: 17 });
  expect(h.state().committed).toBe(false);
  expect(h.audit).toMatchObject([{ decision: "refused", refusalCode: 17, outcome: { kind: "close-precheck-failed", check } }]);
  expect(h.errors.join("")).toContain("repair the task context");
});
it("a denied interlock checks nothing", async () => {
  const h = harness(); h.deps.settings.resolved.commitInterlock = { value: "manual", source: "default" };
  expect((await runReleaseCommit(h.deps)).exitCode).toBe(11);
  expect(h.state()).toEqual({ committed: false, checked: false, closed: false });
});
it("a refused message checks nothing", async () => {
  const h = harness(); h.deps.preflightCommitMessage = async () => ({ kind: "refused", reason: "input", message: "bad message" });
  expect((await runReleaseCommit(h.deps)).exitCode).toBe(16);
  expect(h.state()).toEqual({ committed: false, checked: false, closed: false });
});
it("a postcommit close failure preserves the commit and names the standalone close", async () => {
  const h = harness(); if (h.deps.taskClose === undefined) throw new Error("missing close fixture");
  h.deps.taskClose.close = async () => ({ status: "refused", reason: "concurrent task change", remedy: { text: "retry close" } });
  expect(await runReleaseCommit(h.deps)).toEqual({ exitCode: 1, committed: "a".repeat(40), continuation: { text: "Run arc task close 1.1.", argv: ["arc", "task", "close", "1.1"] } });
  expect(h.state().committed).toBe(true);
  expect(h.audit[0]).toMatchObject({ decision: "proceeded", outcome: { kind: "commit" } });
});

it.each(["before", "after"])("preserves standalone close when the %s commit observation fails", async (when) => {
  const h = harness(); let reads = 0;
  h.deps.resolveHead = async () => {
    reads++;
    if ((when === "before" && reads === 1) || (when === "after" && reads === 2)) throw new Error("HEAD unavailable");
    return (reads === 1 ? "b" : "a").repeat(40);
  };
  expect(await runReleaseCommit(h.deps)).toMatchObject({ exitCode: 1, continuation: h.deps.taskClose!.continuation });
  expect(h.state()).toEqual({ committed: true, checked: true, closed: false });
  expect(h.errors.join("")).toContain("could not be verified");
});
