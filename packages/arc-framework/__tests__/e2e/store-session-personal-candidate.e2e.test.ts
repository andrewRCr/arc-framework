/** Candidate orientation follows the exact persisted record and its conflict authority. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

import { git, runArc } from "./helpers.js";
import { seedWorkUnit, seededWorkUnitSubject } from "../helpers/store/seed-work-unit.js";
import { codeRefs, competingStoreWriter, expectExit, fixtureStore, markerPath,
  SESSION_COMMAND_TIMEOUT_MS, sessionIdentity, sessionRepo, stored } from "../helpers/store-session-personal-fixture.js";
import { SessionInitProbeResultSchema } from "../../src/commands/status/schema.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot, serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";

const args = ["--skip-projection", "status", "--session-init", "--json"];

function candidate(head: string, attestedBy: string) {
  const subject = createCandidateSubjectSnapshot([{ path: `src/${attestedBy}.ts`, mode: "100644",
    digest: `sha256:${"d".repeat(64)}`, treatment: "reviewable" }]);
  const attestation = createCandidateAttestation({ workUnit: "candidate-subject", subject, baseRevision: head, attestedBy,
    attestedAt: "2026-10-16T12:00:00Z", verificationEvidenceRef: "tasks-candidate-subject.md#verification" });
  return { id: attestation.candidateId, content: serializeCandidateManagedRecord({ schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", attestation, subject, transitions: [], lineageAttestations: [] }) };
}

it("ignores checkout Candidate bytes when Store authority is missing or conflicted and resumes after repair", async () => {
  const root = await sessionRepo();
  const head = await git(root, ["rev-parse", "HEAD"]);
  const branch = "feat/candidate-subject";
  await git(root, ["switch", "-c", branch]);
  const local = candidate(head, "checkout-author");
  const canonical = candidate(head, "stored-author");
  const { meta } = await seedWorkUnit(root, "candidate-subject", { identity: sessionIdentity, branch, bind: root,
    meta: { owner: sessionIdentity, branch, state: "Active", currentWorkflow: "prepare-work-unit",
      candidateId: local.id, taskList: "tasks-candidate-subject.md" },
    taskList: "# Task List: Candidate\n\n### `[x]` **1.1 Verify work**\n" });
  const reference = recordReferences["review/candidate"](meta.reference.owner);
  const store = fixtureStore(root);
  const primary = stored(await store.read({ reference: meta.reference }));
  const marker = await readFile(markerPath(root));
  const candidatePath = join(root, ".arc", "system", ".internal", "candidates", "candidate-subject.json");
  await mkdir(dirname(candidatePath), { recursive: true });
  await writeFile(candidatePath, local.content);
  const orient = async () => {
    const result = await runArc(args, root);
    expectExit(args, result);
    return SessionInitProbeResultSchema.parse(JSON.parse(result.stdout));
  };
  const { name, uid } = seededWorkUnitSubject(meta);
  const bound = { kind: "work-unit", key: name, uid };
  const checkCheckout = async (refs: string) => {
    expect(await readFile(candidatePath, "utf8")).toBe(local.content);
    expect(await readFile(markerPath(root))).toEqual(marker);
    expect(await codeRefs(root)).toBe(refs);
    expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
    expect(stored(await store.read({ reference: meta.reference }))).toEqual(primary);
  };
  const initialRefs = await codeRefs(root);
  const absent = stored(await store.version());
  expect(await orient()).toMatchObject({ derivedLocusState: { ok: true, value: { entering: {
    kind: "selected", row: { kind: "work-unit", subject: bound, context: { integrationBoundary: null } },
  } } } });
  expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(stored(await store.version())).toBe(absent);
  await checkCheckout(initialRefs);

  const put = { action: "put" as const, reference, provenance: { verb: "attest", lifecycleAction: "attest" } };
  stored(await store.write({ ...put, expected: null, content: canonical.content }));
  expect(await orient()).toMatchObject({ derivedLocusState: { ok: true, value: { entering: { row: {
    subject: bound, context: { sessionType: "prepublication", integrationBoundary: { candidateId: canonical.id } },
  } } } } });
  const winner = stored(await store.read({ reference }));
  expect(winner.content).toBe(canonical.content);

  const rival = await competingStoreWriter(root, store);
  const incoming = stored(await rival.read({ reference }));
  stored(await store.write({ ...put, expected: winner.version, content: candidate(head, "local-edit").content }));
  stored(await rival.write({ ...put, expected: incoming.version, content: candidate(head, "remote-edit").content }));
  stored(await rival.push());
  stored(await store.pull());
  const conflicted = stored(await store.read({ reference }));
  expect(conflicted.conflicts).toHaveLength(1);
  const before = stored(await store.version());
  const refs = await codeRefs(root);

  expect(await orient()).toMatchObject({ derivedLocusState: { ok: true, value: { entering: { row: {
    kind: "unresolved-checkout", subject: bound, context: null,
    diagnostics: expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/Candidate.*unresolved conflicts.*Resolve/iu) })]),
  } } } } });
  expect(stored(await store.read({ reference }))).toEqual(conflicted);
  expect(stored(await store.version())).toBe(before);
  await checkCheckout(refs);

  stored(await store.write({ ...put, expected: conflicted.version, resolves: conflicted.conflicts, content: canonical.content,
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await orient()).toMatchObject({ derivedLocusState: { ok: true, value: { entering: { row: {
    kind: "work-unit", subject: bound, context: { integrationBoundary: { candidateId: canonical.id } },
  } } } } });
  expect(stored(await store.read({ reference }))).toMatchObject({ reference, conflicts: [], content: canonical.content });
  await checkCheckout(refs);
}, SESSION_COMMAND_TIMEOUT_MS);
