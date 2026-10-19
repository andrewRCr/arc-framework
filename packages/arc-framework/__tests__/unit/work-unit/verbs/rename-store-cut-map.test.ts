/** Saved cut maps remain immutable while ordinary rename references advance. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { cutMapFixture, rebindCutFixture } from "../../../fixtures/decompose-v4.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { scanV3DecomposeContent } from "../../../../src/lib/work-unit/decompose-content.js";
import { cutSourceId } from "../../../../src/lib/decompose/cut-map-machine.js";
import { decodeCutMapContent, writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { digestBytes } from "../../../../src/lib/kernel/canonical/canonical-json.js";
import { writeMetaDesign, writeMetaCurrentWorkflow, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

const locusPorts = {
  checkMarkerExclusivity: async () => ({ kind: "clear" as const }), findHoldingCheckout: async () => null,
  writeAnchoredMarker: async () => ({ kind: "unadmitted" as const }),
};
async function stub(h: ReturnType<typeof createLifecycleHarness>, slug: string) {
  return h.seedMeta(slug, { state: "Planning", currentWorkflow: null, design: [`draft-${slug}.md`] }, { kind: "backlog", commitment: "planned" });
}
async function seedCut(h: ReturnType<typeof createLifecycleHarness>, primary: StoreRecord, mentionedArtifact: string) {
  const origin = primary.reference.owner;
  if (origin.type !== "work-item" || origin.uid === undefined) throw new Error("Missing work-item generation");
  const artifact = `draft-${origin.name}.md`;
  const content = `# Draft: ${origin.name}\n\n## Read \`${mentionedArtifact}\`\nOwned work.\n`;
  const draft = await h.seed(recordReferences["work-item/draft"](origin), content);
  const scan = scanV3DecomposeContent(artifact, new TextEncoder().encode(content));
  if (scan.status !== "scanned") throw new Error("Fixture draft must scan");
  const value = cutMapFixture();
  value.machine.origin = { slug: SlugSchema.parse(origin.name), uid: origin.uid };
  value.machine.sourceKind = "backlog-stub";
  value.machine.planningProfile = { kind: "draft", sourceDesign: [artifact] };
  value.machine.sourceUnits = scan.units.map(unit => ({
    sourceLocator: unit.locator, sourceId: cutSourceId({ sourceLocator: unit.locator }), contentDigest: digestBytes(unit.bytes),
  })).sort((a, b) => Buffer.compare(Buffer.from(a.sourceId), Buffer.from(b.sourceId)));
  value.authoring.sourceAllocations = value.machine.sourceUnits.map(unit => ({
    sourceId: unit.sourceId, ownership: "destination-owned", disposition: { kind: "target", destinationId: "member-a",
      targetLocator: { ...unit.sourceLocator, artifact: "draft-member-a.md" } },
  }));
  rebindCutFixture(value);
  const map = await h.seed(recordReferences["work-item/cut-map"](origin), writeCutMapRecord(value));
  return { draft, map };
}
function context(h: ReturnType<typeof createLifecycleHarness>) {
  return { store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main", locusPorts };
}

it("keeps an origin's stored map bytes when its own artifacts are renamed", async () => {
  const h = createLifecycleHarness();
  const primary = await stub(h, "origin");
  const { draft, map } = await seedCut(h, primary, "draft-origin.md");
  const result = await runStoreRename(context(h), { sourceSlug: "origin", targetSlug: "renamed" });
  expect(result, JSON.stringify(result)).toMatchObject({ status: "renamed" });
  const saved = lifecycleSuccess(await h.store.read({ reference: map.reference }));
  expect(saved.content).toBe(map.content);
  expect(saved.reference.owner).toMatchObject({ name: "renamed", uid: primary.reference.owner.type === "work-item" ? primary.reference.owner.uid : undefined });
  expect(decodeCutMapContent(saved.content).success).toBe(true);
  expect(lifecycleSuccess(await h.store.read({ reference: draft.reference })).content).toContain("Read `draft-renamed.md`");
});

it("keeps a foreign stub's stored map bytes while rewriting that stub's prose", async () => {
  const h = createLifecycleHarness();
  const other = await stub(h, "other");
  await h.seed(recordReferences["work-item/draft"](other.reference.owner), "# Draft: other\n\nOther work.\n");
  const primary = await stub(h, "origin");
  const { draft, map } = await seedCut(h, primary, "draft-other.md");
  const result = await runStoreRename(context(h), { sourceSlug: "other", targetSlug: "renamed" });
  expect(result, JSON.stringify(result)).toMatchObject({ status: "renamed" });
  const saved = lifecycleSuccess(await h.store.read({ reference: map.reference }));
  expect(saved.content).toBe(map.content);
  expect(decodeCutMapContent(saved.content).success).toBe(true);
  expect(lifecycleSuccess(await h.store.read({ reference: draft.reference })).content).toContain("Read `draft-renamed.md`");
});

it("ignores a saved map's sole ambiguous paired reference when renaming another owner", async () => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("origin", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-origin.md"] });
  await h.seed(recordReferences["work-item/companion"](primary.reference.owner, "spec-prd"), "# Spec: origin\n\n**Purpose:** Paired design.\n");
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
    placement: { kind: "active" }, content: writeMetaNextAction(writeMetaCurrentWorkflow(writeMetaDesign(primary.content,
      ["spec-origin-prd.md"]), "generate-tasks"), "[begin current workflow]"), provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  const other = await h.seedMeta("origin-prd", { design: ["spec-origin-prd.md"] });
  const ordinary = await h.seed(recordReferences["work-item/spec"](other.reference.owner), "# Independent specification\n");
  const waiting = await stub(h, "waiting");
  const { draft, map } = await seedCut(h, waiting, "spec-origin-prd.md");
  lifecycleSuccess(await h.store.write({ action: "put", reference: draft.reference, expected: draft.version,
    content: "# Draft: waiting\n\nCurrent prose no longer contains the earlier heading.\n", provenance: { verb: "save", lifecycleAction: "edit" } }));
  const result = await runStoreRename(context(h), { sourceSlug: "origin", targetSlug: "successor" });
  expect(result, JSON.stringify(result)).toMatchObject({ status: "renamed" });
  expect(lifecycleSuccess(await h.store.read({ reference: map.reference })).content).toBe(map.content);
  expect(lifecycleSuccess(await h.store.read({ reference: ordinary.reference }))).toEqual(ordinary);
});
