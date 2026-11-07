/** Stored conflict placement requires stable entry identity or exact side and neighboring lines. */
import { afterEach, describe, expect, it } from "vitest";
import { createStoredConflictFixture } from "../../../helpers/store/projection/stored-conflict-fixture.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { createMarkerRenderer } from "../../../../src/lib/store/projection/marker-render.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { mergeLineText } from "../../../../src/lib/store/concurrency/line-merge.js";
import { placeStoredConflict } from "../../../../src/lib/store/projection/conflict-placement.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("stored conflict placement", () => {
  it("places a filed hunk on its current lines", async () => {
    const fixture = await createStoredConflictFixture({ base: "opening\nbase\nclosing\n",
      current: "opening\nstored\nclosing\n", incoming: "opening\nincoming\nclosing\n" });
    fixtures.push(fixture);
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    const placed = await placeStoredConflict({ content: fixture.record.content, conflict: conflict.data, memo: fixture.context.memo });
    expect(placed).toEqual({ start: 8, end: 15, current: ["stored"], incoming: ["incoming"] });
  });
  it("places an entry by identity and leaves its separator outside", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase text\n\n"
      + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nsecond text\n";
    const fixture = await createStoredConflictFixture({ kind: "personal/inbox", base,
      current: base.replace("base text", "stored text"), incoming: base.replace("base text", "incoming text") });
    fixtures.push(fixture);
    const conflict = fixture.conflicts.find(value => value.data.location.kind === "entry");
    if (conflict === undefined) throw new Error("Entry conflict missing");
    const content = fixture.record.content.replace("# Inbox", "# Later title");
    const placed = await placeStoredConflict({ content, conflict: conflict.data, memo: fixture.context.memo,
      grammar: ENTRY_CONFIGS["personal/inbox"] });
    expect(placed).not.toBeNull();
    expect(content.slice(placed?.start, placed?.end)).toBe("### [ ] **First**\n\n- _Id:_ `11111111`\n\nstored text");
    expect(placed?.incoming.join("\n")).toContain("incoming text");
    const place = (content: string) => placeStoredConflict({ content, conflict: conflict.data, memo: fixture.context.memo,
      grammar: ENTRY_CONFIGS["personal/inbox"] });
    expect(await place(content.replace("stored text", "newer accepted text"))).toBeNull();
    expect(await place(content.replace("stored text\n\n", "stored text\n\n\n"))).not.toBeNull();
    expect(await place(content)).toEqual(placed);
  });

  it("relocates an untouched hunk and rejects changed neighbors or sides until repaired", async () => {
    const base = "title\nspare\nleft\nbase\nright\ntail\n";
    const fixture = await createStoredConflictFixture({ base, current: base.replace("base", "stored"), incoming: base.replace("base", "incoming") });
    fixtures.push(fixture);
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    const content = "added\n" + fixture.record.content;
    const place = (content: string) => placeStoredConflict({ content, conflict: conflict.data, memo: fixture.context.memo });
    const placed = await place(content);
    expect(placed).not.toBeNull();
    expect(content.slice(placed?.start, placed?.end)).toBe("stored\n");
    expect(await place(content.replace("left", "changed left"))).toBeNull();
    expect(await place(content.replace("right", "changed right"))).toBeNull();
    expect(await place(content.replace("stored", "changed side"))).toBeNull();
    expect(await place(content)).toEqual(placed);
  });

  it("leaves a missing entry unplaced until its identity returns", async () => {
    const base = "# Memory\n\n## Memories\n\n**A remembered fact:**\n_Remove when:_ done\n_Id:_ `11111111`\n\nbase text\n";
    const fixture = await createStoredConflictFixture({ kind: "personal/working-memory", base,
      current: base.replace("base text", "stored text"), incoming: base.replace("base text", "incoming text") });
    fixtures.push(fixture);
    const conflict = fixture.conflicts.find(value => value.data.location.kind === "entry");
    if (conflict === undefined) throw new Error("Entry conflict missing");
    const place = (content: string) => placeStoredConflict({ content, conflict: conflict.data, memo: fixture.context.memo,
      grammar: ENTRY_CONFIGS["personal/working-memory"] });
    expect(await place(fixture.record.content.replace("11111111", "22222222"))).toBeNull();
    const placed = await place(fixture.record.content);
    expect(placed).not.toBeNull();
    expect(fixture.record.content.slice(placed?.start, placed?.end)).toContain("_Id:_ `11111111`");
  });

  it.each(["state-unresolvable", "namespace-corrupt"] as const)("leaves a hunk unplaced when history refuses %s, then places after repair", async code => {
    const fixture = await createStoredConflictFixture({ base: "left\nbase\nright\n", current: "left\nstored\nright\n", incoming: "left\nincoming\nright\n" });
    fixtures.push(fixture);
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    const boundary = createRefusingStore(fixture.store);
    const common = { code, condition: "History cannot be read.", remedy: { text: "Repair history and retry." } };
    boundary.refuse("history", StoreRefusalSchema.parse(code === "state-unresolvable"
      ? { ...common, class: "recoverable", historyRefs: [], reference: fixture.entry.reference }
      : { ...common, class: "terminal", namespace: "memory" }));
    const place = () => placeStoredConflict({ content: fixture.record.content, conflict: conflict.data,
      memo: createHistoryMemo(boundary.store) });
    expect(await place()).toBeNull();
    expect(boundary.calls("pull")).toBe(0);
    boundary.refuse("history", null);
    expect(await place()).toMatchObject({ current: ["stored"], incoming: ["incoming"] });
  });

  it.each(["", "\n"])("preserves incoming side line counts for %j", async incoming => {
    const fixture = await createStoredConflictFixture({ base: "base\n", current: "stored\n", incoming });
    fixtures.push(fixture);
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    const placed = await placeStoredConflict({ content: fixture.record.content, conflict: conflict.data, memo: fixture.context.memo });
    expect(placed?.incoming).toEqual(incoming === "" ? [] : [""]);
    const renderer = createMarkerRenderer([fixture.record.content]);
    if (placed === null) throw new Error("Placement missing");
    expect(renderer.renderLines({ current: { lines: placed.current, label: conflict.data.current.label },
      incoming: { lines: placed.incoming, label: conflict.data.incoming.label }, length: renderer.length }, { shows: "stored", conflict: conflict.reference }).join("\n"))
      .toContain(incoming === "" ? "=======\n>>>>>>>" : "=======\n\n>>>>>>>");
  });

  it("places a conflict based on absence without reading history", async () => {
    const fixture = await createStoredConflictFixture({ base: "base\n", current: "stored\n", incoming: "incoming\n" });
    fixtures.push(fixture);
    const merged = mergeLineText({ record: fixture.entry.reference, base: "", baseVersion: null, current: "stored\n", incoming: "incoming\n",
      currentLabel: { actor: "current", time: "2026-11-04T12:00:00Z" }, incomingLabel: { actor: "incoming", time: "2026-11-04T12:00:00Z" } });
    const conflict = merged.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    const boundary = createRefusingStore(fixture.store);
    expect(await placeStoredConflict({ content: merged.content, conflict, memo: createHistoryMemo(boundary.store) }))
      .toMatchObject({ start: 0, end: merged.content.length, current: ["stored"], incoming: ["incoming"] });
    expect(boundary.calls("history")).toBe(0);
  });

  it("places a deleted current side at the checked insertion point", async () => {
    const fixture = await createStoredConflictFixture({ base: "left\nbase\nright\n", current: "left\nright\n", incoming: "left\nincoming\nright\n" });
    fixtures.push(fixture);
    const conflict = fixture.conflicts[0];
    if (conflict === undefined) throw new Error("Conflict missing");
    expect(await placeStoredConflict({ content: fixture.record.content, conflict: conflict.data, memo: fixture.context.memo }))
      .toEqual({ start: 5, end: 5, current: [], incoming: ["incoming"] });
  });

});
