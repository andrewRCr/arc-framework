/** A genuine live cohort may take an existing end; retained malformed history cannot claim that authority. */
import { describe, expect, it } from "vitest";
import { ConflictRecordSchema, WholeRecordConflictSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { cohortLiveConflictFixture, metadataAt, plantHistory, quarter, archive, save } from "../helpers/store/history-control-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

type Fixture = Awaited<ReturnType<typeof cohortLiveConflictFixture>>;

async function genuineClose(h: Fixture) {
  expect(h.restored).toMatchObject({ content: h.original.content, version: h.original.version, conflicts: [h.conflict.reference] });
  expect(h.restored.placement).toBeUndefined();
  ConflictRecordSchema.parse(JSON.parse(h.conflict.content));
  success(await h.a.store.write({ action: "put", reference: h.original.reference, expected: h.original.version,
    content: h.original.content, placement: { kind: "completed", quarter }, provenance: archive }));
  const archived = success(await h.a.store.read({ reference: h.original.reference }));
  const folder = expandStoredPath(archived.reference, { placement: archived.placement });
  const metadata = await metadataAt(h.a, h.history, h.live.metadataPath);
  const end = (await h.a.git(["rev-parse", h.history])).stdout.trim();
  return { archived, folder, metadata, end };
}

async function minimalEnd(h: Fixture, end: string) {
  return plantHistory(h.a, h.history, [{ path: h.live.metadataPath,
    content: JSON.stringify({ formatVersion: 1, slug: h.original.reference.owner.name, formats: {} }) }], end,
  "External auxiliary-only child of the genuine public cohort close");
}

describe.each(["default", "separate"] as const)("cohort history control authority in %s", layout => {
  it.each(["pending-end", "late-live-local"] as const)("applies %s with the unchanged open document and its genuine retained conflict", async direction => {
    const h = await cohortLiveConflictFixture(layout), closed = await genuineClose(h), minimal = await minimalEnd(h, closed.end);
    const conflictPath = expandStoredPath(h.conflict.reference).path;
    const conflictEntry = h.liveEntries.find(entry => entry.path === conflictPath)!;
    const liveTip = (await h.b.git(["rev-parse", h.live.ref])).stdout.trim();
    let target = h.a;
    if (direction === "pending-end") {
      const observed = (await h.a.git(["ls-remote", h.remoteName, h.live.ref])).stdout.trim().split(/\s+/)[0]!;
      // Only external input publication uses native Git; the end and surviving conflict were publicly produced.
      await h.a.git(["push", "--atomic", `--force-with-lease=${h.live.ref}:${observed}`, h.remoteName,
        `${h.history}:${h.history}`, `${closed.folder.ref}:${closed.folder.ref}`, `:${h.live.ref}`]);
      target = h.b;
    } else success(await h.b.store.push());
    const pulled = success(await target.store.pull(direction === "pending-end" ? { history: [h.history] } : undefined));
    const notices = pulled.pulls.flatMap(pull => pull.notices);
    expect(notices.filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    if (direction === "pending-end") expect(notices).toContainEqual(expect.objectContaining({ kind: "rule-broken", rule: "cohort.open-members" }));
    expect(await target.store.read({ reference: h.original.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listing = success(await target.store.list({ family: "cohort", owner: h.original.reference.owner }));
    expect(listing).toMatchObject({ status: "complete", diagnostics: [] });
    expect(success(await target.store.read({ reference: h.conflict.reference })).content).toBe(h.conflict.content);
    const entries = await capturedEntries(target, h.history);
    expect(entries).toContainEqual(conflictEntry);
    expect(entries.map(entry => entry.path).sort()).toEqual([h.live.metadataPath, conflictPath].sort());
    const metadata = await metadataAt(target, h.history, h.live.metadataPath);
    const saved = await metadataAt(target, closed.folder.ref, closed.folder.metadataPath);
    expect(metadata.placement).toEqual(closed.metadata.placement);
    expect(metadata.primary).toBeUndefined();
    expect(metadata.formats).toEqual({ [JSON.stringify({ key: h.conflict.reference.key, kind: h.conflict.reference.kind })]: 1 });
    expect(saved).toEqual({ ...metadata, endBatch: closed.metadata.endBatch });
    expect(saved.batch).not.toBe(closed.metadata.batch);
    expect((await target.git(["show", "-s", "--format=%P", h.history])).stdout.trim())
      .toBe(direction === "pending-end" ? `${liveTip} ${minimal.tip}` : `${minimal.tip} ${liveTip}`);
    const originalMetadata = await metadataAt(target, liveTip, h.live.metadataPath);
    expect(originalMetadata.placement).toBeUndefined();
    const before = (await target.git(["rev-parse", h.history, closed.folder.ref])).stdout;
    success(await target.store.pull({ history: [h.history] }));
    expect((await target.git(["rev-parse", h.history, closed.folder.ref])).stdout).toBe(before);
    expect(success(await target.store.read({ reference: h.conflict.reference })).content).toBe(h.conflict.content);
    success(await target.store.push());
    const peer = direction === "pending-end" ? h.a : h.b;
    success(await peer.store.pull({ history: [h.history] }));
    expect(success(await peer.store.read({ reference: h.conflict.reference })).content).toBe(h.conflict.content);
    const restored = success(await target.store.write({ action: "put", reference: h.original.reference, expected: null,
      content: h.original.content, placement: { kind: "completed", quarter }, resolves: [h.conflict.reference], provenance: save }));
    expect(success(await target.store.read({ reference: restored.reference }))).toMatchObject({ content: h.original.content, placement: closed.archived.placement });
  }, 90_000);

  it.each(["fast-forward", "divergent"] as const)("refuses the same genuine conflict as an already-retained %s source", async direction => {
    const h = await cohortLiveConflictFixture(layout), closed = await genuineClose(h);
    // Seed the real end first; the negative input is explicitly history, never a live lifecycle route.
    await h.a.git(["push", "--atomic", h.remoteName, `${h.history}:${h.history}`, `${closed.folder.ref}:${closed.folder.ref}`, `:${h.live.ref}`]);
    await h.b.git(["fetch", h.remoteName, `${h.history}:${h.history}`]);
    const conflictPath = expandStoredPath(h.conflict.reference).path;
    const entry = h.liveEntries.find(candidate => candidate.path === conflictPath)!;
    const value = { formatVersion: 1, slug: h.original.reference.owner.name,
      formats: { [JSON.stringify({ key: h.conflict.reference.key, kind: h.conflict.reference.kind })]: 1 } };
    await plantHistory(h.b, h.history, [entry, { path: h.live.metadataPath, content: JSON.stringify(value) }], closed.end,
      "External retained conflict-bearing history lacks completed controls");
    await h.b.git(["push", h.remoteName, `${h.history}:${h.history}`]);
    if (direction === "divergent") await minimalEnd(h, closed.end);
    const before = (await h.a.git(["rev-parse", h.history, closed.folder.ref])).stdout;
    const pulled = success(await h.a.store.pull({ history: [h.history] }));
    expect(pulled.pulls.flatMap(pull => pull.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history }));
    expect((await h.a.git(["rev-parse", h.history, closed.folder.ref])).stdout).toBe(before);
    expect(success(await h.a.store.read({ reference: h.original.reference }))).toMatchObject({ content: h.original.content, placement: closed.archived.placement });
  }, 90_000);

  it("follows the selected empty whole-record metadata over an already-retained changed cohort", async () => {
    const h = await cohortLiveConflictFixture(layout);
    const content = h.original.content + "\nA genuine changed document before external retention.\n";
    const changed = success(await h.b.store.write({ action: "put", reference: h.original.reference, expected: h.restored.version,
      content, provenance: save }));
    const closed = await genuineClose(h), minimal = await minimalEnd(h, closed.end);
    const held = (await h.b.git(["rev-parse", h.live.ref])).stdout.trim();
    // The external source is explicitly retained; it receives no live-route capability.
    await h.b.git(["update-ref", h.history, held]); await h.b.git(["update-ref", "-d", h.live.ref, held]);
    await h.a.git(["push", "--atomic", h.remoteName, `${h.history}:${h.history}`, `${closed.folder.ref}:${closed.folder.ref}`, `:${h.live.ref}`]);
    const pulled = success(await h.b.store.pull({ history: [h.history] }));
    expect(pulled.pulls.flatMap(pull => pull.notices).filter(notice => notice.kind === "namespace-corrupt")).toEqual([]);
    expect(await h.b.store.read({ reference: h.original.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    const listing = success(await h.b.store.list({ family: "cohort", kind: "cohort/conflict-record", owner: h.original.reference.owner }));
    expect(listing).toMatchObject({ status: "complete", diagnostics: [] });
    if (listing.status !== "complete") throw new Error("The old and whole-record conflict must remain readable");
    expect(listing.records).toHaveLength(2);
    const generated = listing.records.find(record => JSON.stringify(record.reference) !== JSON.stringify(h.conflict.reference))!;
    const clash = WholeRecordConflictSchema.parse(JSON.parse(generated.content));
    expect(clash.current.value).toBeNull();
    expect(clash.incoming.value).toMatchObject({ content, version: changed.version });
    expect(clash.incoming.value?.placement).toBeUndefined();
    expect(success(await h.b.store.read({ reference: h.conflict.reference })).content).toBe(h.conflict.content);
    const metadata = await metadataAt(h.b, h.history, h.live.metadataPath);
    expect(metadata.placement).toEqual(closed.metadata.placement);
    expect((await metadataAt(h.b, closed.folder.ref, closed.folder.metadataPath)).endBatch).toBe(closed.metadata.endBatch);
    expect((await h.b.git(["show", "-s", "--format=%P", h.history])).stdout.trim()).toBe(`${held} ${minimal.tip}`);
    expect((await metadataAt(h.b, held, h.live.metadataPath)).placement).toBeUndefined();
    success(await h.b.store.pull({ history: [h.history] })); success(await h.b.store.push());
    success(await h.a.store.pull({ history: [h.history] }));
    expect(success(await h.a.store.read({ reference: generated.reference })).content).toBe(generated.content);
  }, 90_000);
});
