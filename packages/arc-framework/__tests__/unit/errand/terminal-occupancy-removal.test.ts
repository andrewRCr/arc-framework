/** Production terminal IO preserves projection policy through checkout removal. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  const gitState = { branch: "chore/repair", head };
  const generation = digestBytes(await readFile(resolveWorktreeMarkerPath(checkout)));
  const authority: Extract<ErrandTerminalAuthority, { kind: "authorized" }> = {
    kind: "authorized", authority: "current-checkout", subject, checkoutPath: checkout, parentCheckoutPath: root,
    generation: `errand-v1/${subject.slug}/${subject.claimId}`,
    row: { kind: "transient", checkout: { path: checkout, head, branch: "chore/repair", primary: false, detached: false, folderPresent: true },
      markerGeneration: generation, parentCheckoutPath: root, origin: null, identity: null, context: null,
      lifecycleLocation: null, diagnostics: [], subject: { kind: "errand", key: subject.slug, claimId: subject.claimId } },
  };
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "rev-parse") return { stdout: args.includes("--abbrev-ref") ? gitState.branch : gitState.head, stderr: "" };
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
  return { authority, exec, slots, gitState, state: () => ({ registered, persisted, removed, removalAttempts }) };
}

async function primaryFixture() {
  await rm(checkout, { recursive: true });
  await writeWorktreeMarker(root, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-01T00:00:00Z",
    createdFor: subject, provisioning: "ready" });
  const marker = await readFile(resolveWorktreeMarkerPath(root));
  const gitState = { branch: "chore/repair", head };
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "rev-parse") return { stdout: args.includes("--abbrev-ref") ? gitState.branch : gitState.head };
    if (args[0] === "status") return { stdout: "" };
    if (args[0] === "checkout" && args[1] !== undefined) { gitState.branch = args[1]; return { stdout: "" }; }
    throw new Error(`Unexpected Git: ${args.join(" ")}`);
  };
  const authority: Extract<ErrandTerminalAuthority, { kind: "authorized" }> = {
    kind: "authorized", authority: "current-checkout", subject, checkoutPath: root, parentCheckoutPath: null,
    generation: `errand-v1/${subject.slug}/${subject.claimId}`,
    row: { kind: "transient", checkout: { path: root, head, branch: gitState.branch, primary: true, detached: false, folderPresent: true },
      markerGeneration: digestBytes(marker), parentCheckoutPath: null, origin: null, identity: null, context: null,
      lifecycleLocation: null, diagnostics: [], subject: { kind: "errand", key: subject.slug, claimId: subject.claimId } },
  };
  return { authority, gitState, marker, io: createTerminalOccupancyIO(exec, { restorePrimaryTo: "main" }) };
}

describe("primary projection release", () => {
  it.each(["marker", "branch", "head"] as const)("retains a primary whose %s changes during release and retries after repair", async change => {
    const f = await primaryFixture();
    const markerPath = resolveWorktreeMarkerPath(root);
    const projectionRemovalSlots: ProjectionRemovalSlots = { ...passingProjectionRemovalSlots, release: async () => {
      if (change === "marker") await writeWorktreeMarker(root, { spawnedByArc: false, spawningIdentity: "andrew",
        createdAt: "2026-10-02T00:00:00Z", createdFor: subject, provisioning: "ready" });
      if (change === "branch") f.gitState.branch = "chore/replacement";
      if (change === "head") f.gitState.head = "c".repeat(40);
      return { kind: "released" };
    } };
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root, io: f.io, projectionRemovalSlots }))
      .toMatchObject({ kind: "refused", reason: change === "marker" ? "generation-mismatch" : "preservation-unproven" });
    const retained = await readFile(markerPath);
    if (change === "marker") expect(retained).not.toEqual(f.marker);
    else expect(retained).toEqual(f.marker);
    expect(f.gitState.branch).toBe(change === "branch" ? "chore/replacement" : "chore/repair");
    expect(f.gitState.head).toBe(change === "head" ? "c".repeat(40) : head);
    await writeFile(markerPath, f.marker);
    f.gitState.branch = "chore/repair"; f.gitState.head = head;
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root, io: f.io,
      projectionRemovalSlots: passingProjectionRemovalSlots })).toMatchObject({ kind: "applied" });
    await expect(readFile(markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.gitState.branch).toBe("main");
  });

  it("keeps the claim and branch on a refused release, then clears them after repair", async () => {
    const f = await primaryFixture();
    let held = true;
    const projectionRemovalSlots: ProjectionRemovalSlots = { ...passingProjectionRemovalSlots,
      release: async () => held ? { kind: "refused", remedy: { text: "Resolve the projected edit before closing." } } : { kind: "released" } };
    const options = { authority: f.authority, primaryCheckoutPath: root, io: f.io, projectionRemovalSlots };
    expect(await settleTerminalOccupancy(options)).toEqual({ kind: "refused", reason: "persist-would-refuse",
      message: "Resolve the projected edit before closing." });
    expect(await readFile(resolveWorktreeMarkerPath(root))).toEqual(f.marker);
    expect(f.gitState.branch).toBe("chore/repair");
    held = false;
    expect(await settleTerminalOccupancy(options)).toMatchObject({ kind: "applied", checkoutPath: root });
    await expect(readFile(resolveWorktreeMarkerPath(root))).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.gitState.branch).toBe("main");
  });

  it("keeps the claim and branch when release throws, then clears them after repair", async () => {
    const f = await primaryFixture();
    let broken = true;
    const projectionRemovalSlots: ProjectionRemovalSlots = { ...passingProjectionRemovalSlots, release: async () => {
      if (broken) throw new Error("Primary projection release failed.");
      return { kind: "released" };
    } };
    const options = { authority: f.authority, primaryCheckoutPath: root, io: f.io, projectionRemovalSlots };
    expect(await settleTerminalOccupancy(options)).toEqual({ kind: "error", message: "Primary projection release failed." });
    expect(await readFile(resolveWorktreeMarkerPath(root))).toEqual(f.marker);
    expect(f.gitState.branch).toBe("chore/repair");
    broken = false;
    expect(await settleTerminalOccupancy(options)).toMatchObject({ kind: "applied", checkoutPath: root });
    await expect(readFile(resolveWorktreeMarkerPath(root))).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.gitState.branch).toBe("main");
  });
});

describe("projection-aware terminal removal", () => {
  it("persists a clean spawned checkout before retiring its registration", async () => {
    const f = await fixture();
    expect(await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root,
      io: createTerminalOccupancyIO(f.exec), projectionRemovalSlots: f.slots })).toMatchObject({ kind: "applied" });
    expect(f.state()).toEqual({ registered: false, persisted: true, removed: true, removalAttempts: 1 });
  });
  it.each(["marker", "branch", "head"] as const)("retains a spawned checkout whose %s changes during persistence, then retries after repair", async change => {
    const f = await fixture();
    const markerPath = resolveWorktreeMarkerPath(checkout);
    const originalMarker = await readFile(markerPath);
    const slots: ProjectionRemovalSlots = { ...f.slots, persist: async () => {
      await f.slots.persist(checkout);
      if (change === "marker") await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew",
        createdAt: "2026-10-02T00:00:00Z", createdFor: subject, provisioning: "ready" });
      if (change === "branch") f.gitState.branch = "chore/replacement";
      if (change === "head") f.gitState.head = "c".repeat(40);
      return { kind: "persisted" };
    } };
    const result = await settleTerminalOccupancy({ authority: f.authority, primaryCheckoutPath: root,
      io: createTerminalOccupancyIO(f.exec), projectionRemovalSlots: slots });
    expect(result).toMatchObject({ kind: "refused", reason: change === "marker" ? "generation-mismatch" : "preservation-unproven",
      message: expect.stringContaining("changed") });
    expect(f.state()).toEqual({ registered: true, persisted: true, removed: false, removalAttempts: 0 });
    if (change === "marker") expect(await readFile(markerPath)).not.toEqual(originalMarker);
    await writeFile(markerPath, originalMarker);
    f.gitState.branch = "chore/repair";
    f.gitState.head = head;
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
