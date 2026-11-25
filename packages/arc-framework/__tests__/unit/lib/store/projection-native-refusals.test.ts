/** Native semantic failures retain their typed repair information across preparation and replay. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { createKindRegistry } from "../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../../../src/lib/store/projection/submission.js";
import { checkProjectionAdmission } from "../../../../src/lib/store/projection/admission-check.js";
import { prepareAdoptedContent } from "../../../../src/lib/store/projection/check-edit.js";
import { overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { newPersonalAdmission } from "../../../helpers/store/projection/admission-request.js";
import { planProjectionWrite } from "../../../../src/lib/store/projection/admission-planner.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

it.each(["namespace-corrupt", "record-malformed", "state-unresolvable"] as const)("retains native %s through semantic admission replay", async code => {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const f = createReferenceFixture(ENTRY_CONFIGS, registry);
  const h = await createWriteBackFixture({ fixture: f, kind: "work-item/meta" });
  try {
    const dependency = f.reference("work-item/meta", "dependency");
    await seed(f, dependency, makeMetaFixture(dependency.owner.name, { owner: "test-user", state: "Active",
      workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
    const base = success(await f.store.read({ reference: h.entry.reference }));
    const text = base.content.replace("- **Depends On:** [none]", `- **Depends On:** \`${dependency.owner.name}\``);
    expect(text).not.toBe(base.content);
    await h.edit(text);
    const ready = await prepareWriteBack(h.context, h.request);
    if (ready.kind !== "ready") throw new Error(JSON.stringify(ready));
    const prepared = success(await prepareIndexedProjectionSubmission(h.context, h.request, ready));
    expect(await checkProjectionAdmission(f.store, prepared.batch, registry, "test-user")).toBeUndefined();
    const refusal = StoreRefusalSchema.parse({ code, class: code === "namespace-corrupt" ? "terminal" : "recoverable",
      ...(code === "namespace-corrupt" ? { namespace: "work-item" } : code === "record-malformed" ? { rule: "projection.native-source" }
        : { historyRefs: ["refs/arc/history/work/00000000-0000-4000-8000-000000000001"] }),
      condition: "The fresh dependency lookup is unavailable.", remedy: { text: "Restore dependency namespace evidence.", argv: ["arc", "fetch", "--history"] } });
    const before = { read: f.store.read.bind(f.store), list: f.store.list.bind(f.store),
      history: f.store.history.bind(f.store), lookup: async (input: Parameters<typeof f.store.lookup>[0]) =>
        input.kind === "slug" && input.slug === dependency.owner.name
          ? { status: "refused" as const, refusal } : f.store.lookup(input) };
    expect(await checkProjectionAdmission(before, prepared.batch, registry, "test-user")).toEqual(refusal);
    expect(await checkProjectionAdmission(f.store, prepared.batch, registry, "test-user")).toBeUndefined();
  } finally { await h.dispose(); }
});


it.each(["read", "list", "history"] as const)("preserves a semantic %s failure even when its checker returns no diagnostic", async operation => {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS), f = createReferenceFixture(ENTRY_CONFIGS, registry);
  const reference = f.reference("personal/working-memory");
  const content = "Prepared personal prose.\n";
  const admission = newPersonalAdmission(reference, content);
  const healthy = success(await planProjectionWrite(f.store, admission, registry));
  const batch = { writes: [healthy.mutation], provenance: { verb: "write-back", lifecycleAction: "edit" },
    observations: healthy.observations, projectionAdmission: { ...admission, prepared: healthy.prepared } };
  const refusal = StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", reference,
    historyRefs: ["refs/arc/history/work/00000000-0000-4000-8000-000000000001"],
    condition: `Semantic ${operation} evidence is unavailable.`, remedy: { text: "Fetch the named history and retry.", argv: ["arc", "fetch"] } });
  const failed = async () => ({ status: "refused" as const, refusal });
  const before = { read: f.store.read.bind(f.store), list: f.store.list.bind(f.store),
    history: f.store.history.bind(f.store), lookup: f.store.lookup.bind(f.store) };
  let checking = false;
  const wrapped: typeof before = { ...before,
    read: async input => checking && operation === "read" ? failed() : before.read(input),
    list: async input => checking && operation === "list" ? failed() : before.list(input),
    history: async input => checking && operation === "history" ? failed() : before.history(input) };
  const checkedRegistry = { ...registry, "personal/working-memory": { ...registry["personal/working-memory"],
    check: async (input: import("../../../../src/lib/store/write-check.js").WriteCheckInput) => {
      checking = true;
      try {
        if (operation === "read") await input.after.read({ reference: f.reference("personal/document") });
        else if (operation === "list") await input.after.list({ family: "personal" });
        else await input.before.history({ reference });
      } finally { checking = false; }
      return [];
    } } };
  expect(await checkProjectionAdmission(wrapped, batch, checkedRegistry, "test-user")).toEqual(refusal);
  const initial = await prepareAdoptedContent({ store: overrideEngineStore(f.store, wrapped), registry: checkedRegistry,
    actor: "test-user", format: "sha1", location: { gitDir: "", commonDir: "", stateDir: "", primary: false } }, reference, content);
  expect(initial).toEqual({ status: "refused", refusal });
  expect(await checkProjectionAdmission(f.store, batch, registry, "test-user")).toBeUndefined();
});
