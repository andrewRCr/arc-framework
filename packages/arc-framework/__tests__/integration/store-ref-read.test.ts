import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { ConflictRecordSchema } from "../../src/lib/store/conflict.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { plantRef } from "../helpers/store/ref-plant.js";

import { createRefReadFixture as fixture } from "../helpers/store/ref-read.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const owner = { type: "work-item", name: "alpha", uid } as const;
const ref = `refs/arc/work/${uid}`;
const reference = RecordReferenceSchema.parse({ owner, kind: "work-item/companion", key: "extra" });
const metadata = canonicalize({ formatVersion: 1, slug: "alpha", formats: {},
  primary: { role: "work-item/meta", placement: { kind: "active" } } });

describe.each(["files", "reftable"] as const)("ref store read pipeline (%s)", (format) => {
  it("reads and lists a planted record under its metadata owner in two and four processes", async () => {
    const f = await fixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata },
      { path: "extra-alpha.md", content: "# A planted companion\n" }]);
    await f.store.version();
    const before = f.processes();
    const read = await f.store.read({ reference });
    expect(read).toMatchObject({ status: "ok", result: { reference, content: "# A planted companion\n",
      placement: { kind: "active" }, formatVersion: 1, conflicts: [], version: expect.stringMatching(/^sha256:/u) } });
    expect(f.processes() - before).toBe(2);
    const listing = await f.store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", records: [read.status === "ok" ? read.result : null],
      diagnostics: [], missed: false } });
    expect(f.processes() - before).toBe(6);
  });
  it("splits overflowing blob batches and still lists every record", async () => {
    const f = await fixture(format, 4096);
    const entries = Array.from({ length: 8 }, (_, index) => ({ path: `extra-${index}-alpha.md`, content: `${index}${"x".repeat(1500)}` }));
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata }, ...entries]);
    const listing = await f.store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", records: expect.arrayContaining(
      entries.map((entry) => expect.objectContaining({ content: entry.content }))), diagnostics: [], missed: false } });
    if (listing.status !== "ok" || listing.result.status !== "complete") throw new Error("No complete listing");
    expect(listing.result.records).toHaveLength(8);
    expect(f.processes()).toBeGreaterThan(4);
  });
  it("lists two records even when their content shares one Git blob", async () => {
    const f = await fixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata },
      { path: "first-alpha.md", content: "shared" }, { path: "second-alpha.md", content: "shared" }]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: {
      status: "complete", records: [expect.objectContaining({ reference: expect.objectContaining({ key: "first" }) }),
        expect.objectContaining({ reference: expect.objectContaining({ key: "second" }) })], diagnostics: [], missed: false,
    } });
  });
  it("preserves non-ASCII and quote bytes in valid path keys", async () => {
    const f = await fixture(format);
    const path = 'sub/café "a.svg';
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata }, { path, content: "image" }]);
    expect(await f.store.list({ family: "work-item" })).toMatchObject({ status: "ok", result: { status: "complete",
      records: [expect.objectContaining({ reference: expect.objectContaining({ key: path }), content: "image" })], diagnostics: [] } });
  });
  it.each(["work-item", "personal"] as const)("reports a %s backslash path exactly beside valid records", async (family) => {
    const f = await fixture(format);
    const personal = family === "personal";
    const target = personal ? "refs/arc/user/andrew/personal" : ref;
    const metadataPath = personal ? "andrew/metadata-andrew.json" : `metadata-${uid}.json`;
    const badPath = personal ? 'andrew/bad\\name.txt' : 'sub/bad\\name.svg';
    const goodPath = personal ? 'andrew/café "note.txt' : "extra-alpha.md";
    await plantRef(f.root, target, [
      { path: metadataPath, content: personal ? canonicalize({ formatVersion: 1, formats: {} }) : metadata },
      { path: goodPath, content: "kept" }, { path: badPath, content: "invalid key" },
    ]);
    const listing = await f.store.list({ family });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", records: [expect.objectContaining({ content: "kept" })],
      diagnostics: [expect.objectContaining({ kind: "malformed", key: badPath })], missed: true } });
  });
  it("resolves a slug-only owner once and returns its UID", async () => {
    const f = await fixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata }, { path: "extra-alpha.md", content: "found" }]);
    await f.store.version();
    const before = f.processes();
    const unresolved = RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name: "alpha" } });
    expect(await f.store.read({ reference: unresolved })).toMatchObject({ status: "ok", result: { reference, content: "found" } });
    expect(f.processes() - before).toBe(6);
  });
  it("refuses person-owned reads without an identity and names arc.identity", async () => {
    const f = await fixture(format);
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "note.txt" });
    await plantRef(f.root, "refs/arc/user/andrew/personal", [
      { path: "andrew/metadata-andrew.json", content: canonicalize({ formatVersion: 1, formats: {} }) },
      { path: "andrew/note.txt", content: "personal" },
    ]);
    const store = createRefStore({ ...f.ports, identity: async () => null });
    expect(await store.read({ reference: personal })).toMatchObject({ status: "refused", refusal: {
      code: "not-found", reference: personal, condition: expect.stringContaining("arc.identity"),
    } });
    expect(f.processes()).toBe(0);
    expect(await f.store.read({ reference: personal })).toMatchObject({ status: "ok", result: { content: "personal" } });
    expect(f.processes()).toBe(2);
  });
  it.each(["personal", "claims"] as const)("leaves %s absent with a state token when identity is absent", async (family) => {
    const f = await fixture(format);
    const store = createRefStore({ ...f.ports, identity: async () => null });
    expect(await store.list({ family })).toMatchObject({ status: "ok", result: { status: "absent", asOf: expect.any(String) } });
    expect(f.processes()).toBe(3);
  });
  it("reads local state under a shell-shaped SSH command without rewriting it", async () => {
    const f = await fixture(format);
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata }, { path: "extra-alpha.md", content: "local" }]);
    const previous = process.env.GIT_SSH_COMMAND;
    process.env.GIT_SSH_COMMAND = "ssh -i ~/.ssh/unused-key";
    try {
      expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "local" } });
      expect(f.processes()).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.GIT_SSH_COMMAND;
      else process.env.GIT_SSH_COMMAND = previous;
    }
  });
  it("reads open conflicts in one extra batch and lists them from its existing blob batch", async () => {
    const f = await fixture(format);
    const conflictReference = RecordReferenceSchema.parse({ owner, kind: "work-item/conflict-record", key: "deadbeef" });
    const label = { actor: "andrew@clone", time: "2026-10-16T00:00:00.000Z" };
    const conflict = canonicalize(ConflictRecordSchema.parse({ record: reference, location: { kind: "hunk", start: 0, end: 1 }, base: "base",
      current: { content: "ours", label }, incoming: { content: "theirs", label },
      baseVersion: null, currentLines: 1, incomingLines: 1 }));
    await plantRef(f.root, ref, [{ path: `metadata-${uid}.json`, content: metadata },
      { path: "extra-alpha.md", content: "ours" }, { path: "conflicts/deadbeef.json", content: conflict }]);
    await f.store.version();
    const before = f.processes();
    expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { content: "ours", conflicts: [conflictReference] } });
    expect(f.processes() - before).toBe(3);
    const listing = await f.store.list({ family: "work-item" });
    expect(listing).toMatchObject({ status: "ok", result: { status: "complete", records: expect.arrayContaining([
      expect.objectContaining({ reference, conflicts: [conflictReference] }),
      expect.objectContaining({ reference: conflictReference, conflicts: [] }),
    ]), diagnostics: [], missed: false } });
    expect(f.processes() - before).toBe(7);
    expect(await f.store.list({ family: "work-item", kind: "work-item/companion" })).toMatchObject({ status: "ok",
      result: { status: "complete", records: [expect.objectContaining({ reference, conflicts: [conflictReference] })] } });
    expect(f.processes() - before).toBe(11);
  });
});
