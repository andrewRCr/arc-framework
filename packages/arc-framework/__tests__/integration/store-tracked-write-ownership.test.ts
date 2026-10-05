/** Canonical competitors and exclusive transition creators retain every accepted write through rollback. */
import { mkdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { atomicWriteFile } from "../../src/lib/fs.js";
import { createCandidateAttestation, parseCandidateManagedRecord, serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord, CandidateRecordVersionConflictError } from "../../src/lib/work-unit/candidate-record-store.js";
import { writeSubmissionBoundary, SubmissionBoundaryVersionConflictError } from "../../src/lib/work-unit/submission-boundary-store.js";
import { parseIntegrationBoundaryLocus } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { writeTransitionRecord } from "../../src/lib/work-unit/transition-record-store.js";
import { serializeTransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import { trackedWriteFixture, trackedDigest, candidateFixture, boundaryFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "edit" };
type CanonicalKind = "review/candidate" | "review/integration-boundary";
function contentFor(kind: CanonicalKind, label: string) {
  if (kind === "review/integration-boundary") {
    const boundary = boundaryFixture();
    boundary.nextAction.interactionText = label;
    return canonicalize(parseIntegrationBoundaryLocus(boundary));
  }
  const candidate = candidateFixture();
  candidate.attestation = createCandidateAttestation({ workUnit: "example", subject: candidate.subject, baseRevision: "a".repeat(40),
    attestedBy: "andrew", attestedAt: "2026-08-12T14:00:00.000Z", verificationEvidenceRef: label });
  return serializeCandidateManagedRecord(candidate);
}
async function canonicalWrite(root: string, kind: CanonicalKind, content: string, expected: string | null, onWait?: () => void) {
  const fs = { readFile: (path: string) => readFile(path, "utf8"), writeFile: atomicWriteFile,
    withLock: <T>(path: string, action: () => Promise<T>) => withAdvisoryLock(path, action, { onWait }) };
  if (kind === "review/candidate") await writeCandidateRecord(root, "example", parseCandidateManagedRecord(content)!, expected, fs);
  else await writeSubmissionBoundary(root, parseIntegrationBoundaryLocus(JSON.parse(content)), expected, fs);
}
async function fixture(kind: CanonicalKind) {
  const h = await trackedWriteFixture();
  const reference = h.reference(kind);
  const before = contentFor(kind, "initial verification");
  const initial = success(await h.store.write({ action: "put", reference, content: before, expected: null, provenance }));
  const path = join(h.root, `.arc/system/.internal/candidates/example${kind === "review/integration-boundary" ? ".boundary" : ""}.json`);
  const laterPath = join(h.root, ".arc/active/meta-later.md");
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  await writeFile(laterPath, "later before");
  return { ...h, reference, before, initial, path, laterPath,
    laterWrite: { action: "put" as const, reference: h.reference("work-item/meta", "later"), content: "later after", expected: trackedDigest("later before"), placement: { kind: "active" as const } } };
}
function contender(root: string, kind: CanonicalKind, content: string, expected: string | null) {
  let releaseObserved!: () => void;
  const reached = new Promise<void>((resolve) => { releaseObserved = resolve; });
  const result = canonicalWrite(root, kind, content, expected, releaseObserved).then(
    () => ({ status: "accepted" as const }), (error: unknown) => ({ status: "refused" as const, error }),
  );
  return { result, reached: Promise.race([reached, result]) };
}
const conflictClass = (kind: CanonicalKind) => kind === "review/candidate" ? CandidateRecordVersionConflictError : SubmissionBoundaryVersionConflictError;

for (const kind of ["review/candidate", "review/integration-boundary"] as const) describe(`${kind} write ownership`, () => {
  it("retains an accepted competitor or refuses it until the complete batch has restored", async () => {
    const h = await fixture(kind);
    const local = contentFor(kind, "local verification");
    const winning = contentFor(kind, "winning verification");
    const primary = new Error("Later record failed");
    const write = h.ports.fs.writeFile;
    let competition: ReturnType<typeof contender> | undefined;
    h.ports.fs.writeFile = async (path, bytes) => {
      if (path === h.laterPath && bytes === "later after") {
        competition = contender(h.root, kind, winning, trackedDigest(local));
        await competition.reached;
        throw primary;
      }
      await write(path, bytes);
    };
    await expect(h.store.batch({ writes: [{ action: "put", reference: h.reference, content: local, expected: h.initial.version! }, h.laterWrite], provenance })).rejects.toMatchObject({ cause: primary });
    expect(competition).toBeDefined();
    const outcome = await competition!.result;
    if (outcome.status === "accepted") expect(await readFile(h.path, "utf8")).toBe(winning);
    else {
      expect(outcome.error).toBeInstanceOf(conflictClass(kind));
      expect(await readFile(h.path, "utf8")).toBe(h.before);
      await canonicalWrite(h.root, kind, winning, trackedDigest(h.before));
      expect(await readFile(h.path, "utf8")).toBe(winning);
    }
    expect(await readFile(h.laterPath, "utf8")).toBe("later before");
  });

  it("serializes digest-bound removal with the existing canonical writer", async () => {
    const h = await fixture(kind);
    const winning = contentFor(kind, "winning verification");
    const read = h.ports.fs.readFile;
    let competition: ReturnType<typeof contender> | undefined;
    h.ports.fs.readFile = async (path) => {
      const bytes = await read(path);
      if (path === h.path && competition === undefined) {
        competition = contender(h.root, kind, winning, trackedDigest(h.before));
        await competition.reached;
      }
      return bytes;
    };
    success(await h.store.write({ action: "remove", reference: h.reference, expected: h.initial.version!, provenance }));
    expect(competition).toBeDefined();
    const outcome = await competition!.result;
    if (outcome.status === "accepted") expect(await readFile(h.path, "utf8")).toBe(winning);
    else {
      expect(outcome.error).toBeInstanceOf(conflictClass(kind));
      await expect(access(h.path)).rejects.toMatchObject({ code: "ENOENT" });
      await canonicalWrite(h.root, kind, winning, null);
      expect(await readFile(h.path, "utf8")).toBe(winning);
    }
  });
});

for (const moment of ["after-removal", "during-restoration", "replace-created"] as const) it(`preserves an exclusive transition accepted ${moment}`, async () => {
  const h = await trackedWriteFixture();
  const reference = h.reference("lineage/transition");
  const beforeRecord = { schemaVersion: 1 as const, origin: "example", kind: "abandon" as const, successors: [], edges: [] };
  const winningRecord = { schemaVersion: 1 as const, origin: "example", kind: "rename" as const, successors: ["next"], edges: [] };
  const before = serializeTransitionRecord(beforeRecord);
  const winning = serializeTransitionRecord(winningRecord);
  const path = join(h.root, ".arc/system/.internal/transitions/example.json");
  if (moment !== "replace-created") success(await h.store.write({ action: "put", reference, content: before, expected: null, provenance }));
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  const laterPath = join(h.root, ".arc/active/meta-later.md");
  await writeFile(laterPath, "later before");
  const primary = new Error("Later record failed");
  const write = h.ports.fs.writeFile;
  const create = h.ports.fs.exclusiveCreate;
  let restoring = false, raced = false;
  h.ports.fs.writeFile = async (target, bytes) => {
    if (target === laterPath && bytes === "later after") {
      if (moment === "replace-created") await unlink(path);
      if (moment !== "during-restoration") await writeTransitionRecord(h.root, winningRecord);
      restoring = true;
      throw primary;
    }
    if (moment === "during-restoration" && restoring && target === path && !raced) { raced = true; await writeTransitionRecord(h.root, winningRecord); }
    await write(target, bytes);
  };
  h.ports.fs.exclusiveCreate = async (target, bytes) => {
    if (moment === "during-restoration" && restoring && target === path && !raced) { raced = true; await writeTransitionRecord(h.root, winningRecord); }
    await create(target, bytes);
  };
  const mutation = moment === "replace-created" ? { action: "put" as const, reference, content: before, expected: null }
    : { action: "remove" as const, reference, expected: trackedDigest(before) };
  let failure: unknown;
  try { await h.store.batch({ writes: [mutation, { action: "put", reference: h.reference("work-item/meta", "later"), content: "later after", expected: trackedDigest("later before"), placement: { kind: "active" } }], provenance }); }
  catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: "store.restore-failed", cause: { errors: [primary, expect.any(Error)] }, message: expect.stringContaining("transitions/example.json") });
  expect(await readFile(path, "utf8")).toBe(winning);
  expect(await readFile(laterPath, "utf8")).toBe("later before");
  h.ports.fs.writeFile = write;
  h.ports.fs.exclusiveCreate = create;
  success(await h.store.write({ action: "remove", reference, expected: trackedDigest(winning), provenance }));
  success(await h.store.write({ action: "put", reference, content: before, expected: null, provenance }));
  expect(await readFile(path, "utf8")).toBe(before);
});
