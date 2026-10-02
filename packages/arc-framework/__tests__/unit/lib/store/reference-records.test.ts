/** Initial observable record behaviors before their shared conformance registration. */

import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { ConflictRecordSchema, LookupInputSchema, RecordReferenceSchema, type StoreResult } from "../../../../src/lib/store/index.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";
import { splitEntryList } from "../../../../src/lib/store/concurrency/entries.js";

describe("reference record landing", () => {
  it.each([false, true])("persists a managed edit after section deletion, removal current: %s", async (removalCurrent) => {
    const fixture = createReferenceFixture();
    const reference = fixture.reference("personal/inbox");
    const entry = (body:string)=>`### [ ] **First**\n\n- _Id:_ \`11111111\`\n\n${body}\n\n`;
    const base = await seed(fixture,reference,`# Inbox\n\n## Errand\n\n${entry("base")}## Work Unit\n\nFooter\n`);
    const removed = "# Inbox\n\n## Work Unit\n\nFooter\n";
    const edited = base.content.replace("base\n","edited\n");
    success(await fixture.store.write(update(fixture,base,removalCurrent ? removed : edited)));
    const landed = success(await fixture.store.write(update(fixture,base,removalCurrent ? edited : removed)));
    const saved = success(await fixture.reopen().read({reference}));
    expect(saved.version).toBe(landed.version);
    expect(splitEntryList(saved.content,{shape:"heading",sections:["Errand","Work Unit"]}).parts.filter((part)=>part.kind === "entry"))
      .toMatchObject([{id:"11111111",section:"Errand",bytes:entry("edited").trimEnd()}]);
    expect(saved.conflicts).toEqual([]);
  });

  it.each([[false, false], [true, false], [false, true]])("persists both sections of a move-versus-edit conflict, move current: %s, extra spacing: %s", async (moveCurrent, extraSpacing) => {
    const fixture = createReferenceFixture();
    const entry = (body: string) => `### [ ] **First**\n\n- _Id:_ \`11111111\`\n\n${body}\n\n`;
    const document = (section: string, body: string) => `# Inbox\n\n## Errand\n\n${section === "Errand" ? entry(body) : ""}${extraSpacing ? "\n" : ""}## Work Unit\n\n${section === "Work Unit" ? entry(body) : ""}`;
    const base = await seed(fixture, fixture.reference("personal/inbox"), document("Errand", "base"));
    const currentSection = moveCurrent ? "Work Unit" : "Errand";
    const incomingSection = moveCurrent ? "Errand" : "Work Unit";
    const currentBody = moveCurrent ? "base" : "edited";
    const incomingBody = moveCurrent ? "edited" : "base";
    const current = document(currentSection, currentBody);
    success(await fixture.store.write(update(fixture, base, current)));
    const landed = success(await fixture.store.write(update(fixture, base, document(incomingSection, incomingBody))));
    expect(landed.conflicts).toHaveLength(1);
    const conflictReference = landed.conflicts[0]!;
    const saved = success(await fixture.store.read({ reference: conflictReference }));
    expect(ConflictRecordSchema.parse(JSON.parse(saved.content))).toMatchObject({
      record: base.reference, location: { kind: "entry", id: "11111111" }, base: entry("base").trimEnd(), baseSection: "Errand",
      current: { content: entry(currentBody).trimEnd(), section: currentSection, label: { actor: "local", time: new Date(0).toISOString() } },
      incoming: { content: entry(incomingBody).trimEnd(), section: incomingSection, label: { actor: "local", time: new Date(0).toISOString() } },
    });
    expect(success(await fixture.store.read({ reference: base.reference }))).toMatchObject({ content: current, conflicts: [conflictReference] });
    expect(success(await fixture.reopen().read({ reference: conflictReference }))).toEqual(saved);
  });

  it("persists divergent destinations for an entry moved from a third section", async () => {
    const kind = "personal/errand-queue";
    const fixture = createReferenceFixture({ [kind]: { shape: "heading", sections: ["One", "Two", "Three"] } });
    const { store } = fixture;
    const reference = fixture.reference(kind);
    const entry = "### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase\n\n";
    const document = (section: string) => `# Queue\n\n${["One", "Two", "Three"].map((name) => `## ${name}\n\n${name === section ? entry : ""}`).join("")}`;
    const first = success(await store.write({ action: "put", reference, expected: null, content: document("One"), provenance: testProvenance }));
    const write = (section: string) => ({ action: "put" as const, reference, expected: first.version!, content: document(section), provenance: testProvenance });
    success(await store.write(write("Two")));
    const landed = success(await store.write(write("Three")));
    expect(landed.conflicts).toHaveLength(1);
    const conflictReference = landed.conflicts[0]!;
    const saved = success(await store.read({ reference: conflictReference }));
    expect(ConflictRecordSchema.parse(JSON.parse(saved.content))).toMatchObject({
      record: reference, location: { kind: "entry", id: "11111111" }, base: entry.trimEnd(), baseSection: "One",
      current: { content: entry.trimEnd(), section: "Two" }, incoming: { content: entry.trimEnd(), section: "Three" },
    });
    expect(success(await store.read({ reference }))).toMatchObject({ content: document("Two"), conflicts: [conflictReference] });
    expect(success(await fixture.reopen().read({ reference: conflictReference }))).toEqual(saved);
  });

  it("lands a valid primary record with exact bytes, random UID, and placement", async () => {
    const fixture = createReferenceFixture();
    const reference = fixture.reference("work-item/meta");
    const content = fixture.content(reference);
    const landed = await fixture.store.write({ action: "put", reference, content, expected: null,
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } });
    expect(landed.status).toBe("ok");
    if (landed.status !== "ok") return;
    expect(await fixture.store.read({ reference })).toMatchObject({ status: "ok", result: {
      content, version: landed.result.version, formatVersion: 1, conflicts: [], placement: { kind: "active" },
      reference: { owner: { uid: expect.stringMatching(/^[0-9a-f-]{36}$/u) } },
    } });
  });

  it.each(["read", "list", "version", "history", "changes", "lookup", "write", "batch", "sync"] as const)("refuses %s against a corrupt namespace and succeeds after rebuilding it", async (method) => {
    const fixture = createReferenceFixture();
    const from = await fixture.settle();
    const remote = fixture.remote(true)!;
    const remoteBefore = success(await remote.version());
    await fixture.produce("namespace-corrupt");
    const reference = fixture.reference("work-item/meta");
    const to = await fixture.settle();
    const operations: Record<typeof method, () => Promise<StoreResult<unknown>>> = {
      read: () => fixture.store.read({ reference }), list: () => fixture.store.list({ family: "work-item" }),
      version: () => fixture.store.version(), history: () => fixture.store.history({ reference }),
      changes: () => fixture.store.changes({ from, to }),
      lookup: () => fixture.store.lookup(LookupInputSchema.parse({ kind: "slug", slug: reference.owner.name })),
      write: () => fixture.store.write({ action: "put", reference: fixture.reference("project-registry/counter"), content: fixture.content(fixture.reference("project-registry/counter")), expected: null, provenance: testProvenance }),
      batch: () => fixture.store.batch({ writes: [], provenance: testProvenance }),
      sync: () => fixture.store.sync(),
    };
    expect(await operations[method]()).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal" } });
    expect(success(await remote.version())).toBe(remoteBefore);
    expect(await fixture.settle()).toBe(to);
    await fixture.repair("namespace-corrupt");
    expect((await operations[method]()).status).toBe("ok");
  });

  it("exhausts publish retries only after independent remote writes and keeps the pending local write", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const local = await seed(fixture, fixture.reference("work-item/meta"));
    const before = await fixture.settle();
    fixture.remoteState("contended");
    expect(success(await fixture.store.sync())).toMatchObject({ publishes: [{ status: "failed", failure: {
      code: "retries-exhausted", retryCount: 3, waitedMs: 30,
    } }] });
    const counter = success(await remote.read({ reference: fixture.reference("project-registry/counter", "contention") }));
    expect(JSON.parse(counter.content)).toEqual({ value: 3 });
    expect(await fixture.settle()).toBe(before);
    expect(success(await fixture.store.read({ reference: local.reference }))).toEqual(local);
    fixture.remoteState("available");
    expect(success(await fixture.store.sync())).toMatchObject({ publishes: [{ status: "reconciled" }] });
    expect(success(await remote.read({ reference: local.reference })).content).toBe(local.content);
  });

  it("reads saved bytes and listings independently of live entry faults", async () => {
    const fixture = createReferenceFixture();
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    const asOf = await fixture.settle();
    fixture.plant(record.reference, "key-mismatch");
    expect(await fixture.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "identity-mismatch" } });
    expect(success(await fixture.store.read({ reference: record.reference, asOf }))).toEqual(record);
    expect(success(await fixture.store.list({ family: "work-item", asOf }))).toMatchObject({ status: "complete", records: [record], missed: false, diagnostics: [] });
    fixture.plant(record.reference, "family-unreadable");
    expect(success(await fixture.store.list({ family: "work-item" })).status).toBe("unreadable");
    expect(success(await fixture.store.list({ family: "work-item", asOf }))).toMatchObject({ status: "complete", records: [record] });
  });

  it.each(["history", "changes", "claim-lookup"] as const)("keeps %s identity-scoped state unavailable until arc.identity is set", async (method) => {
    const fixture = createReferenceFixture();
    const from = await fixture.settle();
    const record = await seed(fixture, fixture.reference(method === "claim-lookup" ? "claims/groom" : "personal/document"));
    const to = await fixture.settle();
    const run = method === "history" ? () => fixture.store.history({ reference: record.reference })
      : method === "changes" ? () => fixture.store.changes({ from, to, references: [record.reference] })
        : () => fixture.store.lookup(LookupInputSchema.parse({ kind: "claim", claim: { kind: "groom", slug: record.reference.key, claimId: "1".repeat(32) } }));
    fixture.identity(undefined);
    expect(await run()).toMatchObject({ status: "refused", refusal: { code: "not-found", class: "recoverable", remedy: { text: expect.stringContaining("arc.identity") } } });
    fixture.identity(record.reference.owner.name);
    expect((await run()).status).toBe("ok");
  });

  it("reuses a removed primary's name with a fresh generation while preserving old history and saved name reads", async () => {
    const fixture = createReferenceFixture();
    const named = fixture.reference("work-item/meta");
    const first = await seed(fixture, named);
    const companion = await seed(fixture, RecordReferenceSchema.parse({ ...fixture.reference("work-item/companion"), owner: first.reference.owner }));
    const oldState = await fixture.settle();
    success(await fixture.store.write({ action: "remove", reference: first.reference, expected: first.version, provenance: testProvenance }));
    const second = await seed(fixture, named);
    expect(second.reference.owner).not.toEqual(first.reference.owner);
    const oldOwner = success(await fixture.store.list({ family: "work-item", owner: first.reference.owner }));
    expect(oldOwner).toMatchObject({ status: "complete", records: [companion] });
    expect(success(await fixture.store.list({ family: "work-item", owner: second.reference.owner }))).toMatchObject({ status: "complete", records: [second] });
    expect(success(await fixture.store.list({ family: "work-item", owner: named.owner }))).toMatchObject({ status: "complete", records: [second] });
    expect(success(await fixture.store.history({ reference: first.reference }))).toHaveLength(2);
    expect(success(await fixture.store.history({ reference: second.reference }))).toHaveLength(1);
    expect(success(await fixture.store.read({ reference: named, asOf: oldState }))).toEqual(first);
  });

  it("allows declared write-once creation, refuses updates and undeclared writers, and resolves conflicts only through their subject", async () => {
    const fixture = createReferenceFixture();
    const subject = await seed(fixture, fixture.reference("work-item/meta"));
    const reference = RecordReferenceSchema.parse({ ...fixture.reference("work-item/conflict-record"), owner: subject.reference.owner });
    expect(await fixture.store.write({ action: "put", reference, content: fixture.content(reference), expected: null,
      provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
    const conflict = await seed(fixture, reference);
    expect(await fixture.store.write(update(fixture, conflict, conflict.content))).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(await fixture.store.write({ action: "remove", reference: conflict.reference, expected: conflict.version,
      provenance: { verb: "resolve", lifecycleAction: "resolve" } })).toMatchObject({ status: "refused", refusal: { code: "record-malformed", remedy: { text: expect.stringContaining("resolv") } } });
    const open = success(await fixture.store.read({ reference: subject.reference }));
    expect(open.conflicts).toEqual([conflict.reference]);
    success(await fixture.store.write({ ...update(fixture, open), resolves: [conflict.reference] }));
    expect(success(await fixture.store.read({ reference: subject.reference })).conflicts).toEqual([]);
  });
});
