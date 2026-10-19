/** Checked lifecycle fixtures and explicit batch contention for decomposition. */
import type { Store } from "../../../src/lib/store/contract.js";
import type { StoreRefusal } from "../../../src/lib/store/refusal.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeCohortDocument } from "../../../src/lib/store/kinds/cohort/index.js";
import { writeLineageRecord, type LineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { runStoreRename } from "../../../src/lib/work-unit/verbs/rename-store.js";
import { scriptGitExec } from "../git-exec-fake.js";
import { createLifecycleHarness, lifecycleSuccess } from "./lifecycle-harness.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");
const cohortTemplate = "# Cohort: `{cohort-name}`\n\n**Parent:** {Parent}\n\n**Purpose:** {Purpose}\n";

/** Seed lifecycle identities through production parsers, writers, and write checks. */
export function createDecomposeHarness() {
  const h = createLifecycleHarness();
  const seedStub = (slug: string) => h.seedMeta(slug, { state: "Planning", currentWorkflow: null },
    { kind: "backlog", commitment: "planned" });
  return { ...h, seedStub,
    seedRenamedWorkUnit: async (from: string, to: string): Promise<StoreRecord> => {
      const primary = await seedStub(from);
      const renamed = await runStoreRename({ store: h.store, cwd: "/repo", exec: scriptGitExec([]).exec, baseBranch: "main" },
        { sourceSlug: from, targetSlug: to });
      if (renamed.status !== "renamed") throw new Error(JSON.stringify(renamed));
      return lifecycleSuccess(await h.store.read({ reference: primary.reference }));
    },
    seedRetiredWorkUnit: async (subject: string | StoreRecord, transition: Pick<LineageRecord, "kind" | "successors"> = { kind: "abandon", successors: [] }): Promise<StoreRecord> => {
      if (transition.kind === "rename") throw new Error("Use the rename fixture for a rename.");
      const primary = typeof subject === "string" ? await seedStub(subject) : subject;
      const owner = primary.reference.owner;
      if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a generated work-item identity.");
      const reference = recordReferences["lineage/transition"](owner);
      lifecycleSuccess(await h.store.batch({ provenance: { verb: transition.kind, lifecycleAction: transition.kind }, writes: [
        { action: "put", reference, expected: null, content: writeLineageRecord({ schemaVersion: 2,
          origin: { name: owner.name, uid: owner.uid }, ...transition, incoming: [], retiredBranches: [],
          ...(transition.kind === "decompose" ? { outgoing: [] } : {}) }) },
        { action: "remove", reference: primary.reference, expected: primary.version },
      ] }));
      return lifecycleSuccess(await h.store.read({ reference }));
    },
    seedCompletedWorkUnit: (slug: string): Promise<StoreRecord> => h.seedMeta(slug,
      { state: "Shipped", currentWorkflow: null, completed: "2026-10-01", prUrl: "https://example.test/pull/1" },
      { kind: "completed", quarter }),
    seedCohort: async (path: string, completed = false): Promise<StoreRecord> => {
      const content = writeCohortDocument(cohortTemplate, path, "Shared decomposition coordination.");
      if (content === null) throw new Error(`Invalid cohort fixture path: ${path}`);
      const owner = OwnerIdentitySchema.parse({ type: "cohort", name: path.split("/").at(-1) });
      return h.seed(recordReferences["cohort/document"](owner), content,
        completed ? { kind: "completed", quarter } : undefined);
    },
    handEdit: async (record: StoreRecord, content: string): Promise<StoreRecord> => {
      lifecycleSuccess(await h.store.write({ ...recordPut(record, { content }),
        provenance: { verb: "write-back", lifecycleAction: "edit" } }));
      return lifecycleSuccess(await h.store.read({ reference: record.reference }));
    },
  };
}

/** Inject one competing write at the batch boundary, with explicit cross-namespace refusal support. */
export function withCompetingBatch(store: Store, compete: () => Promise<void>, refusal?: StoreRefusal): Store {
  let armed = true;
  const batch: Store["batch"] = async (input) => {
    if (armed) {
      armed = false;
      await compete();
      if (refusal !== undefined) return { status: "refused", refusal };
    }
    return store.batch(input);
  };
  return new Proxy(store, { get(target, property) {
    if (property === "batch") return batch;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
