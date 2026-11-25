/** Prepared edits retain their primary role, lifecycle, checkout claim, and durable Errand owner. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaCurrentWorkflow, writeMetaOwner, writeMetaState } from "../../src/lib/store/kinds/meta/writers.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { TASK_RULE_CONTENT } from "../helpers/store/task-rule-input.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) for (const change of ["errand-owner", "role", "claim", "lifecycle"] as const) {
  it(`rechecks primary authority and admits repaired preparation: ${backend}/${change}`, async () => {
    const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
    const kind = change === "errand-owner" ? "work-item/description" : change === "claim" ? "work-item/task-list" : "work-item/notes";
    const h = await createWriteBackFixture({ fixture: f, kind,
      content: change === "claim" ? TASK_RULE_CONTENT : change === "errand-owner" ? "## Description\n\n" : "Authored notes.\n" });
    try {
      const primaryRef = change === "errand-owner" ? recordReferences["work-item/record"](h.entry.reference.owner)
        : recordReferences["work-item/meta"](h.entry.reference.owner);
      const primary = success(await f.store.read({ reference: primaryRef }));
      const planning = change === "claim" || change === "lifecycle"
        ? writeMetaCurrentWorkflow(writeMetaState(primary.content, "Planning"), "draft-design") : primary.content;
      if (change === "lifecycle") success(await f.store.write({ ...update(f, primary, writeMetaOwner(planning, SlugSchema.parse("another-user"))),
        placement: { kind: "backlog", commitment: "planned" }, provenance: { verb: "seed", lifecycleAction: "seed" } }));
      const text = success(await f.store.read({ reference: h.entry.reference })).content + "\nA preserved authored note.\n";
      await h.edit(text);
      const prepare = async () => {
        const ready = await prepareWriteBack(h.context, h.request);
        if (ready.kind !== "ready") throw new Error(`Authority preparation held: ${JSON.stringify(ready)}`);
        return success(await prepareIndexedProjectionSubmission(h.context, h.request, ready));
      };
      const prepared = await prepare(), bytes = await h.file();
      const prior = success(await f.store.read({ reference: primary.reference }));
      if (change === "errand-owner" || change === "role") {
        const record = TransientIdentityRecordSchema.parse(change === "errand-owner" ? JSON.parse(prior.content) : {
          version: 3, kind: "errand", purpose: "errand", slug: prior.reference.owner.name, claimId: "a".repeat(32),
          owner: "test-user", state: "open", branch: `chore/${prior.reference.owner.name}`, createdAt: "2026-11-01T00:00:00Z",
          updatedAt: "2026-11-01T00:00:00Z", intent: "A bounded correction", origin: "description", originEntry: null,
          savedHead: null, changeRequest: null,
        });
        success(await f.store.write({ action: "put", reference: recordReferences["work-item/record"](prior.reference.owner),
          expected: prior.version, placement: { kind: "active" }, content: JSON.stringify(change === "errand-owner"
            ? { ...record, owner: "another-user" } : record), provenance: { verb: "seed", lifecycleAction: "seed" } }));
      } else success(await f.store.write({ ...update(f, prior, change === "claim" ? planning
        : writeMetaOwner(primary.content, SlugSchema.parse("another-user"))),
        placement: change === "claim" ? { kind: "backlog", commitment: "planned" } : { kind: "active" },
        provenance: { verb: "seed", lifecycleAction: "seed" } }));
      expect(await f.store.batch(prepared.batch)).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
      expect(await h.file()).toBe(bytes);
      expect(success(await f.store.read({ reference: h.entry.reference })).content).not.toContain("A preserved authored note.");
      const changed = success(await f.store.read({ reference: primary.reference }));
      success(await f.store.write({ action: "put", reference: primary.reference, expected: changed.version, content: primary.content,
        placement: { kind: "active" }, provenance: { verb: "seed", lifecycleAction: "seed" } }));
      success(await f.store.batch((await prepare()).batch));
      expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
    } finally { await h.dispose(); }
  });
}
