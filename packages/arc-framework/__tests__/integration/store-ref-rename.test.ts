import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema, SlugSchema, canonicalize } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { makeGitExec } from "../helpers/integration.js";

describe("renames over state refs", () => {
  it("renames every projected path with only a metadata blob and reads old UID hints", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const note = await seed(f, RecordReferenceSchema.parse({ ...first.reference, kind: "work-item/companion", key: "notes-extra" }), "notes\n");
    const nested = await seed(f, RecordReferenceSchema.parse({ ...note.reference, key: "sub/notes.md" }), "nested\n");
    const uid = "uid" in first.reference.owner ? first.reference.owner.uid : undefined;
    const ref = `refs/arc/work/${uid}`, git = makeGitExec(f.root);
    const parent = (await git("git", ["rev-parse", ref])).stdout.trim();
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "renamed" } });
    const written = success(await f.store.write({ ...update(f, first, first.content), reference }));
    expect(written.reference).toEqual(reference);
    const paths = (await git("git", ["ls-tree", "-r", "--name-only", ref])).stdout;
    expect(paths).toContain("meta-renamed.md\n");
    expect(paths).toContain("notes-extra-renamed.md\n");
    expect(paths.split("\n")).toContain("sub/notes.md");
    expect(paths).not.toContain(`meta-${first.reference.owner.name}.md`);
    expect((await git("git", ["rev-parse", `${ref}^`])).stdout.trim()).toBe(parent);
    const newObjects = (await git("git", ["rev-list", "--objects", ref, `^${parent}`])).stdout.trim().split("\n");
    const blobs = await Promise.all(newObjects.map(async (row) => (await git("git", ["cat-file", "-t", row.split(" ")[0]!])).stdout.trim()));
    expect(blobs.filter((type) => type === "blob")).toHaveLength(1);
    const metadata = JSON.parse((await git("git", ["show", `${ref}:metadata-${uid}.json`])).stdout);
    expect(metadata).toMatchObject({ slug: "renamed", formerSlugs: [first.reference.owner.name] });
    for (const record of [first, note, nested]) {
      const read = success(await f.store.read({ reference: record.reference }));
      expect(read).toMatchObject({ content: record.content, reference: { owner: reference.owner } });
      if (record !== first) expect(read.version).toBe(record.version);
    }
    expect(success(await f.store.history({ reference })).map(({ reference: r, content }) => [r.owner.name, content]))
      .toEqual([["renamed", first.content], [first.reference.owner.name, first.content]]);
    expect(success(await f.store.history({ reference: note.reference })).map(({ version }) => version)).toEqual([note.version]);
  });
  it.each(["work-item/meta", "work-item/record", "cohort/document"] as const)("renames a completed %s without moving its retained ref", async (kind) => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference(kind));
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    success(await f.store.write({ ...update(f, first, first.content), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: first.reference }));
    const reference = RecordReferenceSchema.parse({ ...closed.reference, owner: { ...closed.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, closed, closed.content), reference }));
    const git = makeGitExec(f.root), archive = `refs/arc/archive/${quarter}`;
    const root = (await git("git", ["ls-tree", "--name-only", archive])).stdout;
    expect(root).toBe(kind === "cohort/document" ? "01a_cohort-renamed" : kind === "work-item/record" ? `renamed-${"uid" in first.reference.owner ? first.reference.owner.uid?.slice(0, 8) : ""}` : "01_renamed");
    expect(success(await f.store.read({ reference: first.reference }))).toMatchObject({ content: first.content, reference, placement: closed.placement });
    expect((await git("git", ["for-each-ref", "--format=%(refname)", kind === "cohort/document" ? "refs/arc/cohort/" : "refs/arc/work/"])).stdout).toBe("");
  });


  it.each(["work-item/meta", "work-item/record"] as const)("replaces %s while retaining UID, links, and history", async (source) => {
    const target = source === "work-item/meta" ? "work-item/record" : "work-item/meta";
    const check = async ({ reference, prior, next, writer, before, after }: import("../../src/lib/store/index.js").WriteCheckInput) => {
      if (writer.kind !== "verb" || !writer.verb.startsWith("role-")) return [];
      expect(success(await before.read({ reference })).reference.kind).toBe(source);
      expect(success(await after.read({ reference })).reference.kind).toBe(target);
      const old = reference.kind === source;
      const invalid = old ? prior === undefined || next !== undefined : prior !== undefined || next === undefined;
      return invalid || writer.verb === `role-deny-${old ? "old" : "new"}`
        ? [{ rule: old ? "roles.old" : "roles.new", condition: "Role check refuses", remedy: { text: "Use an admitted role transition" } }] : [];
    };
    const f = await createRefFixture({ "work-item/meta": { check }, "work-item/record": { check } });
    const initial = f.reference(source);
    const first = await seed(f, initial, canonicalize(JSON.parse(f.content(initial))), { kind: "active" },
      { branches: [{ repository: "repo", ref: "feat/source", linkedAs: "created", excluded: [] }] });
    const reference = RecordReferenceSchema.parse({ ...first.reference, kind: target });
    const put = mutationOf({ ...update(f, first, first.content), reference });
    if (put.action !== "put") throw new Error("Expected a primary replacement put");
    const remove = { action: "remove" as const, reference: first.reference, expected: first.version };
    const before = await f.settle();
    for (const writes of [[remove, { ...put, expected: null }], [{ ...put, expected: null }, remove]]) {
      expect(await f.store.batch({ writes, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
      expect(await f.settle()).toBe(before);
    }
    expect(await f.store.write({ ...put, expected: null, provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    for (const side of ["old", "new"]) {
      expect(await f.store.write({ ...put, provenance: { ...testProvenance, verb: `role-deny-${side}` } }))
        .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: `roles.${side}` } });
      expect(await f.settle()).toBe(before);
    }
    const result = success(await f.store.write({ ...put, provenance: { ...testProvenance, verb: "role-test" } }));
    const read = success(await f.store.read({ reference }));
    expect(read).toMatchObject({ content: first.content, reference, placement: first.placement, links: first.links, version: result.version });
    expect(success(await f.store.read({ reference: first.reference }))).toEqual(read);
    const uid = "uid" in first.reference.owner ? first.reference.owner.uid : undefined;
    const oldPath = source === "work-item/meta" ? `meta-${first.reference.owner.name}.md` : `errand-${uid}.json`;
    expect((await makeGitExec(f.root)("git", ["ls-tree", "--name-only", `refs/arc/work/${uid}`])).stdout.split("\n")).not.toContain(oldPath);
    const history = success(await f.store.history({ reference }));
    expect(history.map(({ reference: r, content }) => [r.kind, content])).toEqual([[target, first.content], [source, first.content]]);
    expect(success(await f.store.history({ reference: first.reference }))).toEqual(history);
    expect(await f.store.write({ ...put, expected: first.version, provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  });

  it.each([false, true])("refuses a root companion alias with named companion %s and admits re-keying", async (named) => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const alias = await seed(f, RecordReferenceSchema.parse({ ...first.reference, kind: "work-item/companion", key: "x-b.md" }), "alias");
    if (named) await seed(f, RecordReferenceSchema.parse({ ...alias.reference, key: "x" }), "named");
    const safe = await seed(f, RecordReferenceSchema.parse({ ...alias.reference, key: "x-c.md" }), "safe");
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "b" } });
    const before = await f.settle();
    expect(await f.store.write({ ...update(f, first, first.content), reference })).toMatchObject({ status: "refused", refusal: {
      code: "unsupported", case: "unhomed-kind", condition: expect.stringContaining("x-b.md"), remedy: { text: expect.stringMatching(/re-key/iu) },
    } });
    expect(await f.settle()).toBe(before);
    success(await f.store.batch({ writes: [mutationOf({ ...update(f, alias), reference: RecordReferenceSchema.parse({ ...alias.reference, key: "sub/x-b.md" }), expected: null }),
      { action: "remove", reference: alias.reference, expected: alias.version }], provenance: testProvenance }));
    success(await f.store.write({ ...update(f, first, first.content), reference }));
    expect(success(await f.store.read({ reference: safe.reference })).content).toBe(safe.content);
  });

  it.each(["work-item/meta", "cohort/document"] as const)("refuses another live %s slug and admits a UID repair", async (kind) => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const other = await seed(f, f.reference(kind, "other"));
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: other.reference.owner.name } });
    const before = await f.settle();
    const refused = await f.store.write({ ...update(f, first, first.content), reference });
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([reference, other.reference]) } });
    expect(await f.settle()).toBe(before);
    const renamedOther = RecordReferenceSchema.parse({ ...other.reference, owner: { ...other.reference.owner, name: "free" } });
    success(await f.store.write({ ...update(f, other, other.content), reference: renamedOther }));
    success(await f.store.write({ ...update(f, first, first.content), reference }));
    expect(success(await f.store.read({ reference: first.reference })).reference).toEqual(reference);
  });

  it("repairs a clash already stored by another machine using a UID", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const other = await seed(f, f.reference("work-item/meta", "other"));
    const uid = "uid" in other.reference.owner ? other.reference.owner.uid : undefined;
    const ref = `refs/arc/work/${uid}`, git = makeGitExec(f.root);
    const tip = (await git("git", ["rev-parse", ref])).stdout;
    const metadataPath = `metadata-${uid}.json`;
    const metadata = JSON.parse((await git("git", ["show", `${ref}:${metadataPath}`])).stdout);
    await plantRef(f.root, ref, [{ path: metadataPath, content: canonicalize({ ...metadata, slug: first.reference.owner.name }) },
      { path: `meta-${first.reference.owner.name}.md`, content: other.content }], { parents: [tip] });
    const clashing = success(await f.store.read({ reference: other.reference }));
    const reference = RecordReferenceSchema.parse({ ...clashing.reference, owner: { ...clashing.reference.owner, name: "repaired" } });
    success(await f.store.write({ ...update(f, clashing, clashing.content), reference }));
    expect(success(await f.store.lookup({ kind: "slug", slug: first.reference.owner.name })).reference).toEqual(first.reference);
    expect(success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("repaired") })).reference).toEqual(reference);
  });

  it("updates retained lineage owner metadata in the same rename batch", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const lineage = await seed(f, RecordReferenceSchema.parse({ kind: "lineage/transition", owner: first.reference.owner }));
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "renamed" } });
    const result = success(await f.store.write({ ...update(f, first, first.content), reference }));
    const current = success(await f.store.read({ reference: lineage.reference }));
    expect(current.reference.owner).toEqual(reference.owner);
    expect(current.version).toBe(lineage.version);
    const uid = "uid" in first.reference.owner ? first.reference.owner.uid : undefined;
    const git = makeGitExec(f.root);
    const messages = await Promise.all([`refs/arc/work/${uid}`, "refs/arc/project/registry"].map(async (ref) => (await git("git", ["show", "-s", "--format=%B", ref])).stdout));
    expect(messages.every((message) => message.includes(result.reference.owner.name))).toBe(true);
    const batches = messages.map((message) => /Arc-Batch: (.+)/u.exec(message)?.[1]);
    expect(batches[0]).toBeTruthy();
    expect(batches[1]).toBe(batches[0]);
  });

  it("bounds the new slug and keeps a maximum combined companion name usable", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const note = await seed(f, RecordReferenceSchema.parse({ ...first.reference, kind: "work-item/companion", key: "x".repeat(2040) }), "notes");
    const tooLong = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "a".repeat(2041) } });
    const before = await f.settle();
    expect(await f.store.write({ ...update(f, first, first.content), reference: tooLong })).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.git-path" } });
    expect(await f.settle()).toBe(before);
    const reference = RecordReferenceSchema.parse({ ...tooLong, owner: { ...tooLong.owner, name: "a".repeat(2040) } });
    success(await f.store.write({ ...update(f, first, first.content), reference }));
    let processes = 0;
    const counted = createRefStore({ ...f.ports, rawExec: async (...args) => { processes++; return f.ports.rawExec(...args); } });
    expect(success(await counted.read({ reference: note.reference })).content).toBe(note.content);
    expect(processes).toBe(2);
    const uid = "uid" in first.reference.owner ? first.reference.owner.uid : undefined;
    expect((await makeGitExec(f.root)("git", ["ls-tree", "--name-only", `refs/arc/work/${uid}`])).stdout)
      .toContain(`${"x".repeat(2040)}-${reference.owner.name}.md`);
  });
  it("follows a primary and its companion through two renames and a role replacement", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"), canonicalize(JSON.parse(f.content(f.reference("work-item/meta")))));
    const note = await seed(f, RecordReferenceSchema.parse({ ...first.reference, kind: "work-item/companion", key: "notes-extra" }), "notes");
    const middle = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "middle" } });
    success(await f.store.write({ ...update(f, first, first.content), reference: middle }));
    const renamed = success(await f.store.read({ reference: middle }));
    const reference = RecordReferenceSchema.parse({ ...middle, kind: "work-item/record", owner: { ...middle.owner, name: "newest" } });
    success(await f.store.write({ ...update(f, renamed, renamed.content), reference }));
    const history = success(await f.store.history({ reference: first.reference }));
    expect(history.map(({ reference: r, content }) => [r.owner.name, r.kind, content])).toEqual([
      ["newest", "work-item/record", first.content], ["middle", "work-item/meta", first.content],
      [first.reference.owner.name, "work-item/meta", first.content],
    ]);
    expect(success(await f.store.history({ reference: note.reference }))).toHaveLength(1);
    expect(success(await f.store.read({ reference: note.reference }))).toMatchObject({ content: note.content, version: note.version, reference: { owner: reference.owner } });
  });

  it("retries when metadata changed between the UID tip and metadata capture", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "newest" } });
    let interleaved = false;
    const store = createRefStore({ ...f.ports, rawExec: async (args, options) => {
      if (interleaved || args[0] !== "cat-file" || !(options?.input instanceof Uint8Array)) return f.ports.rawExec(args, options);
      const queries = new TextDecoder().decode(options.input).trimEnd().split("\n");
      if (queries.length !== 2 || !queries[0]?.startsWith("refs/arc/work/")) return f.ports.rawExec(args, options);
      interleaved = true;
      const tip = await f.ports.rawExec(args, { ...options, input: Buffer.from(`${queries[0]}\n`) });
      success(await f.store.write({ ...update(f, first, first.content), reference }));
      const metadata = await f.ports.rawExec(args, { ...options, input: Buffer.from(`${queries[1]}\n`) });
      return { ...tip, stdout: Buffer.concat([tip.stdout, metadata.stdout]) };
    } });
    expect(success(await store.read({ reference: first.reference }))).toMatchObject({ reference, content: first.content });
    expect(interleaved).toBe(true);
  });

  it.each([false, true])("uses the current UID name for a verbatim key after closing %s", async (closed) => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    await seed(f, RecordReferenceSchema.parse({ ...first.reference, kind: "work-item/companion", key: "x" }), "older named record");
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, first, first.content), reference }));
    const key = `x-${first.reference.owner.name}.md`;
    const literal = await seed(f, RecordReferenceSchema.parse({ ...reference, kind: "work-item/companion", key }), "new literal record");
    const hint = RecordReferenceSchema.parse({ ...literal.reference, owner: first.reference.owner });
    if (closed) {
      const current = success(await f.store.read({ reference }));
      success(await f.store.write({ ...update(f, current, current.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    }
    expect(success(await f.store.read({ reference: hint }))).toMatchObject({ reference: literal.reference, content: literal.content, version: literal.version });
    expect(success(await f.store.history({ reference: hint })).map(({ content }) => content)).toEqual([literal.content]);
  });

  it("reserves undecodable stored paths during rename and admits forward repair", async () => {
    const f = await createRefFixture();
    const first = await seed(f, f.reference("work-item/meta"));
    const uid = "uid" in first.reference.owner ? first.reference.owner.uid : undefined;
    const ref = `refs/arc/work/${uid}`, git = makeGitExec(f.root), metadataPath = `metadata-${uid}.json`;
    const metadata = (await git("git", ["show", `${ref}:${metadataPath}`])).stdout;
    const entries = [{ path: metadataPath, content: metadata }, { path: `meta-${first.reference.owner.name}.md`, content: first.content }];
    const parent = (await git("git", ["rev-parse", ref])).stdout;
    const corrupt = await plantRef(f.root, ref, [...entries, { path: "meta-renamed.md", content: "Foreign bytes" }], { parents: [parent] });
    const reference = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "renamed" } });
    expect(await f.store.write({ ...update(f, first, first.content), reference })).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
    expect((await git("git", ["rev-parse", ref])).stdout).toBe(corrupt.tip);
    await plantRef(f.root, ref, entries, { parents: [corrupt.tip] });
    success(await f.store.write({ ...update(f, first, first.content), reference }));
    expect(success(await f.store.read({ reference: first.reference })).reference).toEqual(reference);
  });

});
