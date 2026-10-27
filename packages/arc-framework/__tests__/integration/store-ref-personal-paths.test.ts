/** Stored personal spelling remains separate from logical keys and public operations. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type KindId } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const provenance = { verb: "user", lifecycleAction: "save" };
const person = { type: "person", name: "andrew" } as const;
const personalRef = "refs/arc/user/andrew/personal";
const reference = (kind: KindId, key?: string) => RecordReferenceSchema.parse({ kind, owner: person, ...(key === undefined ? {} : { key }) });
const document = (key: string) => reference("personal/document", key);
const content = [
  { reference: reference("personal/inbox"), content: "# User Inbox\r\n\r\n## Errand\r\n\r\n## Work Unit\r\n", path: "USER-INBOX.md.andrew" },
  { reference: reference("personal/working-memory"), content: "# Working Memory\n\n## Memories\n", path: "WORKING-MEMORY.md.andrew" },
  { reference: document("scratch/持ち物 'quoted'.md"), content: "Personal bytes.\r\n", path: "scratch/持ち物 'quoted'.md.andrew" },
  { reference: reference("personal/errand-queue"), content: "# Errand Queue\n", path: "errand-queue-andrew.md.andrew" },
  { reference: reference("personal/session-context", "work"), content: "# Session Notes\n\nKeep this context.\n", path: "work/SESSION-NOTES.md.andrew" },
];
const put = (value: ReturnType<typeof document>) => ({ action: "put" as const, reference: value, content: "New bytes.\n", expected: null });

describe.each(["default", "separate"] as const)("personal storage spelling (%s)", layout => {
  it.each(["write", "batch"] as const)("refuses a companion below its implicit metadata during %s and permits a valid key", async mode => {
    const h = await refSyncFixture(layout), store = h.a.store;
    const made = success(await store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "companion-owner" } }),
      content: makeMetaFixture("companion-owner"), placement: { kind: "active" }, provenance }));
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected allocated companion owner");
    const companion = (key: string) => RecordReferenceSchema.parse({ kind: "work-item/companion", owner, key });
    const invalid = put(companion(`metadata-${owner.uid}.json/child.md`)), sentinel = put(document("scratch/sentinel.md"));
    const before = success(await store.version());
    const result = mode === "write" ? await store.write({ ...invalid, provenance })
      : await store.batch({ writes: [invalid, sentinel], provenance });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
    expect(success(await store.version())).toBe(before);
    expect(await store.read({ reference: sentinel.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await store.write({ ...put(companion("scratch/child.md")), provenance }));
    expect(success(await store.read({ reference: companion("scratch/child.md") })).content).toBe("New bytes.\n");
  });

  it.each(["write", "batch"] as const)("refuses an implicit metadata directory on the first %s and permits repair", async mode => {
    const h = await refSyncFixture(layout), store = h.a.store;
    const before = success(await store.version());
    const invalid = put(document("metadata-andrew.json/child.md")), sentinel = put(document("scratch/sentinel.md"));
    const result = mode === "write" ? await store.write({ ...invalid, provenance })
      : await store.batch({ writes: [invalid, sentinel], provenance });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
    expect(success(await store.version())).toBe(before);
    expect(await store.read({ reference: sentinel.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await store.write({ ...put(document("scratch/metadata-child.md")), provenance }));
    expect(success(await store.read({ reference: document("scratch/metadata-child.md") })).content).toBe("New bytes.\n");
  });

  it("keeps exact suffixed tree names and original logical keys through read, list, history, changes, and publication", async () => {
    const h = await refSyncFixture(layout), store = h.a.store;
    const before = success(await store.version());
    success(await store.batch({ writes: content.map(({ reference, content }) => ({ action: "put", reference, content, expected: null })), provenance }));
    const paths = (await h.a.git(["ls-tree", "-rz", "--name-only", personalRef])).stdout.split("\0").filter(Boolean).sort();
    expect(paths).toEqual(["andrew/metadata-andrew.json", ...content.map(({ path }) => `andrew/${path}`)].sort());
    const listed = success(await store.list({ family: "personal" }));
    expect(listed.status).toBe("complete");
    if (listed.status !== "complete") throw new Error("Personal listing is incomplete");
    expect(listed.diagnostics).toEqual([]);
    expect(listed.records).toHaveLength(content.length);
    const changes = success(await store.changes({ from: before, to: success(await store.version()) }));
    expect(changes).toHaveLength(content.length);
    for (const item of content) {
      expect(success(await store.read({ reference: item.reference }))).toMatchObject({ reference: item.reference, content: item.content, conflicts: [] });
      expect(listed.records).toContainEqual(expect.objectContaining({ reference: item.reference, content: item.content }));
      expect(changes).toContainEqual(expect.objectContaining({ reference: item.reference, content: item.content }));
      expect(success(await store.history({ reference: item.reference }))).toEqual([expect.objectContaining({ reference: item.reference, content: item.content })]);
    }
    const pushed = success(await store.push());
    expect(pushed.states).toEqual([]);
    expect(pushed.publishes.length).toBeGreaterThan(0);
    expect(pushed.publishes.every(result => ["pushed", "reconciled", "noop"].includes(result.status))).toBe(true);
    const pulled = success(await h.b.store.pull());
    expect(pulled.states).toEqual([]);
    expect(pulled.pulls.length).toBeGreaterThan(0);
    expect(pulled.pulls.every(result => result.status !== "failed" && result.notices.length === 0)).toBe(true);
    for (const item of content) expect(success(await h.b.store.read({ reference: item.reference }))).toMatchObject({ reference: item.reference, content: item.content });
  }, 60_000);

  it("refuses logical aliases and file/folder collisions atomically and permits corrected keys", async () => {
    const h = await refSyncFixture(layout), store = h.a.store;
    const before = success(await store.version());
    const sentinel = document("scratch/companion.md");
    for (const key of ["USER-INBOX.md", "WORKING-MEMORY.md", "errand-queue-andrew.md", "work/SESSION-NOTES.md", "metadata-andrew.json"]) {
      expect(await store.batch({ writes: [put(document(key)), put(sentinel)], provenance })).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
      expect(success(await store.version())).toBe(before);
    }
    const pairs = [[put(document("scratch/item")), put(document("scratch/item/child.md"))],
      [put(document("scratch/item")), put(document("scratch/item.andrew/child.md"))],
      [put(document("work")), { ...put(reference("personal/session-context", "work")), content: "# Session Notes\n" }]];
    for (const writes of pairs) for (const batch of [writes, [...writes].reverse()]) {
      expect(await store.batch({ writes: [...batch, put(sentinel)], provenance })).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
      expect(success(await store.version())).toBe(before);
    }
    success(await store.batch({ writes: [put(document("scratch/item")), put(document("scratch/other/child.md")), put(sentinel)], provenance }));
    const held = success(await store.version());
    expect(await store.write({ ...put(document("scratch/item/later.md")), provenance })).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
    expect(success(await store.version())).toBe(held);
    success(await store.write({ ...put(document("scratch/other/later.md")), provenance }));
    expect(success(await store.read({ reference: document("scratch/other/later.md") })).content).toBe("New bytes.\n");
  }, 60_000);
});
