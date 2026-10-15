/** Paired designs remain readable across an atomic work-unit rename. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { readLifecycleDesign } from "../../../../src/lib/store/lifecycle-design.js";
import { writeMetaDesign, writeMetaCurrentWorkflow, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { ParsedMetaRecordSchema } from "../../../../src/lib/active/meta-schema.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

it("keeps both paired Design bindings and references coherent after a refused batch is retried", async () => {
  const h = createLifecycleHarness();
  let primary = await h.seedMeta("source", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-source.md"] });
  const companions: StoreRecord[] = [];
  for (const half of ["prd", "rfc"]) companions.push(await h.seed(
    recordReferences["work-item/companion"](primary.reference.owner, `spec-${half}`),
    `# Spec (\`detailed\` · \`${half.toUpperCase()}\`): source\n\n**Purpose:** ${half} design.\n\nSee \`spec-source-prd.md\` and \`spec-source-rfc.md\` with \`--plan source\`.\n`,
  ));
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
    placement: { kind: "active" }, content: writeMetaNextAction(writeMetaCurrentWorkflow(writeMetaDesign(primary.content,
      ["spec-source-prd.md", "spec-source-rfc.md"]), "generate-tasks"), "[begin current workflow]"),
    provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  primary = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  const stub = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "provisional" });
  const draft = await h.seed(recordReferences["work-item/draft"](stub.reference.owner),
    "# Draft: waiting\n\nRead `spec-source-prd.md` and `spec-source-rfc.md`.\n");
  const git = scriptGitExec([]);
  const ctx = { store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main", locusPorts: {
    checkMarkerExclusivity: async () => ({ kind: "clear" as const }), findHoldingCheckout: async () => null,
    writeAnchoredMarker: async () => ({ kind: "unadmitted" as const }),
  } };
  const batch = h.store.batch.bind(h.store);
  h.store.batch = async () => ({ status: "refused", refusal: { code: "version-conflict", class: "recoverable",
    records: [primary.reference], condition: "Concurrent rename input", remedy: { text: "Retry the rename." } } });
  expect(await runStoreRename(ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "rejected" });
  for (const record of [primary, ...companions, draft]) {
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  }
  h.store.batch = batch;
  expect(await runStoreRename(ctx, { sourceSlug: "source", targetSlug: "target" })).toMatchObject({ status: "renamed" });
  const renamed = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(renamed.fields).toMatchObject({ design: ["spec-target-prd.md", "spec-target-rfc.md"] });
  for (const [index, record] of companions.entries()) {
    const changed = lifecycleSuccess(await h.store.read({ reference: record.reference }));
    expect(changed.content).toContain(`): target\n`);
    expect(changed.content).toContain("See `spec-target-prd.md` and `spec-target-rfc.md` with `--plan target`.");
    expect(changed.reference.owner).toEqual(renamed.reference.owner);
    const onlyHalf = { ...renamed, content: writeMetaDesign(renamed.content, [`spec-target-${index === 0 ? "prd" : "rfc"}.md`]),
      fields: { ...ParsedMetaRecordSchema.parse(renamed.fields), design: [`spec-target-${index === 0 ? "prd" : "rfc"}.md`] } };
    expect((await readLifecycleDesign(h.store, onlyHalf)).content).toBe(changed.content);
  }
  expect(lifecycleSuccess(await h.store.read({ reference: draft.reference })).content)
    .toBe("# Draft: waiting\n\nRead `spec-target-prd.md` and `spec-target-rfc.md`.\n");
  const histories = await Promise.all([primary, ...companions, draft].map(async (record) =>
    lifecycleSuccess(await h.store.history({ reference: record.reference }))[0]?.provenance));
  expect(histories[0]).toMatchObject({ verb: "rename", batchId: expect.any(String) });
  expect(histories.every((provenance) => provenance !== undefined && "batchId" in provenance
    && histories[0] !== undefined && "batchId" in histories[0] && provenance.batchId === histories[0].batchId)).toBe(true);
});

it.each(["prd", "rfc"])("refuses a shared %s reference with two live owners, then retries after repair", async (half) => {
  const h = createLifecycleHarness();
  let primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-origin.md"] });
  const paired = await h.seed(recordReferences["work-item/companion"](primary.reference.owner, `spec-${half}`),
    `# Spec: origin\n\n**Purpose:** Paired half.\n`);
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version, placement: { kind: "active" },
    content: writeMetaNextAction(writeMetaCurrentWorkflow(writeMetaDesign(primary.content,
      [`spec-origin-${half}.md`]), "generate-tasks"), "[begin current workflow]"),
    provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  primary = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  const other = await h.seedMeta(`origin-${half}`, { design: [`spec-origin-${half}.md`] });
  const ordinary = await h.seed(recordReferences["work-item/spec"](other.reference.owner), "# Independent specification\n");
  const waiting = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null }, { kind: "backlog", commitment: "planned" });
  const draft = await h.seed(recordReferences["work-item/draft"](waiting.reference.owner), `Read \`spec-origin-${half}.md\`.\n`);
  let physical = 0, batches = 0;
  const batch = h.store.batch.bind(h.store);
  h.store.batch = (input) => { batches++; return batch(input); };
  const ctx = { store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main", locusPorts: {
    checkMarkerExclusivity: async () => ({ kind: "clear" as const }), findHoldingCheckout: async () => "/holder/origin",
    writeAnchoredMarker: async () => ({ kind: "unadmitted" as const }),
  }, renameCheckout: async () => { physical++; return { report: { checkout: { kind: "renamed" as const, checkoutPath: "/holder/successor", markerGeneration: "renamed" } }, rollback: async () => {} }; } };
  const request = { sourceSlug: "origin", targetSlug: "successor" };
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "rejected",
    reason: expect.stringContaining(`spec-origin-${half}.md`), refusal: { code: "record-malformed" } });
  expect(physical).toBe(0); expect(batches).toBe(0);
  for (const record of [primary, paired, other, ordinary, draft]) {
    expect(lifecycleSuccess(await h.store.read({ reference: record.reference }))).toEqual(record);
  }
  lifecycleSuccess(await h.store.write({ action: "put", reference: draft.reference, expected: draft.version,
    content: `The independent work unit is origin-${half}.\n`, provenance: { verb: "save", lifecycleAction: "edit" } }));
  expect(await runStoreRename(ctx, request)).toMatchObject({ status: "renamed" });
  expect(physical).toBe(1); expect(batches).toBe(1);
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields)
    .toMatchObject({ design: [`spec-successor-${half}.md`] });
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
  expect(lifecycleSuccess(await h.store.read({ reference: ordinary.reference }))).toEqual(ordinary);
});
