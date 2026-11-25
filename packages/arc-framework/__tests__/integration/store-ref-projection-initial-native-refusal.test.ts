/** Initial sender preparation preserves native semantic failures and keeps healthy retry available. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { createWriteBackPort, prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { createHistoryMemo } from "../../src/lib/store/projection/base-recovery.js";
import { StoreRefusalSchema } from "../../src/lib/store/refusal.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const)
  for (const code of ["state-unresolvable", "namespace-corrupt"] as const) {
    it(`retains the initial semantic ${code} route and retries unchanged bytes: ${backend}`, async () => {
      const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
      const h = await createWriteBackFixture({ fixture: f, kind: "work-item/meta" });
      const other = await createWriteBackFixture({ fixture: f });
      try {
        const dependency = f.reference("work-item/meta", "dependency");
        await seed(f, dependency, makeMetaFixture(dependency.owner.name, { owner: "test-user", state: "Active",
          workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
        const base = success(await f.store.read({ reference: h.entry.reference }));
        const text = base.content.replace("- **Depends On:** [none]", `- **Depends On:** \`${dependency.owner.name}\``);
        expect(text).not.toBe(base.content);
        await h.edit(text);
        const bytes = await h.file();
        const refusal = StoreRefusalSchema.parse({ code, class: code === "namespace-corrupt" ? "terminal" : "recoverable",
          ...(code === "namespace-corrupt" ? { namespace: "work-item" } : { reference: dependency,
            historyRefs: ["refs/arc/history/work/00000000-0000-4000-8000-000000000001"] }),
          condition: "The initial dependency evidence is unavailable.",
          remedy: { text: "Restore the exact dependency evidence.", argv: ["arc", "fetch", "--history"] } });
        let failed = true, submissions = 0;
        const store = overrideEngineStore(f.store, {
          lookup: async input => failed && input.kind === "slug" && input.slug === dependency.owner.name
            ? { status: "refused", refusal } : f.store.lookup(input),
          batch: async input => { submissions++; return f.store.batch(input); },
        });
        const context = { ...h.context, store, memo: createHistoryMemo(store), verb: "write-back" as const };
        const prepared = await prepareWriteBack(context, h.request);
        expect(prepared).toMatchObject({ kind: "held", refusal });
        const first = await createWriteBackPort(context)(h.request);
        expect(first).toMatchObject({ answer: "refused", mark: { remedy: code === "state-unresolvable"
          ? { text: expect.stringContaining("Run arc save"), argv: ["arc", "save"] } : refusal.remedy } });
        expect(submissions).toBe(0);
        expect(success(await f.store.read({ reference: h.entry.reference }))).toEqual(base);
        expect(await h.file()).toBe(bytes);
        await other.edit("Independent healthy edit.\n");
        expect((await createWriteBackPort({ ...other.context, store, memo: createHistoryMemo(store) })(other.request)).answer).toBe("taken-in");
        failed = false;
        const retried = await createWriteBackPort(context)({ ...h.request, entry: first.entry });
        expect(retried.answer).toBe("taken-in");
        expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
        expect(await h.file()).toBe(bytes);
        expect(submissions).toBe(2);
      } finally { await h.dispose(); await other.dispose(); }
    });
  }
