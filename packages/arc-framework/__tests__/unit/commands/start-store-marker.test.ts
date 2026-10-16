/** Public start commands honor locus refusal and preserve exact marker generations on rollback. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { runCreateNew, runGraduate } from "../../../src/commands/start.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts, type LocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { writeWorktreeOwnershipMarker, resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../../src/lib/paths.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

/** Test admission supplies anchored bytes until the locus implementation admits their serialization. */
function admittedPorts(): LocusPorts {
  return { ...createDefaultLocusPorts(), writeAnchoredMarker: async (cwd, marker) => {
    const path = resolveWorktreeMarkerPath(cwd), bytes = Buffer.from(`${JSON.stringify(marker)}\n`);
    await mkdir(dirname(path), { recursive: true });
    try { await writeFile(path, bytes, { flag: "wx" }); }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "EEXIST") return { kind: "exists" }; throw error; }
    return { kind: "created", bytes };
  } };
}

async function fixture(ports?: LocusPorts, productionOccupancy = false) {
  const root = await mkdtemp(join(tmpdir(), "arc-start-marker-")); roots.push(root);
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("demo", { state: "Planning", owner: "previous", workClass: "Novel", currentWorkflow: "draft-design" }, { kind: "backlog", commitment: "planned" });
  const mutations: string[][] = [];
  const exec: GitExec = async (_command, args) => {
    if (args.join(" ") === "rev-parse HEAD") return { stdout: "a".repeat(40) };
    if (args.join(" ") === "symbolic-ref --quiet HEAD") return { stdout: "refs/heads/person" };
    if (args.join(" ") === "rev-parse --show-toplevel") return { stdout: root };
    if (args[0] === "worktree" && args[1] === "list") return { stdout: worktreePorcelainZ(`worktree ${root}\nHEAD ${"a".repeat(40)}\nbranch refs/heads/person\n`) };
    mutations.push([...args]); throw new Error(`Unexpected physical mutation: ${args.join(" ")}`);
  };
  const io = { ...createUserIOContext(), exec };
  const ctx = buildExecutorContext({ cwd: root, io, store: h.store, locusPorts: ports, identity: "starter", teamMode: false, internalTemplateDir: getInternalTemplatePath() });
  if (!productionOccupancy) ctx.guardValidators = { ...ctx.guardValidators, "worktree-occupancy": () => ({ ok: true }) };
  let batches = 0;
  const originalBatch = h.store.batch.bind(h.store);
  h.store.batch = (input) => { batches++; return originalBatch(input); };
  const rejectBatch = (beforeRefusal?: () => Promise<void>) => {
    h.store.batch = async () => { batches++; await beforeRefusal?.(); return { status: "refused", refusal: { code: "version-conflict", class: "recoverable", condition: "Moved concurrently", records: [meta.reference], remedy: { text: "Retry start" } } }; };
  };
  return { ...h, root, meta, ctx, io, mutations, rejectBatch, batches: () => batches,
    markerPath: resolveWorktreeMarkerPath(root), restoreBatch: () => { h.store.batch = originalBatch; },
    read: async () => lifecycleSuccess(await h.store.read({ reference: meta.reference })),
    graduate: (inPlace = true) => runGraduate(ctx, { name: "demo", inPlace, spawningIdentity: "starter", baseBranch: "main", locationTemplate: join(root, "spawn"), repo: "repo" }),
  };
}

async function existingMarker(cwd: string): Promise<Buffer> {
  const result = await admittedPorts().writeAnchoredMarker(cwd, { spawnedByArc: false, wuName: "previous-claim", createdFor: { kind: "work-unit", name: "previous-claim" }, spawningIdentity: "previous", createdAt: "2026-01-01T00:00:00.000Z" });
  if (result.kind !== "created") throw new Error("fixture failed to create its marker generation");
  return result.bytes;
}

