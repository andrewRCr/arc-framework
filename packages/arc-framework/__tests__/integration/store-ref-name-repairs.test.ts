/** Typed name clashes retain their repairs through lifecycle and session readers. */
import { expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRefPrimary } from "../helpers/store/ref-primary-plant.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { prepareStoreRename } from "../../src/lib/store/lifecycle-rename.js";
import { runArchive } from "../../src/lib/work-unit/verbs/archive.js";
import { projectCheckoutSubjectMeta } from "../../src/lib/locus/subject-meta.js";
import { readStoreWorkUnitEvidence } from "../../src/lib/locus/store-work-unit-evidence.js";
import type { ExecuteTransitionContext } from "../../src/lib/work-unit/lifecycle-executor.js";

const uidA = "00000000-0000-4000-8000-000000000001", uidB = "00000000-0000-4000-8000-000000000002";
const uidMember = "00000000-0000-4000-8000-000000000003";
const forbidden = async (): Promise<never> => { throw new Error("Unexpected checkout or transition access"); };

it("keeps a lineage write's repair on its ambiguous origin", async () => {
  const f = await createRefFixture();
  for (const uid of [uidA, uidB]) await plantRefPrimary(f, { kind: "work-item/meta", uid, name: "shared" });
  const reference = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "shared" } });
  expect(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), provenance: testProvenance }))
    .toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", remedy: { text: "Name the intended origin by UID, then retry." } } });
});

it.each(["work-item/meta", "work-item/record"] as const)("gives primary and secondary reads and writes the repair for %s holders", async secondKind => {
  const f = await createRefFixture();
  await plantRefPrimary(f, { kind: "work-item/meta", uid: uidA, name: "shared" });
  await plantRefPrimary(f, { kind: secondKind, uid: uidB, name: "shared" });
  for (const kind of ["work-item/meta", "work-item/companion"] as const) {
    const reference = RecordReferenceSchema.parse({ kind, owner: { type: "work-item", name: "shared" },
      ...(kind === "work-item/companion" ? { key: "extra" } : {}) });
    const expected = { status: "refused", refusal: { code: "ambiguous-match", tie: { liveness: "live", name: "current" },
      remedy: secondKind === "work-item/record"
        ? { text: expect.stringContaining(`arc errand close ${uidB}`), argv: ["arc", "errand", "close", uidB] }
        : { text: expect.stringContaining(`arc rename ${uidB} <new-slug>`), argv: ["arc", "status", "--json"] } } };
    expect(await f.store.read({ reference })).toMatchObject(expected);
    expect(await f.store.write({ action: "put", reference, expected: null, content: f.content(reference), ...(kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}), provenance: testProvenance })).toMatchObject(expected);
  }
});

it.each(["frame", "archive", "rename"] as const)("%s names the cohort rename when its member's cohort is clashed", async reader => {
  const f = await createRefFixture();
  for (const uid of [uidA, uidB]) await plantRefPrimary(f, { kind: "cohort/document", uid, name: "shared",
    content: "# Cohort: shared\n\n**Purpose:** Coordinate members.\n" });
  const reference = await plantRefPrimary(f, { kind: "work-item/meta", uid: uidMember, name: "member",
    content: makeMetaFixture("member", { cohort: "shared", owner: "test-user", currentWorkflow: "process-task-loop", taskList: null }) });
  const store = createRefStore({ ...f.ports, registry: createKindRegistry(PRODUCTION_REGISTRATIONS) });
  const primary = success(await store.read({ reference }));
  const repair = `arc rename ${uidA} <new-slug>`;
  if (reader === "rename") {
    expect(await prepareStoreRename(store, { primary, operand: "member", resuming: false, originName: "member", advisories: [] }, "renamed"))
      .toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining(repair) } } });
  } else if (reader === "archive") {
    const executor: ExecuteTransitionContext = { cwd: f.root, store, indexFs: { readdir: forbidden, readFile: forbidden },
      setPhase: forbidden, relocateArtifacts: forbidden, reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden,
      writeSoftFields: forbidden, writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden };
    expect(await runArchive({ executor, fs: { readdir: forbidden }, clock: () => new Date("2026-10-31T00:00:00Z") }, { name: "member" }))
      .toMatchObject({ status: "rejected", refusal: { remedy: { text: expect.stringContaining(repair) } } });
  } else {
    const evidence = await readStoreWorkUnitEvidence({ cwd: f.root, store, projectId: async () => "repo", slug: "member", uid: uidMember, head: "a".repeat(40),
      marker: { spawnedByArc: false, createdFor: boundWorkUnitSubject(primary), spawningIdentity: "test-user", createdAt: new Date(0).toISOString() } });
    if (evidence.kind !== "present") throw new Error(JSON.stringify(evidence));
    await expect(projectCheckoutSubjectMeta({ cwd: f.root, store, workUnit: evidence, subjectKey: "member", identity: "test-user",
      metaRoot: { kind: "maintainer" }, candidates: [], io: {
        readFile: forbidden, pathExists: async () => false, realpath: async path => path, lstat: async () => ({ isSymbolicLink: () => false }),
        projectCandidateTarget: forbidden, readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }),
        projectDeliveryCorrection: async () => ({ status: "none" }),
      } })).rejects.toThrow(repair);
  }
  expect(ParsedMetaRecordSchema.parse(success(await store.read({ reference })).fields).cohort).toBe("shared");
});

it.each(["work-item/meta", "cohort/document"] as const)("reads %s by name within its own family under a cross-family clash", async kind => {
  const f = await createRefFixture();
  await plantRefPrimary(f, { kind: "work-item/meta", uid: uidA, name: "shared" });
  await plantRefPrimary(f, { kind: "cohort/document", uid: uidB, name: "shared" });
  const reference = RecordReferenceSchema.parse({ kind, owner: { type: kind === "cohort/document" ? "cohort" : "work-item", name: "shared" } });
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference: {
    kind, owner: { uid: kind === "cohort/document" ? uidB : uidA },
  } } });
});
