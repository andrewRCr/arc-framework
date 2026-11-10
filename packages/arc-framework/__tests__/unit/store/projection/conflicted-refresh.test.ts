/** Conflicted views refresh independent stored edits while preserving unresolved marker blocks. */
import { afterEach, describe, expect, it } from "vitest";
import { createStoredConflictFixture } from "../../../helpers/store/projection/stored-conflict-fixture.js";
import { refreshWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { parseMarkerContent } from "../../../../src/lib/store/projection/marker-parse.js";
import { prepareConflictedRefresh } from "../../../../src/lib/store/projection/conflicted-refresh.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

async function projectedConflict(path?: string) {
  const base = "left\nbase\nright\n\nspare\n\ntail\n";
  const fixture = await createStoredConflictFixture({ base, path, current: base.replace("base", "stored"), incoming: base.replace("base", "incoming") });
  fixtures.push(fixture);
  const index = await refreshWriteBackFixture(fixture, fixture.index);
  const entry = index.entries[fixture.path];
  if (entry?.kind !== "record") throw new Error("Rendered entry missing");
  return { ...fixture, entry, index, text: await fixture.file() };
}

describe("conflicted refresh", () => {
  it.each([".arc/document.md", ".arc/document.txt"])("refreshes a stored change elsewhere while keeping its marker block and origin (%s)", async path => {
    const fixture = await projectedConflict(path);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: fixture.record.content.replace("tail", "remote tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const result = await prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text: fixture.text, entry: fixture.entry, current });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Refresh held");
    expect(result.rendered.content).toContain("remote tail");
    expect(result.rendered.content).toContain("stored\n=======\nincoming");
    expect(result.rendered.state.markers).toEqual(fixture.entry.markers);
    expect(await fixture.file()).toBe(fixture.text);
  });
  it("takes a resolution made elsewhere by removing closed markers from an unchanged file", async () => {
    const fixture = await projectedConflict();
    const resolved = fixture.record.content.replace("stored", "resolved elsewhere");
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: resolved, resolves: fixture.record.conflicts, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const result = await prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text: fixture.text, entry: fixture.entry, current });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Refresh held");
    expect(result.rendered.content).toBe(resolved);
    expect(result.rendered.state.markers).toBeNull();
    expect(result.rendered.notices).toEqual([]);
  });

  it("grows existing controls before merging a newer marker-like line and parses the refreshed file back", async () => {
    const fixture = await projectedConflict();
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: fixture.record.content.replace("tail", "Heading\n======="), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const result = await prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text: fixture.text, entry: fixture.entry, current });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready" || result.rendered.state.markers === null) throw new Error("Marked refresh missing");
    expect(result.rendered.state.markers.length).toBe(11);
    const parsed = parseMarkerContent({ content: result.rendered.content, markers: result.rendered.state.markers,
      conflicts: fixture.conflicts, open: current.conflicts });
    expect(parsed.kind).toBe("ready");
    if (parsed.kind !== "ready") throw new Error("Refreshed markers cannot be parsed");
    expect(parsed.content).toContain("Heading\n=======\n");
  });

  it("keeps an overlapping stored change pending and retries once its conflict is resolved", async () => {
    const fixture = await projectedConflict();
    const moved = fixture.record.content.replace("stored", "changed stored");
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: moved, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const refresh = (current: typeof fixture.record) => prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text: fixture.text, entry: fixture.entry, current });
    expect(await refresh(current)).toMatchObject({ kind: "pending", mark: { reason: expect.stringContaining("overlaps"), remedy: { text: expect.stringContaining("Resolve") } } });
    expect(await fixture.file()).toBe(fixture.text);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: current.version,
      content: moved.replace("changed stored", "resolved"), resolves: current.conflicts, provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const repaired = await refresh(success(await fixture.store.read({ reference: fixture.entry.reference })));
    expect(repaired).toMatchObject({ kind: "ready", rendered: { content: expect.stringContaining("resolved"), state: { markers: null } } });
  });

  it("keeps closed markers where a newer save means the file is no longer unchanged", async () => {
    const fixture = await projectedConflict();
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: fixture.record.content.replace("stored", "resolved elsewhere"), resolves: fixture.record.conflicts,
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    await fixture.edit(parseStampedFile(fixture.text).content + "hand note\n", fixture.entry.base.blob);
    const text = await fixture.file();
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    expect(await prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text, entry: fixture.entry, current })).toMatchObject({ kind: "pending" });
    expect(await fixture.file()).toBe(text);
  });

  it.each(["state-unresolvable", "namespace-corrupt"] as const)("keeps a refresh pending when history refuses %s and retries after repair", async code => {
    const fixture = await projectedConflict();
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: fixture.record.content.replace("tail", "remote tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    const boundary = createRefusingStore(fixture.store);
    const common = { code, condition: "The rendered base cannot be read.", remedy: { text: "Repair readable history and refresh again." } };
    const refusal = StoreRefusalSchema.parse(code === "state-unresolvable"
      ? { ...common, class: "recoverable", reference: fixture.entry.reference, historyRefs: [] }
      : { ...common, class: "terminal", namespace: "memory" });
    boundary.refuse("history", refusal);
    const refresh = () => prepareConflictedRefresh({ ...fixture.context, store: boundary.store, memo: createHistoryMemo(boundary.store) },
      { path: fixture.path, text: fixture.text, entry: fixture.entry, current });
    expect(await refresh()).toEqual({ kind: "pending", mark: { reason: refusal.condition, remedy: refusal.remedy } });
    expect(boundary.calls("pull")).toBe(0);
    expect(await fixture.file()).toBe(fixture.text);
    boundary.refuse("history", null);
    expect(await refresh()).toMatchObject({ kind: "ready", rendered: { content: expect.stringContaining("remote tail") } });
  });

  it("draws a newly filed conflict and drops a closed notice in the same refresh", async () => {
    const base = "left first\nbase first\nright first\n\nspare one\n\nleft second\nbase second\nright second\n\nspare two\n\nleft third\nbase third\nright third\n";
    const fixture = await createStoredConflictFixture({ base, current: base.replace("base first", "stored first").replace("base second", "stored second"),
      incoming: base.replace("base first", "incoming first").replace("base second", "incoming second") });
    fixtures.push(fixture);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("left first", "changed left first"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const index = await refreshWriteBackFixture(fixture, fixture.index);
    const entry = index.entries[fixture.path];
    if (entry?.kind !== "record" || entry.notices[0] === undefined) throw new Error("Notice fixture missing");
    const text = await fixture.file();
    expect(parseStampedFile(text).notices).toHaveLength(1);
    const rendered = success(await fixture.store.read({ reference: entry.reference }));
    success(await fixture.store.write({ action: "put", reference: entry.reference, expected: rendered.version,
      content: rendered.content, resolves: [entry.notices[0]], provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const before = success(await fixture.store.read({ reference: entry.reference }));
    success(await fixture.store.write({ action: "put", reference: entry.reference, expected: before.version,
      content: before.content.replace("base third", "stored third"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    success(await fixture.store.write({ action: "put", reference: entry.reference, expected: before.version,
      content: before.content.replace("base third", "incoming third"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: entry.reference }));
    const result = await prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text, entry, current });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Refresh held");
    expect(result.rendered.content).toContain("incoming second");
    expect(result.rendered.content).toContain("incoming third");
    expect(result.rendered.state.markers?.sets).toHaveLength(2);
    expect(result.rendered.notices).toEqual([]);
    expect(result.rendered.state.notices).toEqual([]);
  });

  it("refreshes an entry kind by lines despite the duplicate identity inside its marker sides", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase text\n";
    const fixture = await createStoredConflictFixture({ kind: "personal/inbox", base,
      current: base.replace("base text", "stored text"), incoming: base.replace("base text", "incoming text") });
    fixtures.push(fixture);
    const index = await refreshWriteBackFixture(fixture, fixture.index);
    const entry = index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("Entry projection missing");
    const text = await fixture.file();
    expect(text.match(/_Id:_ `11111111`/gu)).toHaveLength(2);
    const currentBefore = success(await fixture.store.read({ reference: entry.reference }));
    success(await fixture.store.write({ action: "put", reference: entry.reference, expected: entry.base.version,
      content: currentBefore.content.replace("# Inbox", "# Later Inbox"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const current = success(await fixture.store.read({ reference: entry.reference }));
    const result = await prepareConflictedRefresh({ ...fixture.context, memo: createHistoryMemo(fixture.store) },
      { path: fixture.path, text, entry, current });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Entry refresh held");
    expect(result.rendered.content).toContain("# Later Inbox");
    expect(result.rendered.content).toContain("incoming text");
    expect(result.rendered.state.markers).toEqual(entry.markers);
  });

});
