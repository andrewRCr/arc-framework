/** Checked Store renames preserve owned identity and rewrite acquired planning references on native paths. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { prepareStoreRename, readStoreRenameSubject, submitStoreRename } from "../../../../src/lib/store/lifecycle-rename.js";

it("renames through the checked Store and rewrites acquired planning references", async () => {
  const h = createLifecycleHarness();
  const source = await h.seedMeta("source", { state: "Planning", currentWorkflow: null },
    { kind: "backlog", commitment: "planned" });
  const dependent = await h.seedMeta("waiting", { state: "Planning", currentWorkflow: null, dependsOn: ["source"] },
    { kind: "backlog", commitment: "planned" });
  lifecycleSuccess(await h.store.write({ ...recordPut(dependent, {
    content: `${dependent.content}\nSee \`meta-source.md\` and \`spec-source.md\`.\n`,
  }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const subject = lifecycleSuccess(await readStoreRenameSubject(h.store, { primary: source, operand: "source", targetSlug: "target" }));
  const prepared = lifecycleSuccess(await prepareStoreRename(h.store, subject, "target"));
  lifecycleSuccess(await submitStoreRename(h.store, prepared));
  const renamed = lifecycleSuccess(await h.store.read({ reference: source.reference }));
  expect(renamed.reference.owner).toEqual({ ...source.reference.owner, name: "target" });
  expect(renamed.aliases).toContain("source");
  const waiting = lifecycleSuccess(await h.store.read({ reference: dependent.reference }));
  expect(waiting.fields).toMatchObject({ dependsOn: ["target"] });
  expect(waiting.content).toContain("`meta-target.md` and `spec-target.md`");
  expect(waiting.content).not.toContain("`meta-source.md`");
});
