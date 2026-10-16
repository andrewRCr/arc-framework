/** Production terminal IO preserves projection policy through checkout removal. */
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTerminalOccupancyIO, settleTerminalOccupancy } from "../../../src/lib/errand/terminal-occupancy.js";
import { writeWorktreeMarker, resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { passingProjectionRemovalSlots, type ProjectionRemovalSlots } from "../../../src/lib/git/worktree-removal.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { ErrandTerminalAuthority } from "../../../src/lib/errand/terminal-authority.js";
import { digestBytes } from "../../../src/lib/kernel/index.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

let root: string;
let checkout: string;
const head = "a".repeat(40);
const subject = { kind: "errand", slug: "repair", claimId: "b".repeat(32) } as const;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-terminal-")); checkout = join(root, "repair"); await mkdir(checkout);
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-10-01T00:00:00Z",
    createdFor: subject, provisioning: "ready" });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function fixture(options: { dirty?: boolean; absent?: boolean; failedStatus?: boolean; failRemove?: boolean } = {}) {
  let registered = !options.absent;
  let persisted = false;
  let removed = false;
  let removalAttempts = 0;
  const generation = digestBytes(await readFile(resolveWorktreeMarkerPath(checkout)));
  const authority: Extract<ErrandTerminalAuthority, { kind: "authorized" }> = {
    kind: "authorized", authority: "current-checkout", subject, checkoutPath: checkout, parentCheckoutPath: root,
    generation: `errand-v1/${subject.slug}/${subject.claimId}`,
    row: { kind: "transient", checkout: { path: checkout, head, branch: "chore/repair", primary: false, detached: false, folderPresent: true },
      markerGeneration: generation, parentCheckoutPath: root, origin: null, identity: null, context: null,
      lifecycleLocation: null, diagnostics: [], subject: { kind: "errand", key: subject.slug, claimId: subject.claimId } },
  };
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "rev-parse") return { stdout: args.includes("--abbrev-ref") ? "chore/repair" : head, stderr: "" };
    if (args[0] === "status") {
      if (options.failedStatus) throw new Error("status failed");
      return { stdout: options.dirty ? " M changed\n" : "", stderr: "" };
    }
    if (args[0] === "worktree" && args[1] === "list") return { stdout: worktreePorcelainZ(
      `worktree ${root}\nHEAD ${head}\nbranch refs/heads/main\n${registered ? `\nworktree ${checkout}\nHEAD ${head}\nbranch refs/heads/chore/repair\n` : ""}`), stderr: "" };
    if (args[0] === "worktree" && args[1] === "remove") {
      removalAttempts += 1;
      if (!registered) throw new Error("not a registered worktree");
      if (options.failRemove) throw new Error("remove failed");
      registered = false; removed = true; return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected git: ${args.join(" ")}`);
  };
  const slots: ProjectionRemovalSlots = { ...passingProjectionRemovalSlots,
    persist: async () => { persisted = true; return { kind: "persisted" }; } };
  return { authority, exec, slots, state: () => ({ registered, persisted, removed, removalAttempts }) };
}

describe("projection-aware terminal removal", () => {
  it("persists a clean spawned checkout before retiring its registration", async () => {
    const f = await fixture();
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root,
      io: createTerminalOccupancyIO(f.exec), projectionRemovalSlots: f.slots })).toMatchObject({ kind: "applied" });
    expect(f.state()).toEqual({ registered: false, persisted: true, removed: true, removalAttempts: 1 });
  });
  it.each(["dirty", "failedStatus"] as const)("retains a checkout after %s", async (failure) => {
    const f = await fixture({ [failure]: true });
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root,
      io: createTerminalOccupancyIO(f.exec), projectionRemovalSlots: f.slots }))
      .toMatchObject({ kind: "refused", reason: failure === "dirty" ? "dirty" : "unobservable" });
    expect(f.state()).toEqual({ registered: true, persisted: false, removed: false, removalAttempts: 0 });
  });
  it.each(["check", "persist"] as const)("honors the injected %s refusal", async (stage) => {
    const f = await fixture();
    const slots: ProjectionRemovalSlots = { ...f.slots,
      ...(stage === "check" ? { check: async () => ({ kind: "would-refuse" as const, remedy: { text: "Save projection." } }) }
        : { persist: async () => ({ kind: "refused" as const, remedy: { text: "Save projection." } }) }) };
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root,
      io: createTerminalOccupancyIO(f.exec), projectionRemovalSlots: slots }))
      .toMatchObject({ kind: "refused", message: "Save projection." });
    expect(f.state()).toEqual({ registered: true, persisted: false, removed: false, removalAttempts: 0 });
  });
  it("returns idempotently without projection work when Git no longer lists the checkout", async () => {
    const f = await fixture({ absent: true });
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root,
      io: createTerminalOccupancyIO(f.exec), projectionRemovalSlots: f.slots })).toMatchObject({ kind: "idempotent" });
    expect(f.state()).toEqual({ registered: false, persisted: false, removed: false, removalAttempts: 0 });
  });
});
