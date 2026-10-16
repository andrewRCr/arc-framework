/** stale-base merging, conflict preservation and explicit resolution. */

import { expect } from "vitest";
import { ConflictRecordSchema, KIND_REGISTRY, type RecordVersion } from "../../../src/lib/store/index.js";
import { everyKind, seed, success, update, type SuiteContext } from "./suite-tools.js";

function entryStart(content: string): number {
  const heading = content.indexOf("### ");
  return heading >= 0 ? heading : content.indexOf("**First:**");
}

function appendEntry(content: string, id: string, title: string): string {
  return content + "\n" + content.slice(entryStart(content)).replace(/11111111/gu, id).replace(/First/gu, title).replace(/first/gu, title.toLowerCase());
}

/** Register stale bases through each kind's actual merge mechanism.
 * @param context - item 3 context.
 */
export function registerMergeAssertions(context: SuiteContext): void {
  mergingKind(context, "stale-base-clash-conflict-record", async (fixture, reference) => {
    const base = await seed(fixture, reference);
    const marker = KIND_REGISTRY[reference.kind].merge === "entry" ? "\nfirst" : "\nbase";
    const current = base.content.replace(marker, "\ncurrent");
    const incoming = base.content.replace(marker, "\nincoming");
    success(await fixture.store.write(update(fixture, base, current)));
    const merged = success(await fixture.store.write({ ...update(fixture, base, incoming), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(merged.conflicts).toHaveLength(1);
    const conflict = merged.conflicts[0]!;
    expect(success(await fixture.store.history({ reference: conflict }))[0]).toMatchObject({ provenance: { verb: "merge" } });
    const read = success(await fixture.store.read({ reference: base.reference }));
    expect(read.content).toBe(current);
    success(await fixture.store.write({ ...update(fixture, read, read.content), resolves: [conflict] }));
    expect(success(await fixture.store.read({ reference: base.reference })).conflicts).toEqual([]);
    expect(await fixture.store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, (kind) => KIND_REGISTRY[kind].merge !== "single-writer");
  const parsed = { ...context, registration: { ...context.registration,
    create: () => context.registration.create({ "personal/document": { parser: (content: string) =>
      content.includes("current opening") && content.includes("incoming closing")
        ? { success: false, error: "Combined edit is invalid." } : { success: true, data: { content } } } }),
  } };
  mergingKind(parsed, "stale-merge-parser-refusal", async (fixture, reference) => {
    const base = await seed(fixture, reference);
    success(await fixture.store.write(update(fixture, base, "current opening\nbase\nclosing\n")));
    const current = success(await fixture.store.read({ reference: base.reference }));
    const before = await fixture.settle();
    expect(await fixture.store.write(update(fixture, base, "opening\nbase\nincoming closing\n")))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "Combined edit is invalid." } });
    expect(await fixture.settle()).toBe(before);
    expect(success(await fixture.store.read({ reference: base.reference }))).toEqual(current);
    success(await fixture.store.write(update(fixture, current, "repaired\n")));
    expect(success(await fixture.store.read({ reference: base.reference })).content).toBe("repaired\n");
  }, (kind) => kind === "personal/document");
  for (const stale of [false, true]) mergingKind(context, `entry-id-repeat:${stale ? "stale" : "current"}`, async (fixture, reference) => {
    const base = await seed(fixture, reference);
    if (stale) success(await fixture.store.write(update(fixture, base)));
    const before = await fixture.settle();
    const current = success(await fixture.store.read({ reference: base.reference }));
    expect(await fixture.store.write(update(fixture, base, appendEntry(base.content, "11111111", "Repeated"))))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: expect.stringContaining("11111111") } });
    expect(await fixture.settle()).toBe(before);
    expect(success(await fixture.store.read({ reference: base.reference }))).toEqual(current);
    success(await fixture.store.write(update(fixture, current)));
  }, (kind) => KIND_REGISTRY[kind].merge === "entry");
  mergingKind(context, "disjoint-entry-insertions", async (fixture, reference) => {
    const base = await seed(fixture, reference);
    const current = appendEntry(base.content, "22222222", "Second");
    const incoming = appendEntry(base.content, "33333333", "Third");
    success(await fixture.store.write(update(fixture, base, current)));
    const merged = success(await fixture.store.write(update(fixture, base, incoming)));
    const read = success(await fixture.store.read({ reference: base.reference }));
    expect(read.version).toBe(merged.version);
    for (const title of ["First", "Second", "Third"]) expect(read.content).toContain(title);
    expect(merged.conflicts).toEqual([]);
  }, (kind) => KIND_REGISTRY[kind].merge === "entry");
  mergingKind(context, "same-entry-current-and-stored-labelled-conflict", async (fixture, reference) => {
    const base = await seed(fixture, reference);
    const current = base.content.replace("\nfirst", "\ncurrent");
    const incoming = base.content.replace("\nfirst", "\nincoming");
    success(await fixture.store.write(update(fixture, base, current)));
    const result = success(await fixture.store.write(update(fixture, base, incoming)));
    expect(result.conflicts).toHaveLength(1);
    const read = success(await fixture.store.read({ reference: base.reference }));
    expect(read.content).toBe(current);
    expect(read.conflicts).toEqual(result.conflicts);
    const conflict = success(await fixture.store.read({ reference: result.conflicts[0]! }));
    const fields = ConflictRecordSchema.parse(JSON.parse(conflict.content));
    expect(fields).toMatchObject({ record: base.reference, location: { kind: "entry", id: "11111111" },
      base: expect.stringContaining("first"), current: { content: expect.stringContaining("current"), label: { actor: expect.any(String), time: expect.any(String) } },
      incoming: { content: expect.stringContaining("incoming"), label: { actor: expect.any(String), time: expect.any(String) } } });
    success(await fixture.store.write(update(fixture, read, current)));
    const stillOpen = success(await fixture.store.read({ reference: base.reference }));
    expect(stillOpen.conflicts).toEqual(result.conflicts);
    success(await fixture.store.write({ ...update(fixture, stillOpen, current), resolves: result.conflicts }));
    expect(success(await fixture.store.read({ reference: base.reference })).conflicts).toEqual([]);
    expect(await fixture.store.read({ reference: result.conflicts[0]! })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, (kind) => KIND_REGISTRY[kind].merge === "entry");
  for (const order of ["edit-first", "remove-first"] as const) mergingKind(context, `observed-remove-${order}`, async (fixture, reference) => {
    const base = await seed(fixture, reference);
    const edited = base.content.replace("\nfirst", "\nedited");
    const removed = base.content.slice(0, entryStart(base.content));
    const contents = order === "edit-first" ? [edited, removed] : [removed, edited];
    success(await fixture.store.write(update(fixture, base, contents[0]!)));
    const result = success(await fixture.store.write(update(fixture, base, contents[1]!)));
    expect(result.conflicts).toEqual([]);
    expect(success(await fixture.store.read({ reference: base.reference })).content).toContain("edited");
  }, (kind) => KIND_REGISTRY[kind].merge === "entry");
  everyKind(context, "first-persist-stamps-handwritten-entry", async (fixture, reference) => {
    const handWritten = fixture.content(reference).replace(/^.*_Id:_.*\n/gmu, "");
    const record = await seed(fixture, reference, handWritten);
    expect(record.content).toMatch(/_Id:_ `([0-9a-f]{8})`/u);
    expect(record.content.replace(/^.*_Id:_.*\n/gmu, "")).toBe(handWritten);
  }, (kind) => KIND_REGISTRY[kind].merge === "entry");
  mergingKind(context, "disjoint-prose-lines", async (fixture, reference) => {
    const base = await seed(fixture, reference);
    success(await fixture.store.write(update(fixture, base, "current opening\nbase\nclosing\n")));
    const result = success(await fixture.store.write(update(fixture, base, "opening\nbase\nincoming closing\n")));
    expect(result.conflicts).toEqual([]);
    expect(success(await fixture.store.read({ reference: base.reference })).content).toBe("current opening\nbase\nincoming closing\n");
  }, (kind) => KIND_REGISTRY[kind].merge === "line");
  mergingKind(context, "conflicting-prose-keeps-current-hunk", async (fixture, reference) => {
    const base = await seed(fixture, reference);
    const current = "opening\ncurrent\nclosing\n";
    success(await fixture.store.write(update(fixture, base, current)));
    const result = success(await fixture.store.write(update(fixture, base, "opening\nincoming\nclosing\n")));
    expect(result.conflicts).toHaveLength(1);
    const read = success(await fixture.store.read({ reference: base.reference }));
    expect(read.content).toBe(current);
    expect(read.conflicts).toEqual(result.conflicts);
    const conflict = success(await fixture.store.read({ reference: result.conflicts[0]! }));
    expect(ConflictRecordSchema.parse(JSON.parse(conflict.content))).toMatchObject({ record: base.reference,
      location: { kind: "hunk", start: 1, end: 2 }, base: "base", baseVersion: base.version,
      currentLines: 1, incomingLines: 1, current: { content: "current" }, incoming: { content: "incoming" } });
  }, (kind) => KIND_REGISTRY[kind].merge === "line");
  for (const side of ["current", "incoming"] as const) for (const [content, count] of [["", 0], ["\n", 1]] as const) {
    mergingKind(context, `hunk-side-line-count:${side}:${count}`, async (fixture, reference) => {
      const base = await seed(fixture, reference, "base\n");
      const current = side === "current" ? content : "edited\n";
      const incoming = side === "incoming" ? content : "edited\n";
      success(await fixture.store.write(update(fixture, base, current)));
      const result = success(await fixture.store.write(update(fixture, base, incoming)));
      expect(result.conflicts).toHaveLength(1);
      const conflict = success(await fixture.store.read({ reference: result.conflicts[0]! }));
      expect(ConflictRecordSchema.parse(JSON.parse(conflict.content)))
        .toMatchObject({ baseVersion: base.version, [side]: { content: "" }, [`${side}Lines`]: count });
    }, (kind) => KIND_REGISTRY[kind].merge === "line");
  }
  for (const absentBase of [false, true]) mergingKind(context, `pull-hunk-base-version:${absentBase ? "absent" : "shared"}`, async (fixture, reference) => {
    const remote = fixture.remote(true);
    if (remote === undefined) throw new Error("The merging fixture requires its independent remote");
    let expected: RecordVersion | null = null;
    if (absentBase) {
      await seed(fixture, reference, "local\n");
      success(await remote.write({ action: "put", reference, expected: null, content: "remote\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    } else {
      const base = await seed(fixture, reference, "base\n");
      expected = base.version;
      success(await fixture.store.push());
      success(await fixture.store.write(update(fixture, base, "local\n")));
      success(await remote.write(update(fixture, base, "remote\n")));
    }
    success(await fixture.store.pull());
    const read = success(await fixture.store.read({ reference }));
    expect(read.conflicts).toHaveLength(1);
    const conflict = success(await fixture.store.read({ reference: read.conflicts[0]! }));
    expect(ConflictRecordSchema.parse(JSON.parse(conflict.content)))
      .toMatchObject({ baseVersion: expected, currentLines: 1, incomingLines: 1 });
  }, (kind) => kind === "personal/document");
}

function mergingKind(context: SuiteContext, name: string, test: Parameters<typeof everyKind>[2], select: Parameters<typeof everyKind>[3]): void {
  const reason = context.registration.declarations.mergesConcurrentWrites ? undefined
    : "This backend never merges stale content bases; callers re-read and re-apply under its write lock.";
  everyKind(context, name, test, select, reason);
}
