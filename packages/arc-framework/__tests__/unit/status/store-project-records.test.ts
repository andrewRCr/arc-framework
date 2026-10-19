/** Store readiness mapping retains fields and binds purposes to exact work-unit generations. */
import { expect, it } from "vitest";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { RecordReferenceSchema, recordReferences } from "../../../src/lib/store/identity.js";
import { listLifecycleIndex } from "../../../src/lib/store/lifecycle-index.js";
import { readStoreProjectRecords } from "../../../src/lib/status/store-project-records.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { selectStandingLifecycleEntries } from "../../../src/lib/status/store-project-standing.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { testProvenance } from "../../helpers/store/suite-tools.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { writeMetaDesign } from "../../../src/lib/store/kinds/meta/writers.js";

it.each([
  { priority: "P1", display: "P1" }, { priority: "invalid", display: "P3" }, { priority: null, display: "P3" },
])("maps every lifecycle field with priority $priority displayed as $display", async ({ priority, display }) => {
  const fixture = createReferenceFixture();
  const reference = RecordReferenceSchema.parse({ ...fixture.reference("work-item/meta"), owner: { type: "work-item", name: "example" } });
  const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-01-02T03:04:05.000Z", reason: "Waiting" });
  const fields = { ...parseMetaRecord(makeMetaFixture("example")), state: "Planning", owner: "andrew", priority,
    workClass: "Heavy", cohort: "group/subgroup", dependsOn: ["dependency"], pause };
  lifecycleSuccess(await fixture.store.write({ action: "put", reference, expected: null, content: JSON.stringify(fields),
    placement: { kind: "backlog", commitment: "planned" }, provenance: testProvenance }));
  const listing = lifecycleSuccess(await listLifecycleIndex(fixture.store));
  if (listing.status !== "complete") throw new Error("Expected selected work unit");

  expect(await readStoreProjectRecords(fixture.store, listing.index.entries())).toEqual({ records: [{
    slug: "example", location: "planned", state: "Planning", owner: "andrew", priority: display, class: "Heavy",
    dependsOn: ["dependency"], cohort: "group/subgroup", pause, purpose: null,
    source: { kind: "store", location: "planned" }, sources: [{ kind: "store", location: "planned" }],
  }], warnings: [] });
});

it.each(["unreadable", "refused"] as const)("clears every purpose and reports the remedy when a design inventory is %s", async failure => {
  const h = createLifecycleHarness();
  for (const kind of ["spec", "draft"] as const) {
    const meta = await h.seedMeta(kind, { design: [`${kind}-${kind}.md`] });
    await h.seed(recordReferences[`work-item/${kind}`](meta.reference.owner), `# Design\n\n**Purpose:** ${kind} intent.\n`);
  }
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected selected work units");
  const store = Object.create(h.store) as Store;
  store.list = async input => input.kind === "work-item/draft"
    ? failure === "unreadable"
      ? { status: "ok", result: { status: "unreadable", condition: "Design inventory unavailable.", remedy: { text: "Repair the design index and retry." } } }
      : { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
        condition: "Design inventory unavailable.", remedy: { text: "Repair the design index and retry." } } }
    : h.store.list(input);

  const result = await readStoreProjectRecords(store, listing.index.entries());
  expect(result.records.map(record => record.purpose)).toEqual([null, null]);
  expect(result.warnings).toEqual([{ code: "store-read-failed",
    rendered: expect.stringContaining("Design inventory unavailable. Repair the design index and retry.") }]);
});

it("selects a reused slug's purpose from its own generation", async () => {
  const h = createLifecycleHarness();
  const old = await h.seedMeta("reused", { design: ["spec-reused.md"] });
  await h.seed(recordReferences["work-item/spec"](old.reference.owner), "# Spec\n\n**Purpose:** Old intent.\n");
  lifecycleSuccess(await h.store.write({ action: "put", reference: old.reference, expected: old.version, content: old.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const current = await h.seedMeta("reused", { design: ["spec-reused.md"] });
  await h.seed(recordReferences["work-item/spec"](current.reference.owner), "# Spec\n\n**Purpose:** Current intent. More details.\n");
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected both generations");
  const selected = selectStandingLifecycleEntries(listing.index.entries(), listing.diagnostics);

  const result = await readStoreProjectRecords(h.store, selected.entries);
  expect(result.records).toHaveLength(1);
  expect(result.records[0]?.purpose).toBe("Current intent.");
  expect(result.warnings).toEqual([]);
});

it("keeps readable purposes while reporting an omitted design record's diagnostic", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example", { design: ["spec-example.md"] });
  await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Spec\n\n**Purpose:** Readable intent.\n");
  await h.seed(recordReferences["work-item/draft"](meta.reference.owner), "# Draft\n\n**Purpose:** Withheld intent.\n");
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected selected work unit");
  const store = Object.create(h.store) as Store;
  store.list = async input => {
    const outcome = await h.store.list(input);
    if (input.kind !== "work-item/draft" || outcome.status !== "ok" || outcome.result.status !== "complete") return outcome;
    return { status: "ok", result: { ...outcome.result, records: [], missed: true, diagnostics: [{ kind: "unreadable",
      key: "withheld-design", condition: "Draft read unavailable.", remedy: { text: "Repair the draft and retry." } }] } };
  };

  const result = await readStoreProjectRecords(store, listing.index.entries());
  expect(result.records[0]?.purpose).toBe("Readable intent.");
  expect(result.warnings).toEqual([{ code: "listing-diagnostic", rendered: expect.stringMatching(/Draft read unavailable.*Repair the draft and retry/iu) }]);
  expect(result.warnings[0]?.rendered).toMatch(/omit/iu);
});

it("uses one complete design inventory per kind for every work unit", async () => {
  const h = createLifecycleHarness();
  for (const [slug, kind] of [["one", "spec"], ["two", "draft"], ["three", "companion"], ["four", "spec"]] as const) {
    const design = kind === "companion" ? `spec-${slug}-rfc.md` : `${kind}-${slug}.md`;
    const meta = await h.seedMeta(slug, { design: kind === "companion" ? [] : [design] });
    const reference = kind === "companion" ? recordReferences["work-item/companion"](meta.reference.owner, "spec-rfc")
      : recordReferences[`work-item/${kind}`](meta.reference.owner);
    await h.seed(reference, `# Design\n\n**Purpose:** ${slug} intent.\n`);
    if (kind === "companion") lifecycleSuccess(await h.store.write({ action: "put", reference: meta.reference,
      expected: meta.version, content: writeMetaDesign(meta.content, [design]),
      placement: { kind: "active" },
      provenance: { verb: "set-design", lifecycleAction: "update" } }));
  }
  const listing = lifecycleSuccess(await listLifecycleIndex(h.store));
  if (listing.status !== "complete") throw new Error("Expected selected work units");
  const store = Object.create(h.store) as Store;
  const observedKinds = new Set<string>();
  store.list = async input => {
    // A subsequent inventory may lose completeness; all rows must share the first one.
    if (input.kind === undefined || observedKinds.has(input.kind)) return { status: "ok", result: {
      status: "unreadable", condition: "Design inventory became unavailable.", remedy: { text: "Restore the index and retry." },
    } };
    observedKinds.add(input.kind);
    return h.store.list(input);
  };

  const result = await readStoreProjectRecords(store, listing.index.entries());
  expect(result.records.map(record => record.purpose)).toEqual(["one intent.", "two intent.", "three intent.", "four intent."]);
  expect(result.warnings).toEqual([]);
});
