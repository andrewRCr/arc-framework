/** Marker-selected work-unit authority comes from the operational store. */
import { parseTaskListRecord } from "../../../src/lib/store/kinds/task-list/parser.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot, serializeCandidateManagedRecord } from "../../../src/lib/work-unit/candidate-attestation.js";
import { projectPublicationBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectDurableCandidateTarget } from "../../helpers/candidate.js";
import { writeLineageRecord } from "../../../src/lib/store/kinds/lineage/writer.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { parseCohortDocument } from "../../../src/lib/store/kinds/cohort/parser.js";
import { projectCandidateMutationOwner } from "../../../src/lib/work-unit/candidate-mutation-owner.js";
import { recordReferences, OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { readDerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";
import type { WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { describe, expect, it } from "vitest";
import { acquireDerivedLocusEvidence, type DerivedLocusEvidenceIO } from "../../../src/lib/locus/derived-evidence.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance } from "../../helpers/store/suite-tools.js";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

async function fixture() {
  const fixture = createReferenceFixture({}, { "cohort/document": { parser: parseCohortDocument },
    "work-item/task-list": { parser: content => ({ success: true, data: parseTaskListRecord(content) }) } });
  const reference = fixture.reference("work-item/meta");
  const fields = parseMetaRecord(makeMetaFixture(reference.owner.name, { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" }));
  success(await fixture.store.write({ action: "put", reference, content: JSON.stringify(fields), expected: null,
    placement: { kind: "active" }, provenance: testProvenance }));
  const io: DerivedLocusEvidenceIO = {
    store: fixture.store,
    projectId: async () => "project-1",
    scanWorktrees: async () => ({ ok: true, worktrees: [{ path: "/repo", head: "a".repeat(40), primary: true,
      detached: false, branch: "main", folderPresent: true }] }),
    readMarker: async () => {
      const marker: WorktreeMarker = { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-16T12:00:00.000Z",
        createdFor: { kind: "work-unit", name: reference.owner.name } };
      return { kind: "present", bytes: Buffer.from(`${JSON.stringify(marker, null, 2)}\n`), marker };
    },
    listDirectory: async () => { throw new Error("Checkout files are stale"); },
    readText: async () => { throw new Error("Checkout files are stale"); },
    readArchivedMeta: async () => { throw new Error("Checkout archives are stale"); },
    readIdentities: async () => ({ kind: "absent" }),
    readCompleted: async () => ({ status: "available", records: new Map() }),
    readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true }),
    canonicalizePath: async path => path,
  };
  return { fixture, reference, io, fields };
}

describe("store locus evidence", () => {
  it("reads an anchored marker's Planning record without checkout metadata", async () => {
    const { io, reference } = await fixture();
    const result = await acquireDerivedLocusEvidence({ identity: "andrew", io });
    expect(result).toMatchObject({ kind: "complete", checkouts: [{ workUnit: { kind: "present",
      subject: { kind: "work-unit", key: reference.owner.name }, fields: { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" },
      branch: null, record: { placement: { kind: "active" } } } }] });
  });
});

const subjectMetaIO: SubjectMetaIO = {
  readFile: async () => { throw new Error("No projected file"); }, pathExists: async () => false,
  realpath: async path => path, lstat: async () => ({ isSymbolicLink: () => false }),
  projectCandidateTarget: async () => { throw new Error("No Candidate"); },
  readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }),
  projectDeliveryCorrection: async () => ({ status: "none" }),
};

it("derives the marker's branchless Planning role and context from the store", async () => {
  const { io, reference } = await fixture();
  const evidence = await acquireDerivedLocusEvidence({ identity: "andrew", io });
  if (evidence.kind !== "complete") throw new Error("Expected topology");
  const frame = await readDerivedLocusFrame({ ...evidence, identity: "andrew", enteringCheckoutPath: "/repo",
    canonicalizePath: async path => path, subjectMetaIO });
  expect(frame.active).toMatchObject({ subject: { key: reference.owner.name }, context: {
    branch: null, sessionType: "planning", owner: "andrew", metaPath: `.arc/active/meta-${reference.owner.name}.md` } });
});

async function frame(io: DerivedLocusEvidenceIO, metaIO: SubjectMetaIO = subjectMetaIO) {
  const evidence = await acquireDerivedLocusEvidence({ identity: "andrew", io });
  if (evidence.kind !== "complete") throw new Error("Expected topology");
  return readDerivedLocusFrame({ ...evidence, store: io.store, identity: "andrew", enteringCheckoutPath: "/repo",
    canonicalizePath: async path => path, subjectMetaIO: metaIO });
}

it("leaves both checkouts unresolved when two markers name one work unit", async () => {
  const h = await fixture();
  const scan = await h.io.scanWorktrees();
  if (!scan.ok || !scan.worktrees[0]) throw new Error("Expected registration");
  const original = scan.worktrees[0];
  h.io.scanWorktrees = async () => ({ ok: true, worktrees: [original, { ...original, path: "/other", primary: false }] });
  const result = await frame(h.io);
  expect(result.roster.map(row => row.kind)).toEqual(["unresolved-checkout", "unresolved-checkout"]);
  expect(result.roster.every(row => row.diagnostics.some(item => item.code === "work-unit-locus-conflict"))).toBe(true);
});

it("withholds a preselected holder after a failed location lookup and resumes after repair", async () => {
  const h = await fixture(), derived = await frame(h.io);
  const fake = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  let repaired = false;
  const options = { store: h.fixture.store, exec: fake.exec, identity: "andrew", teamMode: false,
    projectId: async () => "project-1", roster: derived.roster,
    findHoldingCheckout: async () => { if (!repaired) throw new Error("Holder evidence is unavailable. Repair the checkout claim and retry."); return "/repo"; } };
  const uncertain = await deriveStoreInFlight(options);
  expect(uncertain.entries).toHaveLength(1);
  expect(uncertain.entries[0]).not.toHaveProperty("worktreePath");
  expect(uncertain.entries[0]).toMatchObject({ marks: expect.arrayContaining(["degraded", "indeterminate"]) });
  expect(uncertain.warnings).toContainEqual(expect.objectContaining({ rendered: expect.stringMatching(/repair.*retry/iu) }));
  repaired = true;
  const healthy = await deriveStoreInFlight(options);
  expect(healthy.entries[0]).toMatchObject({ worktreePath: "/repo" });
  expect(healthy.entries[0]).not.toHaveProperty("marks");
});

it("grants no role when the store inventory misses a work-unit record", async () => {
  const h = await fixture();
  const unrelated = h.fixture.reference("work-item/meta", "other");
  success(await h.fixture.store.write({ action: "put", reference: unrelated, content: JSON.stringify(h.fields), expected: null,
    placement: { kind: "active" }, provenance: testProvenance }));
  await h.fixture.plant(unrelated, "malformed");
  const result = await frame(h.io);
  expect(result.active).toBeNull();
  expect(result.roster[0]).toMatchObject({ kind: "unresolved-checkout", diagnostics: [expect.objectContaining({ message: expect.stringMatching(/incomplete|malformed/iu) })] });
});

async function changeMeta(h: Awaited<ReturnType<typeof fixture>>, change: Partial<typeof h.fields>,
  links?: import("../../../src/lib/store/links.js").Links, completed = false) {
  const record = success(await h.fixture.store.read({ reference: h.reference }));
  success(await h.fixture.store.write({ action: "put", reference: record.reference, expected: record.version,
    content: JSON.stringify({ ...h.fields, ...change }), links,
    placement: completed ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }
      : { kind: "active" }, provenance: testProvenance }));
}

it("carries a paused work unit's pause record in its context", async () => {
  const h = await fixture();
  const pause = { pausedBy: "andrew", since: "2026-10-16T12:00:00.000Z", reason: "Waiting", waitsOn: null, resumeNotes: null, open: false };
  await changeMeta(h, { pause });
  expect((await frame(h.io)).active?.context.pause).toEqual(pause);
});

it("corroborates checkout topology against the qualified branch link", async () => {
  const h = await fixture();
  await changeMeta(h, {}, { branches: [{ repository: "project-1", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  expect((await frame(h.io)).roster[0]).toMatchObject({ kind: "unresolved-checkout", diagnostics: [expect.objectContaining({ code: "topology-mismatch" })] });
});

it("reports ambiguous canonical links rather than granting a subject", async () => {
  const h = await fixture();
  await changeMeta(h, {}, { branches: ["feat/demo", "refs/heads/feat/demo"].map(ref => ({ repository: "project-1", ref, linkedAs: "created", excluded: [] })) });
  expect((await frame(h.io)).roster[0]).toMatchObject({ kind: "unresolved-checkout", diagnostics: [expect.objectContaining({ message: expect.stringContaining("duplicate canonical") })] });
});

it("reports the project identity port's failure as incomplete subject evidence", async () => {
  const h = await fixture();
  h.io.projectId = async () => { throw new Error("Project identity is offline"); };
  expect((await frame(h.io)).roster[0]).toMatchObject({ kind: "unresolved-checkout", diagnostics: [expect.objectContaining({ message: "Project identity is offline" })] });
});

it("binds the project identity reader from the selected store when no port is injected", async () => {
  const h = await fixture();
  const project = await seed(h.fixture, h.fixture.reference("project-registry/identity"));
  if (!("uid" in project.reference.owner) || project.reference.owner.uid === undefined) throw new Error("Expected project UID");
  await changeMeta(h, {}, { branches: [{ repository: project.reference.owner.uid, ref: "main", linkedAs: "adopted", excluded: [] }] });
  h.io.projectId = undefined;
  expect((await frame(h.io)).active?.context.branch).toBe("main");
});

it.each(["manual", "with-integration"] as const)("derives a completed record with a landing link as retired under %s", async archiveCadence => {
  const h = await fixture();
  await changeMeta(h, { state: "Shipped", currentWorkflow: null }, { landingCommit: { repository: "project-1", sha: "b".repeat(40) } }, true);
  h.io.archiveCadence = archiveCadence;
  expect((await frame(h.io)).roster[0]).toMatchObject({ kind: "retired", lifecycleLocation: "completed" });
});

it("keeps an archived unlanded work unit in the integration frame when no base resolves", async () => {
  const h = await fixture();
  await changeMeta(h, { state: "Shipped", currentWorkflow: null }, undefined, true);
  h.io.archiveCadence = "with-integration";
  h.io.baseBranch = "main";
  h.io.exec = async () => { throw new Error("No base ref"); };
  expect((await frame(h.io)).active?.context).toMatchObject({ sessionType: "integration", metaPath: expect.stringMatching(/completed\/2026-q4\/\d+_work-item-one\/meta-work-item-one\.md/u) });
});

it.each(["landed", "multi-commit-squash"])("classifies an externally %s completed work unit with strict patch identity", async outcome => {
  const h = await fixture();
  await changeMeta(h, { state: "Shipped", currentWorkflow: null }, undefined, true);
  h.io.archiveCadence = "with-integration";
  h.io.baseBranch = "main";
  h.io.exec = async (_command, args) => {
    if (args[0] === "rev-parse" && args.at(-1) === "origin/main") return { stdout: "b".repeat(40) };
    if (args[0] === "cherry" && args[1] === "b".repeat(40) && args[2] === "a".repeat(40)) return {
      stdout: outcome === "landed" ? `- ${"c".repeat(40)}\n` : `+ ${"c".repeat(40)}\n+ ${"d".repeat(40)}\n` };
    throw new Error("Unexpected patch identity command");
  };
  expect((await frame(h.io)).roster[0]?.kind).toBe(outcome === "landed" ? "retired" : "work-unit");
});

it("projects the Candidate mutation owner from the store-derived subject", async () => {
  const h = await fixture();
  expect(projectCandidateMutationOwner(await frame(h.io))).toEqual({ status: "owned", workUnit: h.reference.owner.name });
});

it("reads a cohort document through the store and carries none when the document is missing", async () => {
  const h = await fixture();
  await changeMeta(h, { cohort: "group/leaf" });
  expect((await frame(h.io)).active?.context.cohortDocPath).toBeNull();
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "leaf" }));
  success(await h.fixture.store.write({ action: "put", reference, content: "# Cohort: leaf\n\n**Parent:** `group`\n\n## Purpose\n\nCoordinate\n",
    expected: null, provenance: testProvenance }));
  expect((await frame(h.io)).active?.context.cohortDocPath).toBe(".arc/backlog/planned/group/leaf/cohort-leaf.md");
});

it("projects an independently completed cohort from its own later quarter and closeout", async () => {
  const h = await fixture();
  await changeMeta(h, { state: "Shipped", currentWorkflow: null, cohort: "group/leaf" }, undefined, true);
  h.io.archiveCadence = "with-integration";
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "leaf" }));
  success(await h.fixture.store.write({ action: "put", reference, content: "# Cohort: leaf\n\n**Parent:** `group`\n\n## Purpose\n\nCoordinate\n",
    expected: null, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") }, provenance: testProvenance }));
  expect((await frame(h.io)).active?.context.cohortDocPath).toMatch(/^\.arc\/completed\/2027-q1\/\d+a_cohort-leaf\/cohort-leaf\.md$/u);
});

it.each(["abandon", "decompose"] as const)("derives terminal %s lineage as retired without a landing link", async kind => {
  const h = await fixture();
  await changeMeta(h, { state: "Shipped", currentWorkflow: null }, undefined, true);
  h.io.archiveCadence = "with-integration";
  const record = success(await h.fixture.store.read({ reference: h.reference }));
  const origin = { name: record.reference.owner.name, ...("uid" in record.reference.owner ? { uid: record.reference.owner.uid } : {}) };
  const successors = kind === "abandon" ? [] : [{ name: SlugSchema.parse("successor") }];
  const content = writeLineageRecord({ schemaVersion: 2, kind, origin, successors, incoming: [],
    ...(kind === "decompose" ? { outgoing: [] } : {}) });
  success(await h.fixture.store.write({ action: "put", reference: recordReferences["lineage/transition"](record.reference.owner),
    expected: null, content, provenance: testProvenance }));
  expect((await frame(h.io)).roster[0]?.kind).toBe("retired");
});

it("withholds terminal role from disputed lineage even when a completed primary remains", async () => {
  const h = await fixture();
  await changeMeta(h, { state: "Shipped", currentWorkflow: null }, undefined, true);
  h.io.archiveCadence = "with-integration";
  const primary = success(await h.fixture.store.read({ reference: h.reference }));
  const reference = recordReferences["lineage/transition"](primary.reference.owner);
  const origin = { name: primary.reference.owner.name, ...("uid" in primary.reference.owner ? { uid: primary.reference.owner.uid } : {}) };
  const content = (sha: string) => writeLineageRecord({ schemaVersion: 2, kind: "abandon", origin, successors: [], incoming: [],
    retiredBranches: [{ repository: "project-1", ref: "feat/retired", linkedAs: "created", excluded: [{ repository: "project-1", sha }] }] });
  await seed(h.fixture, reference, content("a".repeat(40)));
  const remote = h.fixture.remote(true);
  if (remote === undefined) throw new Error("Expected a remote writer");
  success(await remote.write({ action: "put", reference, expected: null, content: content("c".repeat(40)), provenance: testProvenance }));
  success(await h.fixture.store.sync());
  const disputed = success(await h.fixture.store.read({ reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const unresolved = await frame(h.io);
  expect(unresolved.active).toBeNull();
  expect(unresolved.roster[0]?.kind).toBe("unresolved-checkout");
  const message = unresolved.roster[0]?.diagnostics.map(item => item.message).join(" ") ?? "";
  for (const conflict of disputed.conflicts) expect(message).toContain(JSON.stringify(conflict));
  expect(message).toMatch(/resolve.*retry/iu);
  for (const reference of disputed.conflicts) {
    const conflict = success(await h.fixture.store.read({ reference }));
    success(await h.fixture.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference],
      provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  }
  expect((await frame(h.io)).roster[0]?.kind).toBe("retired");
});

it("recovers an Integrating Candidate's boundary and session type from its work-branch link", async () => {
  const h = await fixture();
  const name = h.reference.owner.name;
  const subject = createCandidateSubjectSnapshot([]);
  const attestation = createCandidateAttestation({ workUnit: name, subject, baseRevision: "a".repeat(40),
    attestedBy: "andrew", attestedAt: "2026-10-16T12:00:00.000Z", verificationEvidenceRef: `tasks-${name}.md#verification` });
  const candidate = serializeCandidateManagedRecord({ schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject, transitions: [], lineageAttestations: [] });
  await changeMeta(h, { state: "Integrating", branch: null, currentWorkflow: "integrate-work-unit", candidateId: attestation.candidateId },
    { branches: [{ repository: "project-1", ref: "main", linkedAs: "adopted", excluded: [] }] });
  const owner = success(await h.fixture.store.read({ reference: h.reference })).reference.owner;
  await seed(h.fixture, recordReferences["review/candidate"](owner), candidate);
  const boundary = projectPublicationBoundary({ workUnit: name, branch: "main", candidateId: attestation.candidateId,
    candidateSubjectDigest: subject.subjectDigest, reservation: null, changeRequest: null });
  const localIO: SubjectMetaIO = { ...subjectMetaIO, projectCandidateTarget: projectDurableCandidateTarget,
    readFile: async path => {
      if (path === `/repo/.arc/system/.internal/candidates/${name}.boundary.json`) return JSON.stringify(boundary);
      throw Object.assign(new Error("Missing projection"), { code: "ENOENT" });
    } };
  expect((await frame(h.io, localIO)).active?.context).toMatchObject({ branch: "main", sessionType: "integration", integrationBoundary: boundary });
});

it("reports an unreadable marker without assigning a role", async () => {
  const h = await fixture();
  h.io.readMarker = async () => { throw new Error("Marker permission denied"); };
  expect((await frame(h.io)).roster[0]).toMatchObject({ kind: "unresolved-checkout",
    diagnostics: [expect.objectContaining({ message: "Marker permission denied" })] });
});

it("reports a failed store inventory without assigning a role", async () => {
  const h = await fixture();
  await h.fixture.plant(h.reference, "family-unreadable");
  expect((await frame(h.io)).roster[0]).toMatchObject({ kind: "unresolved-checkout",
    diagnostics: [expect.objectContaining({ source: "lifecycle", message: expect.stringContaining("family index cannot be read") })] });
});

it("reads the task cursor from the store at its projected artifact path", async () => {
  const h = await fixture();
  const name = h.reference.owner.name;
  await changeMeta(h, { state: "Active", currentWorkflow: "process-task-loop", taskList: `tasks-${name}.md` });
  const primary = success(await h.fixture.store.read({ reference: h.reference }));
  success(await h.fixture.store.write({ action: "put", reference: recordReferences["work-item/task-list"](primary.reference.owner),
    expected: null, content: "## **Phase 1:** Work\n\n### `[ ]` **1.1 Do the work**\n", provenance: testProvenance }));
  expect((await frame(h.io)).active?.context).toMatchObject({ taskListPath: `.arc/active/tasks-${name}.md`,
    taskCursor: { status: "found", cursor: { leaf: { id: "1.1" } } }, sessionType: "execution" });
});

it("withholds a declared missing task list and resumes execution after restoring its record", async () => {
  const h = await fixture(), name = h.reference.owner.name;
  await changeMeta(h, { state: "Active", currentWorkflow: null, taskList: `tasks-${name}.md` });
  const before = success(await h.fixture.store.version()), unresolved = await frame(h.io);
  expect(unresolved.active).toBeNull();
  expect(unresolved.roster[0]).toMatchObject({ kind: "unresolved-checkout", context: null });
  const message = unresolved.roster[0]?.diagnostics.map(item => item.message).join(" ") ?? "";
  expect(message).toContain(`tasks-${name}.md`);
  expect(message).toMatch(/task list.*(unavailable|missing|not.found).*restore.*retry/isu);
  expect(success(await h.fixture.store.version())).toBe(before);
  const primary = success(await h.fixture.store.read({ reference: h.reference }));
  success(await h.fixture.store.write({ action: "put", reference: recordReferences["work-item/task-list"](primary.reference.owner),
    expected: null, content: "## **Phase 1:** Work\n\n### `[ ]` **1.1 Do the work**\n", provenance: testProvenance }));
  expect((await frame(h.io)).active?.context).toMatchObject({ sessionType: "execution", workflow: "process-task-loop",
    taskListPath: `.arc/active/tasks-${name}.md`, taskCursor: { status: "found", cursor: { leaf: { id: "1.1" } } } });
});

it.each([false, true])("offers the correct repair for a no-record marker, spawned=%s", async spawnedByArc => {
  const h = await fixture();
  const record = success(await h.fixture.store.read({ reference: h.reference }));
  success(await h.fixture.store.write({ action: "remove", reference: record.reference, expected: record.version, provenance: testProvenance }));
  const markerRead = h.io.readMarker;
  h.io.readMarker = async path => {
    if (path === "/primary") return { kind: "absent" };
    const observed = await markerRead(path);
    if (observed.kind !== "present") throw new Error("Expected marker");
    return { ...observed, marker: { ...observed.marker, spawnedByArc } };
  };
  h.io.scanWorktrees = async () => ({ ok: true, worktrees: [
    { path: "/primary", head: "a".repeat(40), primary: true, branch: "main", detached: false, folderPresent: true },
    { path: "/repo", head: "a".repeat(40), primary: false, branch: null, detached: true, folderPresent: true },
  ] });
  const result = await frame(h.io);
  const row = result.roster.find(row => row.checkout.path === "/repo");
  expect(row?.actions).toEqual([expect.objectContaining(spawnedByArc
    ? { argv: ["arc", "locus", "release", h.reference.owner.name] }
    : { text: expect.stringContaining(`arc start ${h.reference.owner.name} --new --here`) })]);
});

it("loads the meta once and never a workspace session-notes seed", async () => {
  const h = await fixture();
  const context = (await frame(h.io)).active?.context;
  expect(context?.loadSet.entries.filter(entry => entry.path.includes("meta-"))).toEqual([
    { path: `.arc/active/meta-${h.reference.owner.name}.md`, readMode: { kind: "full" } },
  ]);
  expect(context?.loadSet.entries.some(entry => entry.path.includes("SESSION-NOTES"))).toBe(false);
});

it.each([null, "unrelated-tasks.md"])("uses the task-list record despite the meta pointer %s", async taskList => {
  const h = await fixture();
  await changeMeta(h, { state: "Active", currentWorkflow: "process-task-loop", taskList });
  const primary = success(await h.fixture.store.read({ reference: h.reference }));
  success(await h.fixture.store.write({ action: "put", reference: recordReferences["work-item/task-list"](primary.reference.owner),
    expected: null, content: "## **Phase 1:** Work\n\n### `[ ]` **1.1 Do the work**\n", provenance: testProvenance }));
  const context = (await frame(h.io)).active?.context;
  expect(context?.taskListPath).toBe(`.arc/active/tasks-${h.reference.owner.name}.md`);
  expect(context?.loadSet.entries).toContainEqual({ path: `.arc/active/tasks-${h.reference.owner.name}.md`, readMode: { kind: "partial-strategic" } });
});

it("keeps project Errand discovery separate from absent identity claims", async () => {
  const h = await fixture();
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "repair" }));
  success(await h.fixture.store.write({ action: "put", reference, expected: null, placement: { kind: "active" },
    provenance: testProvenance, content: JSON.stringify({ version: 3, slug: "repair", claimId: "a".repeat(32),
      createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", kind: "errand", purpose: "errand",
      intent: "Repair", branch: "chore/repair", state: "open", savedHead: null, changeRequest: null,
      origin: "description", originEntry: null, owner: "andrew" }) }));
  const result = await frame(h.io);
  expect(result.identityDiscovery).toMatchObject({ kind: "store", errands: { kind: "complete",
    identities: [{ kind: "errand", key: "repair" }], diagnostics: [], missed: false }, claims: { kind: "absent" } });
});

it("binds exact marker corroboration through the Store reader when its Errand inventory omits the subject", async () => {
  const h = await fixture(), slug = "partial-inventory", claimId = "a".repeat(32);
  const reference = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }));
  success(await h.fixture.store.write({ action: "put", reference, expected: null, placement: { kind: "active" }, provenance: testProvenance,
    content: JSON.stringify({ version: 3, slug, claimId, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", kind: "errand", purpose: "errand",
      owner: "andrew", intent: "Repair", branch: `chore/${slug}`, state: "open", savedHead: null, changeRequest: null, origin: "description", originEntry: null }) }));
  const list = h.fixture.store.list.bind(h.fixture.store);
  h.fixture.store.list = async input => {
    const result = await list(input);
    return input.kind === "work-item/record" && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true, records: [] } } : result;
  };
  h.io.scanWorktrees = async () => ({ ok: true, worktrees: [{ path: "/repo", head: "a".repeat(40), primary: true,
    branch: `chore/${slug}`, detached: false, folderPresent: true }] });
  h.io.readMarker = async () => {
    const marker: WorktreeMarker = { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00Z",
      provisioning: "ready", createdFor: { kind: "errand", slug, claimId } };
    return { kind: "present", marker, bytes: Buffer.from(JSON.stringify(marker)) };
  };
  const result = await frame(h.io);
  expect(result.roster[0]).toMatchObject({ kind: "transient", subject: { kind: "errand", key: slug, claimId } });
  expect(result.identityDiscovery).toMatchObject({ kind: "store", errands: { kind: "complete", missed: true, identities: [] } });
});
