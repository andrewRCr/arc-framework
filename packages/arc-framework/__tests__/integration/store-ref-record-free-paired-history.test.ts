/** A record-free retained history refreshes its captured folders without borrowing old record contents. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import type { RefMetadata } from "../../src/lib/store/ref/metadata.js";
import { parseStoreCommitProvenance } from "../../src/lib/store/commit-provenance.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { preparedRefSync, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";
import { success } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), provenance = { verb: "archive", lifecycleAction: "archive" };
const roles = ["work-item/meta", "work-item/record", "cohort/document"] as const;
type Role = typeof roles[number];
type Client = RefSyncFixture["a"];

async function completed(client: Client, kind: Role, name: string) {
  const reference = RecordReferenceSchema.parse({ kind, owner: { type: kind === "cohort/document" ? "cohort" : "work-item", name } });
  const content = kind === "work-item/meta" ? makeMetaFixture(name) : kind === "work-item/record" ? transientContent(reference)
    : `# ${name}\n\n**Purpose:** Keep the completed cohort.\n`;
  const made = success(await client.store.write({ action: "put", reference, content, expected: null,
    placement: { kind: "completed", quarter }, provenance }));
  return success(await client.store.read({ reference: made.reference }));
}

async function fixture(layout: "default" | "separate", role: Role) {
  return preparedRefSync(`record-free-paired-${layout}-${role}`, layout, async h => {
    const record = await completed(h.a, role, "paired-owner"), unrelated = await completed(h.a, "work-item/meta", "unrelated-owner");
    const home = expandStoredPath(record.reference, { history: true }), archived = expandStoredPath(record.reference, { placement: record.placement });
    const history = HistoryRefSchema.parse(home.ref);
    success(await h.a.store.push());
    success(await h.b.store.pull({ history: [history] }));
    const metadata = JSON.parse((await h.a.git(["show", `${history}:${home.metadataPath}`])).stdout) as RefMetadata;
    const quarterMetadata = JSON.parse((await h.a.git(["show", `${archived.ref}:${archived.metadataPath}`])).stdout) as RefMetadata;
    return { record, unrelated, home, archived, history, metadata, quarterMetadata };
  });
}

async function publishHistory(h: RefSyncFixture, history: string, entries: PlantTreeEntry[]) {
  const parent = (await h.b.git(["rev-parse", history])).stdout.trim();
  const incoming = await plantRef(h.b.root, history, entries, { parents: [parent], gitDir: h.b.gitDir });
  await h.b.git(["push", h.remoteName, `${history}:${history}`]);
  return incoming;
}

const shapes = ["empty", "manifest-root", "manifest-child", "malformed-metadata"] as const;

describe.each(["default", "separate"] as const)("record-free paired history in %s", layout => {
  describe.each(roles)("%s", role => {
    it.each(shapes)("refreshes a %s source into a metadata-only folder with genuine paired provenance", async shape => {
      const h = await fixture(layout, role), { home, archived, history, record } = h;
      const beforeEntries = await capturedEntries(h.a, archived.ref);
      const oldHistory = (await h.a.git(["rev-parse", history])).stdout.trim();
      const oldQuarter = (await h.a.git(["rev-parse", archived.ref])).stdout.trim();
      const source = shape === "empty" ? [] : [{ path: shape === "malformed-metadata" ? home.metadataPath
        : shape === "manifest-root" ? home.manifestPath.slice(0, -1) : home.manifestPath + "retained", content: "Auxiliary bytes\n" }];
      const incoming = await publishHistory(h, history, source);
      expect(success(await h.a.store.pull({ history: [history] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
      const nextHistory = (await h.a.git(["rev-parse", history])).stdout.trim();
      const nextQuarter = (await h.a.git(["rev-parse", archived.ref])).stdout.trim();
      expect(nextHistory).not.toBe(oldHistory);
      expect(nextHistory).not.toBe(incoming.tip);
      expect(nextQuarter).not.toBe(oldQuarter);
      expect((await h.a.git(["show", "-s", "--format=%P", history])).stdout.trim()).toBe(incoming.tip);
      expect((await h.a.git(["show", "-s", "--format=%P", archived.ref])).stdout.trim()).toBe(oldQuarter);
      const historyEntries = await capturedEntries(h.a, history), quarterEntries = await capturedEntries(h.a, archived.ref);
      const folderEntries = quarterEntries.filter(entry => entry.path.startsWith(archived.root));
      expect(folderEntries.map(entry => entry.path)).toEqual([archived.metadataPath]);
      expect(historyEntries.map(entry => entry.path).sort()).toEqual([home.metadataPath, ...source
        .filter(entry => entry.path !== home.metadataPath).map(entry => entry.path)].sort());
      expect(quarterEntries.filter(entry => !entry.path.startsWith(archived.root)))
        .toEqual(beforeEntries.filter(entry => !entry.path.startsWith(archived.root)));
      expect(success(await h.a.store.read({ reference: h.unrelated.reference })).content).toBe(h.unrelated.content);
      expect(await h.a.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const metadata = JSON.parse((await h.a.git(["show", `${history}:${home.metadataPath}`])).stdout) as RefMetadata;
      const saved = JSON.parse((await h.a.git(["show", `${archived.ref}:${archived.metadataPath}`])).stdout) as RefMetadata;
      expect(metadata).toMatchObject({ formatVersion: 1, slug: record.reference.owner.name, formats: {} });
      expect(metadata.formats).toEqual({});
      expect(metadata.primary).toEqual(h.metadata.primary);
      expect(metadata.placement).toEqual(h.metadata.placement);
      expect(saved).toMatchObject({ ...metadata, endBatch: h.quarterMetadata.endBatch });
      expect(saved.batch).not.toBe(h.quarterMetadata.batch);
      expect(saved.batch).toBe(metadata.batch);
      for (const ref of [history, archived.ref]) {
        const message = (await h.a.git(["show", "-s", "--format=%B", ref])).stdout;
        expect(message).toContain(`Arc-Owner: ${"uid" in record.reference.owner ? record.reference.owner.uid : "missing"}`);
        expect(parseStoreCommitProvenance(message, record.reference)).toMatchObject({ verb: "sync", lifecycleAction: "merge", batchId: saved.batch,
          reference: record.reference });
      }
    }, 90_000);
  });

  it("preserves valid empty-source metadata before accepting a later malformed auxiliary source", async () => {
    const h = await fixture(layout, "work-item/meta"), metadata = { ...h.metadata, formerSlugs: ["former-owner"], formats: { remembered: 3 } };
    await publishHistory(h, h.history, [{ path: h.home.metadataPath, content: JSON.stringify(metadata) }]);
    expect(success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    const stored = JSON.parse((await h.a.git(["show", `${h.history}:${h.home.metadataPath}`])).stdout) as RefMetadata;
    expect(stored).toEqual({ ...metadata, batch: stored.batch });
    // Preserve the paired merge's real batch as an ancestor of the subsequent fast-forward source.
    await h.a.git(["push", h.remoteName, `${h.history}:${h.history}`]);
    await h.b.git(["fetch", h.remoteName, `${h.history}:${h.history}`]);
    await publishHistory(h, h.history, [{ path: h.home.metadataPath, content: "Malformed metadata\n" }]);
    expect(success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 90_000);

  it.each(["record-without-metadata", "record-with-malformed-metadata", "foreign-metadata", "foreign-manifest"] as const)(
    "holds %s without publishing and retries a forward record-free repair", async shape => {
      const h = await fixture(layout, "work-item/meta"), entries: PlantTreeEntry[] = [{ path: shape.startsWith("record-") ? h.home.path
        : shape === "foreign-metadata" ? `metadata-${randomUUID()}.json` : `state-${randomUUID()}/retained`, content: h.record.content }];
      if (shape === "record-with-malformed-metadata") entries.push({ path: h.home.metadataPath, content: "Malformed metadata\n" });
      const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
      await publishHistory(h, h.history, entries);
      const held = success(await h.a.store.pull({ history: [h.history] }));
      expect(held.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({ kind: "namespace-corrupt", ref: h.history }));
      expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
      expect(success(await h.a.store.read({ reference: h.record.reference })).content).toBe(h.record.content);
      await publishHistory(h, h.history, []);
      expect(success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
      expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }, 90_000);

  it("keeps an unseen folder batch until history includes it and does not attribute an unclaimed owner", async () => {
    const h = await fixture(layout, "work-item/meta"), oldHistory = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    const before = success(await h.a.store.read({ reference: h.record.reference }));
    const content = `${before.content}\nA real completed write whose history is not yet captured.\n`;
    success(await h.a.store.write({ action: "put", reference: before.reference, expected: before.version, content,
      placement: { kind: "completed", quarter }, provenance: { verb: "save", lifecycleAction: "save" } }));
    const unseen = (await h.a.git(["rev-parse", h.history])).stdout.trim();
    await h.a.git(["update-ref", "refs/testing/unseen-batch", unseen]);
    // A retained quarter can arrive before the by-name history copy that carries its new batch.
    await h.a.git(["update-ref", h.history, oldHistory]);
    const quarterBefore = (await h.a.git(["rev-parse", h.archived.ref])).stdout.trim();
    const entriesBefore = await capturedEntries(h.a, h.archived.ref);
    const empty = await publishHistory(h, h.history, []);
    expect(success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    expect((await h.a.git(["rev-parse", h.history])).stdout.trim()).toBe(empty.tip);
    expect((await h.a.git(["rev-parse", h.archived.ref])).stdout.trim()).toBe(quarterBefore);
    expect(await capturedEntries(h.a, h.archived.ref)).toEqual(entriesBefore);
    expect(success(await h.a.store.read({ reference: h.record.reference })).content).toBe(content);

    const unclaimed = HistoryRefSchema.parse(`refs/arc/history/work/${randomUUID()}`);
    const unclaimedTip = await plantRef(h.b.root, unclaimed, [], { gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${unclaimed}:${unclaimed}`]);
    expect(success(await h.a.store.pull({ history: [unclaimed] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    expect((await h.a.git(["rev-parse", unclaimed])).stdout.trim()).toBe(unclaimedTip.tip);
    expect(await capturedEntries(h.a, unclaimed)).toEqual([]);
    expect((await h.a.git(["rev-parse", h.archived.ref])).stdout.trim()).toBe(quarterBefore);

    await h.b.git(["fetch", h.a.gitDir ?? h.a.root, "refs/testing/unseen-batch:refs/testing/unseen-batch"]);
    await plantRef(h.b.root, h.history, [], { parents: [empty.tip, unseen], gitDir: h.b.gitDir });
    await h.b.git(["push", h.remoteName, `${h.history}:${h.history}`]);
    expect(success(await h.a.store.pull({ history: [h.history] })).pulls.flatMap(outcome => outcome.notices)).toEqual([]);
    expect((await capturedEntries(h.a, h.archived.ref)).filter(entry => entry.path.startsWith(h.archived.root)).map(entry => entry.path))
      .toEqual([h.archived.metadataPath]);
    expect(await h.a.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 90_000);

});
