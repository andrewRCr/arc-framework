/** Removal observations retained by advisory cleanup readers. */
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { passingProjectionRemovalSlots } from "../../../src/lib/git/worktree-removal.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";
import { runLandedRetirementSweep } from "../../../src/lib/session-init/lifecycle-residue-sweep.js";
import { runStaleWorktreeSweep } from "../../../src/lib/session-init/stale-worktree-sweep.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

let root: string;
let checkout: string;
const head = "a".repeat(40);
const base = "b".repeat(40);
const marker = { kind: "present", marker: {
  spawnedByArc: true, wuName: "done", spawningIdentity: "andrew", createdAt: "2026-10-01T00:00:00Z",
} } satisfies WorktreeMarkerReadResult;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "arc-cleanup-")); checkout = join(root, "done"); await mkdir(checkout); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function sweep(options: { locked?: boolean; status?: "dirty" | "failed"; husk?: boolean; missing?: boolean; projectionRefuses?: boolean } = {}) {
  if (options.missing) await rm(checkout, { recursive: true });
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "worktree") return { stdout: worktreePorcelainZ(
      `worktree ${root}\nHEAD ${head}\nbranch refs/heads/main\n\nworktree ${checkout}\nHEAD ${head}\n${options.husk ? "detached" : "branch refs/heads/feat/done"}\n${options.locked ? "locked owner\n" : ""}`), stderr: "" };
    if (args[0] === "ls-tree") return { stdout: ".arc/completed/2026-q4/1_done/meta-done.md\n", stderr: "" };
    if (args[0] === "cherry") return { stdout: "", stderr: "" };
    if (args[0] === "status") {
      if (options.status === "failed") throw new Error("status unavailable");
      return { stdout: options.status === "dirty" ? " M changed\n" : "", stderr: "" };
    }
    throw new Error(`Unexpected git: ${args.join(" ")}`);
  };
  return runStaleWorktreeSweep({
    exec, roster: { entries: options.husk ? [] : [{ worktreePath: checkout, branch: "feat/done" }], warnings: [] },
    worktreeIdentity: { kind: "primary" }, baseBranch: "main", derivedRoster: [], readBlob: async () => null,
    baseEvidence: { remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: base } },
      objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } },
    readMarker: async (path) => path !== checkout ? { kind: "absent" } : options.husk ? { kind: "present", marker: {
      ...marker.marker, husk: { sha: head, at: "2026-10-01T00:00:00Z", subject: { kind: "work-unit", name: "done" }, branch: "feat/done" },
    } } : marker,
    projectionRemovalSlots: { ...passingProjectionRemovalSlots, check: async () => options.projectionRefuses
      ? { kind: "would-refuse", remedy: { text: "save projection", argv: ["arc", "save"] } } : { kind: "passes" } },
  });
}

describe("cleanup removal observations", () => {
  it.each([false, true])("retains status uncertainty (husk=%s)", async (husk) => {
    const result = await sweep({ husk, status: "failed" });
    expect(result.worktrees[0]?.decision).toEqual({ action: "blocked", reason: "unobservable" });
    expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
  });
  it.each([false, true])("retains foreign locks (husk=%s)", async (husk) => {
    expect((await sweep({ husk, locked: true })).worktrees[0]?.decision).toEqual({ action: "blocked", reason: "locked" });
  });
  it.each([false, true])("keeps dirty checkouts blocked (husk=%s)", async (husk) => {
    expect((await sweep({ husk, status: "dirty" })).worktrees[0]?.decision).toEqual({ action: "blocked", reason: "uncommitted" });
  });
  it("maps a disappeared branched folder to external", async () => {
    expect((await sweep({ missing: true })).worktrees[0]?.decision).toEqual({ action: "external" });
  });
  it("omits a husk whose folder disappeared after its stamp read", async () => {
    expect((await sweep({ missing: true, husk: true })).worktrees).toEqual([]);
  });
  it("honors an injected projection refusal", async () => {
    expect((await sweep({ projectionRefuses: true })).worktrees[0]?.decision).toEqual({ action: "blocked", reason: "uncommitted" });
  });
});

it("applies the injected projection check to the default residue observation", async () => {
  const digest = `sha256:${"1".repeat(64)}` as const;
  const exec: GitExec = async (_command, args) => ({ stderr: "", stdout: args[0] === "worktree"
    ? worktreePorcelainZ(`worktree ${checkout}\nHEAD ${head}\nbranch refs/heads/feat/done\n`) : "" });
  const result = await runLandedRetirementSweep({
    topology: [{ path: checkout, head, branch: "feat/done", detached: false, primary: false, folderPresent: true }],
    markers: new Map([[checkout, { kind: "present", marker: { ...marker.marker, createdFor: { kind: "work-unit", name: "done" } } }]]),
    exec, baseBranch: "main", protection: "full", readBlob: async () => null,
    baseEvidence: { remoteSyncEnabled: true, snapshot: { kind: "available", scope: "all-heads", tips: { main: base } },
      objectAvailability: { kind: "complete", commits: { [base]: true } }, history: { kind: "complete" } },
    authorize: async () => ({ status: "authorized", authorization: "discard-confirmed", authorityVersion: digest,
      evidence: { kind: "git-transition", transition: "abandon", resultDigest: digest }, refs: { localOid: head, remote: null } }),
    projectionRemovalSlots: { ...passingProjectionRemovalSlots, check: async () => ({ kind: "would-refuse",
      remedy: { text: "save projection", argv: ["arc", "save"] } }) },
  });
  expect(result.retirements).toEqual([{ status: "blocked", worktreePath: checkout,
    subject: { slug: "done", branch: "feat/done" }, reason: "uncommitted" }]);
});

it("offers a typed teardown for a removable shipped checkout", async () => {
  const result = await sweep();
  expect(result.worktrees[0]?.actions).toEqual([{ argv: ["arc", "teardown", "done"], text: "arc teardown done" }]);
  expect(StaleWorktreeSweepResultSchema.safeParse(result).success).toBe(true);
});
