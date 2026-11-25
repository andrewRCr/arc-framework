/** Semantic hand-edit decisions observe cohort authority and fresh lookup precedence. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, seed, update } from "../helpers/store/suite-tools.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { cohortDoc } from "../helpers/store/cohort-rule-input.js";
import { writeMetaCohort } from "../../src/lib/store/kinds/meta/writers.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/identity.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
for (const backend of ["reference", "default", "separate"] as const) for (const family of ["Parent", "precedence"] as const)
  for (const related of [true, false]) {
    it(`rechecks semantic evidence while allowing unused rows: ${backend}/${family}/${related}`, async () => {
      const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
      const h = await createWriteBackFixture({ fixture: f, kind: "work-item/meta" });
      try {
        const base = success(await f.store.read({ reference: h.entry.reference }));
        let text: string, perturb: () => Promise<() => Promise<void>>;
        if (family === "Parent") {
          const cohort = (name: string) => recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
          await seed(f, cohort("parent"), cohortDoc("parent").content);
          const other = await seed(f, cohort("other"), cohortDoc("other").content);
          const child = await seed(f, cohort("child"), cohortDoc("child", "parent").content);
          text = writeMetaCohort(base.content, "parent/child") + "\nAuthored membership note.\n";
          perturb = async () => {
            const target = related ? child : other;
            success(await f.store.write(update(f, target, related ? cohortDoc("child", "other").content : target.content + "\nUnused note.\n")));
            return async () => { const current = success(await f.store.read({ reference: target.reference }));
              success(await f.store.write(update(f, current, target.content))); };
          };
        } else {
          const dependency = f.reference("work-item/meta", "dependency");
          const archived = await seed(f, dependency, makeMetaFixture(dependency.owner.name, { owner: "test-user", state: "Shipped",
            workClass: "Light", priority: "P1", currentWorkflow: null }), { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
          text = base.content.replace("- **Depends On:** [none]", `- **Depends On:** \`${archived.reference.owner.name}\``)
            + "\nAuthored dependency note.\n";
          expect(text).toContain(`- **Depends On:** \`${archived.reference.owner.name}\``);
          perturb = async () => {
            const incoming = related ? dependency : f.reference("work-item/meta", "unused");
            const created = await seed(f, incoming, makeMetaFixture(incoming.owner.name, { owner: "test-user", state: "Active",
              workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
            expect(success(await f.store.read({ reference: archived.reference }))).toEqual(archived);
            return async () => { success(await f.store.write({ action: "remove", reference: created.reference, expected: created.version,
              provenance: { verb: "abandon", lifecycleAction: "remove" } })); };
          };
        }
        await h.edit(text);
        const bytes = await h.file();
        const prepare = async () => {
          const ready = await prepareWriteBack(h.context, h.request);
          if (ready.kind !== "ready") throw new Error(`Semantic edit held: ${JSON.stringify(ready)}`);
          return success(await prepareIndexedProjectionSubmission(h.context, h.request, ready));
        };
        const prepared = await prepare(), repair = await perturb();
        const result = await f.store.batch(prepared.batch);
        if (related) {
          expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
          expect(success(await f.store.read({ reference: h.entry.reference }))).toEqual(base);
          expect(await h.file()).toBe(bytes);
          await repair();
          success(await f.store.batch((await prepare()).batch));
        } else expect(result.status).toBe("ok");
        expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
      } finally { await h.dispose(); }
    });
  }


for (const backend of ["reference", "default", "separate"] as const)
  for (const participant of ["open-member", "open-cohort", "completed-member"] as const) {
    it(`binds validated Parent inventory rows: ${backend}/${participant}`, async () => {
      const f = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, registry) : await createRefFixture(registry, backend);
      const cohort = (name: string) => recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
      await seed(f, cohort("parent"), cohortDoc("parent").content);
      const content = "# Cohort: `cohort-one`\n\n**Parent:** [none]\n\n**Purpose:** Coordinate the work.\n\n---\n";
      const h = await createWriteBackFixture({ fixture: f, kind: "cohort/document", content });
      try {
        const completed = participant === "completed-member";
        const observed = participant === "open-cohort"
          ? await seed(f, cohort("other"), cohortDoc("other").content)
          : await seed(f, f.reference("work-item/meta", "observed"), makeMetaFixture("work-item-observed", {
            owner: "test-user", state: completed ? "Shipped" : "Active", workClass: "Light", priority: "P1",
            currentWorkflow: completed ? null : "process-task-loop" }),
          completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
        const text = content.replace("**Parent:** [none]", "**Parent:** `parent`") + "\nAuthored nesting note.\n";
        await h.edit(text);
        const prepare = async () => {
          const ready = await prepareWriteBack(h.context, h.request);
          if (ready.kind !== "ready") throw new Error(JSON.stringify(ready));
          return success(await prepareIndexedProjectionSubmission(h.context, h.request, ready));
        };
        const prepared = await prepare(), base = success(await f.store.read({ reference: h.entry.reference })), bytes = await h.file();
        success(await f.store.write(update(f, observed, observed.content + "\nConcurrent prose note.\n")));
        const result = await f.store.batch(prepared.batch);
        if (!completed) {
          expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", cause: "projection-admission" } });
          expect(success(await f.store.read({ reference: h.entry.reference }))).toEqual(base);
          expect(await h.file()).toBe(bytes);
          success(await f.store.batch((await prepare()).batch));
        } else expect(result.status).toBe("ok");
        expect(success(await f.store.read({ reference: h.entry.reference })).content).toBe(text);
      } finally { await h.dispose(); }
    });
  }
