/** Temporary real repository with independent completed and live work-unit generations. */
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { renderMetaFile, type MetaRenderOverrides } from "../../src/lib/store/kinds/meta/writers.js";
import type { WritePlacement } from "../../src/lib/store/placement.js";

/** Use a production rename before arranging the final verb state and branch links. */
export async function lifecycleReuseFixture(former: boolean, fields: MetaRenderOverrides = {}, placement: WritePlacement = { kind: "active" }) {
  const f = await repairCliFixture(), h = createLifecycleHarness(), repository = randomUUID();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: repository })), "{}");
  const archived = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const oldNotes = await h.seed(recordReferences["work-item/notes"](archived.reference.owner), "# Completed notes\n");
  const initial = await h.seedMeta("example");
  if (former) {
    const renamed = await repairCli(f, ["rename", "example", "current"], { store: h.store });
    expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  }
  const name = former ? "current" : "example";
  const basis = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(basis, { placement, content: renderMetaFile(name,
    { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop", ...fields }) }),
    provenance: { verb: "fixture", lifecycleAction: "arrange" } }));
  const live = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
  return { ...f, ...h, archived, oldNotes, live, name, repository };
}
