/** Name-keyed companions retain their conventional filenames in lifecycle readers. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDesign, writeMetaCurrentWorkflow, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { readLifecycleDesign } from "../../../../src/lib/store/lifecycle-design.js";
import { createStoreReconcilePrepareContext } from "../../../../src/lib/work-unit/store-reconcile-context.js";

async function fixture(design = ["spec-example-prd.md", "spec-example-rfc.md"]) {
  const h = createLifecycleHarness();
  const original = await h.seedMeta("example", { state: "Planning", currentWorkflow: "create-spec", design: ["draft-example.md"] });
  const prd = await h.seed(recordReferences["work-item/companion"](original.reference.owner, "spec-prd"), "# Spec\n\n**Purpose:** Product intent.\n");
  const rfc = await h.seed(recordReferences["work-item/companion"](original.reference.owner, "spec-rfc"), "# Spec\n\n**Purpose:** Implementation intent.\n");
  const research = await h.seed(recordReferences["work-item/companion"](original.reference.owner, "research"), "# Research: example\n");
  const content = writeMetaNextAction(writeMetaCurrentWorkflow(writeMetaDesign(original.content, design), "generate-tasks"), "[begin current workflow]");
  lifecycleSuccess(await h.store.write({ ...recordPut(original, { content }), provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  return { ...h, meta: lifecycleSuccess(await h.store.read({ reference: original.reference })), prd, rfc, research };
}

it.each(["prd", "rfc"] as const)("reads the paired %s Design through its name-keyed companion", async (half) => {
  const h = await fixture([`spec-example-${half}.md`]);
  expect(await readLifecycleDesign(h.store, h.meta)).toEqual({ content: h[half].content, warnings: [] });
});

it("acquires ordinary and paired companions at their conventional artifact coordinates", async () => {
  const h = await fixture();
  const acquired = lifecycleSuccess(await createStoreReconcilePrepareContext(h.store, "example"));
  expect(await acquired.context.listArtifactPaths!("example", ".arc/active/meta-example.md"))
    .toEqual(expect.arrayContaining([".arc/active/research-example.md", ".arc/active/spec-example-prd.md", ".arc/active/spec-example-rfc.md"]));
  for (const [path, record] of [["research-example.md", h.research], ["spec-example-prd.md", h.prd], ["spec-example-rfc.md", h.rfc]] as const) {
    expect(acquired.byPath.get(`.arc/active/${path}`)).toEqual(record);
    expect(await acquired.context.readFile(`.arc/active/${path}`)).toBe(record.content);
  }
});
