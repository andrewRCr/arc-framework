/** Saves across process boundaries while native refresh, fan-out, removal, and rebuild replace projected files. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectionHook } from "../fixtures/store/projection-process-protocol.js";
import { projectionBurstFixture, projectionSaveEvidence, preservedProjectionSave, burstEntry, burstContent,
  BURST_PATH, BURST_REFERENCE, BURST_PROVENANCE, BURST_ORIGINAL, PROJECTION_BURST_TIMEOUT_MS } from "../helpers/store/projection-burst-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { nameAsideFile } from "../../src/lib/store/projection/aside.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../helpers/store/projection/engine-fixture.js";
import { commitProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { withProjectionEntry } from "../../src/lib/store/projection/index-memory.js";
import { observeAsideCopy } from "../../src/lib/store/projection/aside-copies.js";
import { renderStampedFile } from "../../src/lib/store/projection/stamp.js";

type Fixture = Awaited<ReturnType<typeof projectionBurstFixture>>;

async function assertSaves(f: Fixture, entries: readonly string[], reports: readonly string[]): Promise<void> {
  await Promise.all(f.writers.map(writer => writer.close()));
  const stored = await f.h.a.store.read({ reference: BURST_REFERENCE });
  if (stored.status !== "ok" && stored.refusal.code !== "not-found") throw new Error(JSON.stringify(stored));
  const evidence = await projectionSaveEvidence({ roots: f.roots, reports, stored: stored.status === "ok" ? stored.result.content : "" });
  for (const entry of entries) expect(preservedProjectionSave(entry, evidence), JSON.stringify({ entry,
    evidence: evidence.map(each => ({ locus: each.locus, recoverable: each.recoverable, containsSave: each.content.includes(entry) })),
  }, null, 2)).toBe(true);
}

async function placedSaves(f: Fixture, hook: ProjectionHook, create = false): Promise<void> {
  if (!create) await Promise.all(f.writers.map(writer => writer.send({ action: "open" })));
  const runs = f.writers.map(writer => writer.send({ action: "run", operation: "refresh", hook }));
  const arrivals = await Promise.all(f.writers.map((writer, i) => writer.hook(runs[i]!)));
  for (const [i, arrival] of arrivals.entries()) expect(arrival).toMatchObject({ hook, root: f.roots[i], path: BURST_PATH });
  const entries = f.writers.map((_, i) => burstEntry(100 + i, `Complete saved body ${hook} writer ${i}.`));
  await Promise.all(f.writers.map((writer, i) => writer.send({ action: "save", content: f.saved(entries[i]!),
    mode: create ? "create" : i % 2 === 0 ? "handle" : "truncate" })));
  await Promise.all(f.writers.map((writer, i) => writer.send({ action: "release", sequence: arrivals[i]!.sequence })));
  await assertSaves(f, entries, await Promise.all(runs));
  console.info(`projection bursts: ${hook}, ${f.roots.length} processes, ${entries.length} completed saves preserved`);
}

describe.skipIf(process.env.ARC_STORE_BURSTS !== "1").each(["default", "separate"] as const)("native projection bursts (%s)", layout => {
  for (const hook of ["afterRecheck", "afterMove", "afterFirstCheck"] as const) it(`keeps twenty rotated saves during refresh ${hook}`, async () => {
    const f = await projectionBurstFixture(layout);
    await f.edit(burstContent(burstEntry(2, "A landed refresh update.")));
    await placedSaves(f, hook);
    expect(success(await f.h.a.store.read({ reference: BURST_REFERENCE })).content).toContain(burstEntry(2, "A landed refresh update."));
  }, PROJECTION_BURST_TIMEOUT_MS);

  for (const hook of ["afterMove", "afterFirstCheck"] as const) it(`keeps twenty rotated saves during removal ${hook}`, async () => {
    const f = await projectionBurstFixture(layout);
    success(await f.h.a.store.write({ action: "remove", reference: f.base.reference, expected: f.base.version, provenance: BURST_PROVENANCE }));
    expect(await f.h.a.store.read({ reference: f.base.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    await placedSaves(f, hook);
  }, PROJECTION_BURST_TIMEOUT_MS);

  it("keeps twenty recreated saves at the absent-file rebuild link", async () => {
    const f = await projectionBurstFixture(layout);
    await Promise.all(f.roots.map(root => rm(join(root, BURST_PATH))));
    await f.edit(burstContent(burstEntry(2, "A landed rebuild update.")));
    await placedSaves(f, "beforeRebuildLink", true);
    expect(success(await f.h.a.store.read({ reference: BURST_REFERENCE })).content).toContain(burstEntry(2, "A landed rebuild update."));
  }, PROJECTION_BURST_TIMEOUT_MS);

  it("keeps every sibling save at the real writer's serial fan-out visits", async () => {
    const f = await projectionBurstFixture(layout), writer = f.writers[0]!;
    const update = burstEntry(2, "The accepted fan-out update.");
    const operation = writer.send({ action: "run", operation: "fan-out", hook: "beforeTarget", content: burstContent(update) });
    const entries = f.roots.map((_, i) => burstEntry(100 + i, `Complete fan-out save for root ${i}.`));
    const visited = new Set<string>();
    for (let i = 0; i < f.roots.length; i++) {
      const arrival = await writer.hook(operation);
      expect(arrival).toMatchObject({ hook: "beforeTarget", path: BURST_PATH });
      const target = f.roots.findIndex(root => resolve(root) === resolve(arrival.root));
      expect(target, JSON.stringify({ arrival: arrival.root, roots: f.roots })).toBeGreaterThanOrEqual(0);
      expect(visited.has(arrival.root)).toBe(false); visited.add(arrival.root);
      const editor = f.writers[(target + f.writers.length - 1) % f.writers.length]!;
      await editor.send({ action: "save", content: f.saved(entries[target]!), mode: "rename" });
      await writer.send({ action: "release", sequence: arrival.sequence });
    }
    const report = await operation;
    const stored = success(await f.h.a.store.read({ reference: BURST_REFERENCE }));
    expect(stored.content).toContain(update);
    for (const root of f.roots) expect(await readFile(join(root, BURST_PATH), "utf8")).toContain(update);
    await assertSaves(f, entries, [report]);
  }, PROJECTION_BURST_TIMEOUT_MS);

  it("rejects missing saves and unindexed debris as preservation evidence", async () => {
    const h = await refSyncFixture(layout), entry = burstEntry(100, "An unindexed save is not recoverable.");
    success(await h.a.store.write({ action: "put", reference: BURST_REFERENCE, expected: null,
      content: BURST_ORIGINAL, provenance: BURST_PROVENANCE }));
    await configureEngineCheckout(h.cloneA);
    await seedProjection({ store: h.a.store, checkout: h.cloneA, files: [{ path: BURST_PATH, reference: BURST_REFERENCE }] });
    const debris = join(h.cloneA, nameAsideFile({ path: BURST_PATH, base: gitBlobId(BURST_ORIGINAL, "sha1"),
      writer: { pid: process.pid, processInstance: "unindexed", processScope: "oracle-negative-check" }, role: "aside" }));
    await mkdir(dirname(debris), { recursive: true });
    await writeFile(debris, entry);
    const evidence = await projectionSaveEvidence({ roots: [h.cloneA], reports: [], stored: BURST_ORIGINAL });
    expect(preservedProjectionSave(entry, evidence)).toBe(false);
    expect(preservedProjectionSave(burstEntry(101, "Missing entirely."), evidence)).toBe(false);
  }, PROJECTION_BURST_TIMEOUT_MS);

  it.each(["moving", "landed", "edited"] as const)("counts an indexed aside only while it holds an edit (%s)", async state => {
    const h = await refSyncFixture(layout), saved = burstEntry(100, "The copy is the only possible witness.");
    success(await h.a.store.write({ action: "put", reference: BURST_REFERENCE, expected: null,
      content: BURST_ORIGINAL, provenance: BURST_PROVENANCE }));
    await configureEngineCheckout(h.cloneA);
    const projection = await seedProjection({ store: h.a.store, checkout: h.cloneA, files: [{ path: BURST_PATH, reference: BURST_REFERENCE }] });
    const entry = projection.index.entries[BURST_PATH];
    if (entry?.kind !== "record") throw new Error("The native fixture has no indexed record");
    const original = await readFile(join(h.cloneA, BURST_PATH));
    const bytes = renderStampedFile({ content: burstContent(saved), stamp: gitBlobId(BURST_ORIGINAL, "sha1") });
    const name = nameAsideFile({ path: BURST_PATH, base: entry.base.blob,
      writer: { pid: process.pid, processInstance: "indexed", processScope: "oracle-check" }, role: "aside" });
    await mkdir(dirname(join(h.cloneA, name)), { recursive: true });
    await writeFile(join(h.cloneA, name), bytes);
    const copy = { name, moving: gitBlobId(state === "moving" ? bytes : original, "sha1"),
      landed: state === "landed" ? gitBlobId(bytes, "sha1") : null, linked: gitBlobId(original, "sha1"),
      writeBackSent: false, rendering: { markers: entry.markers, notices: entry.notices } };
    const pending = { ...entry, pending: true, copies: [copy] };
    await commitProjectionIndex({ checkout: h.cloneA, location: projection.location,
      index: withProjectionEntry(projection.index, BURST_PATH, pending) });
    expect(await observeAsideCopy({ checkout: h.cloneA, path: BURST_PATH, entry: pending, copy, format: "sha1" }))
      .toMatchObject({ kind: state === "edited" ? "edited" : "no-edit" });
    const evidence = await projectionSaveEvidence({ roots: [h.cloneA], reports: [], stored: BURST_ORIGINAL });
    expect(preservedProjectionSave(saved, evidence)).toBe(state === "edited");
  }, PROJECTION_BURST_TIMEOUT_MS);
});