describe("public store start marker boundary", () => {
  it.each(["graduation", "create-new"] as const)("refuses %s before a physical spawn or marker write", async (command) => {
    const ports = { ...admittedPorts(), checkMarkerExclusivity: async () => ({ kind: "refused" as const, checkoutPath: "/holding", reason: "Duplicate claim. Checkout /holding already holds it; work there or free it with arc locus release." }) };
    const h = await fixture(ports);
    const result = command === "graduation" ? await h.graduate(false) : await runCreateNew({ io: h.io, store: h.store, locusPorts: ports, internalTemplateDir: getInternalTemplatePath() }, { worktreePath: h.root, identity: "starter", name: "new-work" });
    expect(result).toMatchObject(command === "graduation" ? { status: "rejected", reason: expect.stringContaining("/holding") } : { ok: false, reason: expect.stringContaining("/holding") });
    expect("reason" in result && result.reason).toContain("arc locus release");
    expect(h.mutations).toEqual([]); expect(h.batches()).toBe(0);
    await expect(readFile(h.markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.read()).version).toEqual(h.meta.version);
  });

  it("writes an anchored in-place graduation marker and commits the stub placement", async () => {
    const h = await fixture(admittedPorts());
    expect(await h.graduate()).toMatchObject({ status: "graduated", branch: null, worktreePath: h.root });
    expect(JSON.parse(await readFile(h.markerPath, "utf8"))).toMatchObject({ spawnedByArc: false, spawningIdentity: "starter", createdFor: { kind: "work-unit", name: "demo" } });
    expect((await h.read()).placement).toEqual({ kind: "active" }); expect(h.mutations).toEqual([]);
  });

  it("removes the exact anchored generation when the graduation batch refuses", async () => {
    const h = await fixture(admittedPorts()); let written: Buffer | undefined;
    h.rejectBatch(async () => { written = await readFile(h.markerPath); });
    expect(await h.graduate()).toMatchObject({ status: "rejected", reason: "Moved concurrently" });
    expect(JSON.parse(written?.toString("utf8") ?? "null")).toMatchObject({ spawnedByArc: false, wuName: "demo" });
    await expect(readFile(h.markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.read()).version).toEqual(h.meta.version); expect(h.mutations).toEqual([]);
  });

  it("preserves a concurrently changed marker generation during refused graduation rollback", async () => {
    const h = await fixture(admittedPorts()); let concurrent: Buffer | undefined;
    h.rejectBatch(async () => {
      const marker = JSON.parse(await readFile(h.markerPath, "utf8"));
      concurrent = Buffer.from(`${JSON.stringify({ ...marker, createdAt: "2026-02-01T00:00:00.000Z" })}\n`);
      await writeFile(h.markerPath, concurrent);
    });
    const result = await h.graduate();
    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("rollback failed"), recovery: {
      kind: "rollback", failures: [{ step: "occupy-planning-checkout" }],
      retryAfterRepair: [["arc", "start", "demo", "--here"]],
    } });
    expect(result.status === "rejected" && result.reason).toContain("Retry only after");
    expect(await readFile(h.markerPath)).toEqual(concurrent);
    expect((await h.read()).version).toEqual(h.meta.version); expect(h.mutations).toEqual([]);
    // The simulated owner releases the inspected claim; the failed command never removes it.
    await rm(h.markerPath); h.restoreBatch();
    expect(await h.graduate()).toMatchObject({ status: "graduated" });
    expect((await h.read()).placement).toEqual({ kind: "active" });
  });

  it("refuses an existing marker without overwriting it or committing graduation", async () => {
    const h = await fixture(admittedPorts()), existing = await existingMarker(h.root);
    expect(await h.graduate()).toMatchObject({ status: "rejected", reason: expect.stringContaining("exists") });
    expect(await readFile(h.markerPath)).toEqual(existing); expect(h.batches()).toBe(0);
    expect((await h.read()).version).toEqual(h.meta.version); expect(h.mutations).toEqual([]);
  });

  it.each([false, true])("default unadmitted writer changes no marker through refused rollback, existing=%s", async (existing) => {
    const h = await fixture(createDefaultLocusPorts()), bytes = existing ? await existingMarker(h.root) : undefined;
    let beforeRollback: Buffer | undefined;
    h.rejectBatch(async () => {
      try { beforeRollback = await readFile(h.markerPath); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    });
    expect(await h.graduate()).toMatchObject({ status: "rejected", reason: "Moved concurrently" });
    expect(beforeRollback).toEqual(existing ? bytes : undefined);
    if (existing) expect(await readFile(h.markerPath)).toEqual(bytes);
    else await expect(readFile(h.markerPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await h.read()).version).toEqual(h.meta.version); expect(h.mutations).toEqual([]);
  });
});


it.each([false, true])("uses the actual graduation placement with an occupied caller, here=%s", async (inPlace) => {
  const h = await fixture(undefined, true);
  await h.seedMeta("held");
  await writeWorktreeOwnershipMarker(h.root, { createdByArc: true,
    createdFor: { kind: "work-unit", name: "held" }, spawningIdentity: "starter" });
  const originalMarker = await readFile(h.markerPath);
  let spawned = false;
  h.ctx.reconcileWorkUnitWorktree = async () => {
    spawned = true;
    return { mutation: "spawn", branch: null, worktreePath: join(h.root, "spawn") };
  };
  const result = await h.graduate(inPlace);
  if (inPlace) {
    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining("held") });
    expect(spawned).toBe(false);
    expect(await h.read()).toEqual(h.meta);
  } else {
    expect(result).toMatchObject({ status: "graduated", worktreePath: join(h.root, "spawn") });
    expect(spawned).toBe(true);
    expect((await h.read()).placement).toEqual({ kind: "active" });
  }
  expect(await readFile(h.markerPath)).toEqual(originalMarker);
  expect(h.mutations).toEqual([]);
});
