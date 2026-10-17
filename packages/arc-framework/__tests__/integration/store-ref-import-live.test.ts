/** Every live tracked record retains its content and shares its owner's imported identity. */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { splitEntryList } from "../../src/lib/store/concurrency/entries.js";
import { importFixture, IMPORT_DOCUMENTS, IMPORT_COHORT, IMPORT_INBOX } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

describe.each(["default", "separate"] as const)("live import in %s", (layout) => {
  it("keeps every work-unit kind on one owner ref under one UID", async () => {
    const h = await importFixture(layout);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports);
    const expected = new Map([
      ["work-item/meta", makeMetaFixture("alpha", { owner: "andrew", branch: "feat/alpha" })],
      ...IMPORT_DOCUMENTS.map(([kind, , content]) => [kind, content] as const),
      ["work-item/companion", "# Companion\n\nAdditional source.\n"],
    ]);
    const listed = success(await store.list({ family: "work-item" }));
    expect(listed.status).toBe("complete");
    if (listed.status !== "complete") throw new Error("Missing imported records");
    expect(listed.diagnostics).toEqual([]);
    expect(listed.records).toHaveLength(expected.size);
    expect(new Set(listed.records.map(({ reference }) => "uid" in reference.owner ? reference.owner.uid : undefined)).size).toBe(1);
    expect(new Set(listed.records.map(({ reference }) => expandStoredPath(reference).ref)).size).toBe(1);
    for (const record of listed.records) expect(record.content).toBe(expected.get(record.reference.kind));
  });

  it("lands the open cohort on its own cohort ref", async () => {
    const h = await importFixture(layout);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({
      kind: "cohort/document", owner: { type: "cohort", name: "group" },
    }) }));
    expect(record.content).toBe(IMPORT_COHORT);
    expect(record.reference.owner).toMatchObject({ type: "cohort", name: "group", uid: expect.any(String) });
    const home = expandStoredPath(record.reference);
    expect(home.ref).toMatch(/^refs\/arc\/cohort\/[0-9a-f-]{36}$/u);
  });

  it("stamps every project inbox entry while preserving an existing ID and all source prose", async () => {
    const h = await importFixture(layout);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({
      kind: "project-inbox/inbox", owner: { type: "project", name: "project" },
    }) }));
    const entries = splitEntryList(record.content, { shape: "heading", sections: ["Inbox"] }).parts.filter((part) => part.kind === "entry");
    expect(entries).toHaveLength(2);
    expect(entries.every(({ id }) => /^[0-9a-f]{8}$/u.test(id ?? ""))).toBe(true);
    expect(new Set(entries.map(({ id }) => id)).size).toBe(2);
    expect(entries[1]?.id).toBe("11111111");
    const strip = (content: string) => content.replace(/^- _Id:_ `[0-9a-f]{8}`\r?\n/gmu, "");
    expect(strip(record.content)).toBe(strip(IMPORT_INBOX));
  });

  it("stores canonical JSON rather than the source machine record's pretty form", async () => {
    const h = await importFixture(layout);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const record = success(await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({
      kind: "review/candidate", owner: { type: "work-item", name: "alpha" },
    }) }));
    const home = expandStoredPath(record.reference);
    const scope = layout === "separate" ? [`--git-dir=${join(h.root, ".git/arc/store")}`] : [];
    const bytes = (await h.git("git", [...scope, "show", `${home.ref}:${home.path}`])).stdout;
    expect(bytes).toBe(canonicalize(JSON.parse(record.content)));
    expect(bytes).not.toContain("\n");
  });
});
