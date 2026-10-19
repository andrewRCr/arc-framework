/** Missing registrations have guarded routes independent of marker survival. */
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runStaleWorktreeSweep } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { RegisteredWorktree } from "../../../src/lib/git/worktree-roster.js";
import type { DerivedCheckoutRow } from "../../../src/lib/locus/derived-roster.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

let root: string;
let checkout: string;
const head = "a".repeat(40);
const base = "b".repeat(40);
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "arc-missing-")); checkout = join(root, "gone$(touch bad)'folder"); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function sweep(options: { shipped?: boolean; locked?: boolean; detached?: boolean; returned?: boolean; linked?: boolean } = {}) {
  if (options.returned) await mkdir(checkout);
  const registration: RegisteredWorktree = { path: checkout, head, branch: options.detached ? null : "feat/done", detached: options.detached === true,
    primary: false, folderPresent: false, ...(options.locked ? { locked: "owner" } : {}) };
  const primary: RegisteredWorktree = { path: root, head, branch: "main", primary: true, detached: false, folderPresent: true };
  const row: DerivedCheckoutRow = { kind: "unmanaged-checkout", checkout: registration, markerGeneration: null,
    parentCheckoutPath: null, origin: null, identity: null, context: null, lifecycleLocation: null, diagnostics: [], subject: null };
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "ls-tree") return { stdout: options.shipped ? ".arc/completed/2026-q4/1_done/meta-done.md\n" : "", stderr: "" };
    if (args[0] === "worktree") return { stdout: worktreePorcelainZ(
      `worktree ${root}\nHEAD ${head}\nbranch refs/heads/main\n\nworktree ${checkout}\nHEAD ${head}\n${options.detached ? "detached" : "branch refs/heads/feat/done"}\n${options.locked ? "locked owner\n" : ""}`), stderr: "" };
    if (args[0] === "status" || args[0] === "cherry") return { stdout: "", stderr: "" };
    throw new Error(`Unexpected git: ${args.join(" ")}`);
  };
  return runStaleWorktreeSweep({
    exec, roster: { entries: options.detached ? [] : [{ worktreePath: checkout, branch: "feat/done" }], warnings: [] },
    worktreeIdentity: options.linked ? { kind: "linked", path: root } : { kind: "primary" },
    baseBranch: "main", derivedRoster: [row], scanWorktrees: async () => ({ ok: true, worktrees: [primary, registration] }),
    readBlob: async () => null, readMarker: async () => ({ kind: "absent" }),
    baseEvidence: { remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } },
      objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } },
  });
}

describe("missing checkout reports", () => {
  it("routes an ended work unit through typed teardown rather than an external worktree report", async () => {
    const result = await sweep({ shipped: true });
    expect(result.worktrees).toEqual([]);
    expect(result.missingFolders).toEqual([{ worktreePath: checkout, branch: "feat/done", outcome: "missing",
      actions: [{ argv: ["arc", "teardown", "done"], text: "arc teardown done" }] }]);
    expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
  });
  it.each([true, false])("leaves another owner's unlock as text (shipped=%s)", async (shipped) => {
    const result = await sweep({ shipped, locked: true });
    expect(result.missingFolders).toMatchObject([{ outcome: "locked", actions: [{ text: expect.stringContaining("git worktree unlock") }] }]);
    const action = result.missingFolders[0]?.actions[0];
    expect(action).not.toHaveProperty("argv");
    expect(action?.text).toContain(shipped ? "arc teardown done" : "git worktree remove");
    expect(action?.text).toContain("still missing");
  });
  it.each([true, false])("reports an unowned missing registration as guarded text (detached=%s)", async (detached) => {
    const result = await sweep({ detached });
    expect(result.missingFolders).toMatchObject([{ branch: detached ? null : "feat/done", outcome: "missing" }]);
    const action = result.missingFolders[0]?.actions[0];
    expect(action).not.toHaveProperty("argv");
    expect(action?.text).toContain("still missing");
    expect(action?.text).toContain("git worktree remove '");
    expect(action?.text).toContain(`'"'"'`);
  });
  it("waits when a folder returns before the check", async () => {
    expect((await sweep({ returned: true })).missingFolders).toEqual([]);
  });
  it("does not report missing sibling folders from a linked session", async () => {
    expect((await sweep({ linked: true })).missingFolders).toEqual([]);
  });
});
