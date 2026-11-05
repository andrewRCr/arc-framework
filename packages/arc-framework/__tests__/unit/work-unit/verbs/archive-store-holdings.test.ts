/** Archive publishes its member while retaining and reporting former-name cohort holders. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import { runArchive } from "../../../../src/lib/work-unit/verbs/archive.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";

const cohortContent = (name: string, parent?: string) => `# Cohort: \`${name}\`\n\n**Purpose:** Deliver the group.\n${parent === undefined ? "" : `\n**Parent:** \`${parent}\`\n`}`;
function archive(store: Store, name: string) {
  const forbidden = async (): Promise<never> => { throw new Error("Unexpected tracked artifact access"); };
  const executor: ExecuteTransitionContext = { cwd: "/repo", store, indexFs: { readdir: forbidden, readFile: forbidden },
    setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
    writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
  return runArchive({ executor, fs: { readdir: forbidden }, clock: () => new Date("2026-10-14T12:00:00Z") }, { name });
}
async function fixture(nested = false) {
  const h = createLifecycleHarness();
  const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "former" })), cohortContent("former"));
  const held = await h.seedMeta("straggler", { state: "Planning", currentWorkflow: null, cohort: "former" }, { kind: "backlog", commitment: "planned" });
  const renamed = RecordReferenceSchema.parse({ ...group.reference, owner: { ...group.reference.owner, name: "current" } });
  lifecycleSuccess(await h.store.write({ ...recordPut(group, { content: cohortContent("current") }), reference: renamed,
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const child = nested ? await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "leaf" })),
    cohortContent("leaf", "current")) : undefined;
  const subject = await h.seedMeta("subject", { cohort: nested ? "current/leaf" : "current" });
  return { ...h, group: renamed, held, subject, child };
}

it("archives a current member and reports the former-name stub once on both the first run and rerun", async () => {
  const h = await fixture();
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await archive(h.store, "subject");
    expect(result).toMatchObject({ status: "archived", cohortSwept: null });
    if (result.status !== "archived") throw new Error("Expected archive completion");
    const warnings = result.warnings.filter(warning => warning.includes("straggler"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Cohort "former" -> "current"');
    const owner = h.held.reference.owner;
    if (owner.type === "person" || owner.uid === undefined) throw new Error("Expected holding UID");
    expect(warnings[0]).toContain(owner.uid);
    expect(lifecycleSuccess(await h.store.read({ reference: h.group })).placement?.kind).not.toBe("completed");
    expect(lifecycleSuccess(await h.store.read({ reference: h.subject.reference })).placement?.kind).toBe("completed");
    expect(lifecycleSuccess(await h.store.read({ reference: h.held.reference }))).toEqual(h.held);
  }
});

it("reports the former-name stub once after recovering a persisted archive's publication", async () => {
  const h = await fixture(), remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  remote.condition = "down";
  expect(await archive(h.store, "subject")).toMatchObject({ status: "rejected", persisted: true });
  const completed = lifecycleSuccess(await h.store.read({ reference: h.subject.reference }));
  const history = lifecycleSuccess(await h.store.history({ reference: h.subject.reference }));
  remote.condition = "available";
  const result = await archive(h.store, "subject");
  expect(result).toMatchObject({ status: "archived", cohortSwept: null });
  if (result.status !== "archived") throw new Error("Expected recovered archive");
  expect(result.warnings.filter(warning => warning.includes("straggler"))).toHaveLength(1);
  expect(lifecycleSuccess(await h.store.read({ reference: h.subject.reference }))).toEqual(completed);
  expect(lifecycleSuccess(await h.store.history({ reference: h.subject.reference }))).toEqual(history);
});

it("closes the nested child and reports its parent held through a former name once on rerun", async () => {
  const h = await fixture(true);
  if (h.child === undefined) throw new Error("Expected a nested child");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await archive(h.store, "subject");
    expect(result).toMatchObject({ status: "archived", cohortSwept: expect.stringContaining("cohort-leaf"), nestedParentSwept: null });
    if (result.status !== "archived") throw new Error("Expected nested archive");
    expect(result.warnings.filter(warning => warning.includes("straggler"))).toHaveLength(1);
    expect(lifecycleSuccess(await h.store.read({ reference: h.group })).placement?.kind).not.toBe("completed");
    expect(lifecycleSuccess(await h.store.read({ reference: h.child.reference })).placement?.kind).toBe("completed");
  }
});
