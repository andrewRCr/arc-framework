/** Native lifecycle reports and readers share the selected checkout's physical coordinates. */
import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { createKindRegistry, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { runSetStage } from "../../src/lib/work-unit/verbs/set-stage.js";
import { lifecycleRecordPath } from "../../src/lib/store/lifecycle-record-path.js";
import { readActiveMetaCandidates } from "../../src/lib/active/meta-reader.js";
import { resolveStoreViewTarget } from "../../src/handlers/view-store.js";
import { readStoredLifecycleSummary } from "../../src/scripts/integration/lifecycle-record.js";

afterEach(() => { beginProjectionCommand(); });
async function fixture() {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  const reference = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } });
  const primary = await seed(f, reference, makeMetaFixture("alpha", { state: "Planning", currentWorkflow: "draft-design" }));
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the native store's allocated UID");
  await writeWorktreeMarker(f.root, { spawnedByArc: false,
    createdFor: { kind: "work-unit", name: owner.name, uid: owner.uid }, spawningIdentity: "test-owner", createdAt: "2026-11-05T00:00:00Z" });
  return { f, primary };
}
const unsupported = async (): Promise<never> => { throw new Error("Unexpected in-repo field writer"); };

describe("checkout-owned lifecycle paths", () => {
  it("reports the planning-stage write and task list beside the checkout's own meta", async () => {
    const { f, primary } = await fixture();
    const task = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/task-list", owner: primary.reference.owner }), "# Tasks\n");
    const result = await runSetStage({ cwd: f.root, store: f.store,
      writeCurrentWorkflowField: unsupported, writeSoftFields: unsupported }, { name: "alpha", stage: "create-spec" });
    expect(result).toMatchObject({ status: "ok", metaPath: ".arc/active/current/meta-alpha.md" });
    expect(success(await f.store.read({ reference: primary.reference })).fields).toMatchObject({ currentWorkflow: "create-spec" });
    expect(await lifecycleRecordPath(f.root, primary, task)).toBe(".arc/active/current/tasks-alpha.md");
  });

  it("finds the held candidate and view target at the checkout's own location without projected files", async () => {
    const { f, primary } = await fixture();
    const held = await readActiveMetaCandidates(f.root, { store: f.store });
    expect(held.warnings).toEqual([]);
    expect(held.candidates).toMatchObject([{ path: ".arc/active/current/meta-alpha.md" }]);
    const view = await resolveStoreViewTarget({ cwd: f.root, store: f.store, slug: "alpha" });
    expect(view).toMatchObject({ status: "resolved", metaPath: join(f.root, ".arc/active/current/meta-alpha.md") });
    expect(held.owners?.get(".arc/active/current/meta-alpha.md")).toEqual(primary.reference.owner);
  });

  it("projects session context and its load set through the selected checkout's physical placement", async () => {
    const { f } = await fixture();
    const { runDerivedLocusStateProbe } = await import("../../src/handlers/derived-locus-state-probe.js");
    const frame = await runDerivedLocusStateProbe({ cwd: f.root, store: f.store, exec: f.ports.exec,
      identity: "test-owner", projectId: async () => "project", baseBranch: "main" });
    expect(frame.entering).toMatchObject({ kind: "selected", row: { kind: "work-unit", subject: { key: "alpha" },
      context: { kind: "resolved", metaPath: ".arc/active/current/meta-alpha.md", workflow: "planning" } } });
    if (frame.entering.kind !== "selected" || frame.entering.row.context === null) throw new Error("Expected resolved native session context");
    expect(frame.entering.row.context.loadSet.entries).toContainEqual({ path: ".arc/active/current/meta-alpha.md", readMode: { kind: "full" } });
  });

  it("reads the integrating lifecycle summary from native records under the nested layout", async () => {
    const { f, primary } = await fixture();
    const { recordPut } = await import("../../src/lib/store/lifecycle-write.js");
    success(await f.store.write({ ...recordPut(primary, { content: makeMetaFixture("alpha", { state: "Integrating" }) }),
      provenance: { verb: "publish", lifecycleAction: "publish" } }));
    const readSummary = () => readStoredLifecycleSummary({ cwd: f.root, store: f.store, workUnit: "alpha",
      archiveCadence: "manual", storageVersion: primary.version });
    expect((await readSummary()).summary).toMatchObject({ complete: false, artifactFacts: [
      { code: "missing-completion-notes", path: ".arc/active/current/meta-alpha.md" },
    ] });
    const current = success(await f.store.read({ reference: primary.reference }));
    success(await f.store.write({ ...recordPut(current, { content: current.content
      + "\n## Completion Notes\n\nDelivered the work.\n" }), provenance: { verb: "save", lifecycleAction: "edit" } }));
    const observed = await readStoredLifecycleSummary({ cwd: f.root, store: f.store, workUnit: "alpha",
      archiveCadence: "manual", storageVersion: success(await f.store.version()) });
    expect(observed.summary).toMatchObject({ complete: true, position: { phase: "Integrating", location: "active" }, artifactFacts: [] });
  });
});
