/** Candidate-chain comparison reads repository and landed history against the native import report. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createCandidateAttestation, createCandidateVerificationResponseEvidence, serializeCandidateManagedRecord, type CandidateManagedRecordV1 } from "../../src/lib/work-unit/candidate-attestation.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";
import { importCandidatePath } from "../helpers/store/import-candidates.js";
import type { WindowCandidateComparison } from "../../src/scripts/cutover-window/chain-candidate.js";
import { invokeWindow } from "../helpers/cutover-window/run.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { importWindowFixture } from "../helpers/cutover-window/import.js";

function chain(h: Awaited<ReturnType<typeof windowFixture>>, report: string) {
  return invokeWindow(h.root, "chain", ["--report", report]);
}

it("passes equal current records and chains without changing refs", async () => {
  const h = await windowFixture(), report = await importWindowFixture(h);
  const path = join(h.root, ".arc-fixture/import-report.json");
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = await chain(h, path);
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "passed", findings: [], data: { candidates: expect.arrayContaining([
    expect.objectContaining({ workUnit: "alpha", equal: true }),
  ]) } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it("lists report-declared broken chains while preserving a complete archived chain", async () => {
  const h = await windowFixture({ completed: true }), report = await importWindowFixture(h);
  const path = join(h.root, ".arc-fixture/import-report.json");
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  const result = await chain(h, path);
  expect(result, result.report).toMatchObject({ exit: 0, result: { findings: [] } });
  const candidates = (result.result as { data: { candidates: { workUnit: string; equal: boolean; repository: { status: string }; listed: unknown[] }[] } }).data.candidates;
  expect(candidates.find(entry => entry.workUnit === "archived")).toMatchObject({ equal: true, repository: { status: "ok" } });
  for (const name of ["also-archived", "last-archived"]) {
    const candidate = candidates.find(entry => entry.workUnit === name);
    expect(candidate).toMatchObject({ repository: { status: "refused" } });
    expect(candidate?.listed.length).toBeGreaterThan(0);
  }
  expect(result.report).toContain("broken chain");
}, 60_000);

it("rejects extra imported versions even when the current record and links agree, and retries after repair", async () => {
  const h = await windowFixture(), report = await importWindowFixture(h);
  const path = join(h.root, ".arc-fixture/import-report.json");
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  const store = createRefStore(h.ports);
  const read = await store.read({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } }) });
  if (read.status !== "ok") throw new Error(JSON.stringify(read));
  const ref = expandStoredPath(read.result.reference).ref;
  const original = (await h.git("git", ["rev-parse", ref])).stdout.trim();
  const content = JSON.parse(read.result.content) as CandidateManagedRecordV1;
  const provenance = { verb: "save", lifecycleAction: "edit" };
  const changed = await store.write({ action: "put", reference: read.result.reference, expected: read.result.version,
    content: JSON.stringify({ ...content, attestation: createCandidateAttestation({ ...content.attestation, subject: content.subject, verificationEvidenceRef: "verification://unlisted" }) }), provenance });
  if (changed.status !== "ok") throw new Error(JSON.stringify(changed));
  const mismatched = await chain(h, path);
  expect(mismatched, mismatched.report).toMatchObject({ exit: 1 });
  expect(mismatched.report).toContain("Current record differs");
  const latest = await store.read({ reference: read.result.reference });
  if (latest.status !== "ok") throw new Error(JSON.stringify(latest));
  expect(await store.write({ action: "put", reference: read.result.reference, expected: latest.result.version, content: read.result.content, provenance })).toMatchObject({ status: "ok" });
  const result = await chain(h, path);
  expect(result, result.report).toMatchObject({ exit: 1 });
  expect(result.report).toContain("history");
  const changedTip = (await h.git("git", ["rev-parse", ref])).stdout.trim();
  await h.git("git", ["update-ref", ref, original, changedTip]);
  expect(await chain(h, path)).toMatchObject({ exit: 0 });
}, 60_000);

it("stops on a store-only reader refusal even though the native import reports no broken source chain", async () => {
  const h = await windowFixture({ completed: true }), source = importCandidatePath("archived");
  const content = await readFile(join(h.root, source), "utf8");
  await writeFile(join(h.root, source), JSON.stringify({ ...JSON.parse(content), schemaVersion: 99 }));
  await h.git("git", ["add", source]); await h.git("git", ["commit", "-m", "Retain legacy intermediate version"]);
  await writeFile(join(h.root, source), content);
  await h.git("git", ["add", source]); await h.git("git", ["commit", "-m", "Restore valid current Candidate"]);
  await h.git("git", ["push", "origin", "main"]); await mergeMainIntoFixtureFlip(h);
  const report = await importWindowFixture(h), path = join(h.root, ".arc-fixture/import-report.json");
  expect(report.brokenChains.some(entry => entry.reference.owner.name === "archived")).toBe(false);
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  const result = await chain(h, path);
  expect(result, result.report).toMatchObject({ exit: 1 });
  const candidates = (result.result as { data: { candidates: WindowCandidateComparison[] } }).data.candidates;
  const candidate = candidates.find(entry => entry.workUnit === "archived");
  expect(candidate).toMatchObject({ repository: { status: "ok" }, imported: { status: "refused" } });
  expect(candidate?.findings.some(entry => entry.condition.includes("reader outcomes"))).toBe(true);
}, 60_000);

it("accepts report-listed omitted live versions and retains mapped transitions whole", async () => {
  const h = await windowFixture(), source = importCandidatePath("alpha");
  await h.git("git", ["checkout", "feat/alpha"]);
  const record = JSON.parse(await readFile(join(h.root, source), "utf8")) as CandidateManagedRecordV1;
  await writeFile(join(h.root, source), JSON.stringify({ ...record, schemaVersion: 99 }));
  await h.git("git", ["add", source]); await h.git("git", ["commit", "-m", "Retain refused legacy version"]);
  const target = { revision: record.attestation.baseRevision, subject: record.subject };
  record.transitions.push(createCandidateVerificationResponseEvidence({ candidateId: record.attestation.candidateId,
    oldTarget: target, newTarget: target, authorityRef: record.attestation.candidateId, verifiedBy: "andrew",
    verifiedAt: "2026-10-01T12:00:00.000Z", applicability: "full", verificationEvidenceRefs: ["verification://complete"], implementationChanged: false }));
  await writeFile(join(h.root, source), serializeCandidateManagedRecord(record));
  await h.git("git", ["add", source]); await h.git("git", ["commit", "-m", "Record full verification transition"]);
  await h.git("git", ["push", "origin", "feat/alpha"]); await h.git("git", ["checkout", "main"]);
  const report = await importWindowFixture(h, true), path = join(h.root, ".arc-fixture/import-report.json");
  expect(report.reviewMapping.some(entry => entry.source.startsWith(`${source}@`) && entry.outcome === "left-behind")).toBe(true);
  expect(report.reviewMapping.some(entry => entry.source === source && entry.outcome === "mapped")).toBe(true);
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  const result = await chain(h, path);
  expect(result, result.report).toMatchObject({ exit: 0 });
  expect(result.report).toContain("left-behind");
  const stored = await createRefStore(h.ports).read({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "alpha" } }) });
  if (stored.status !== "ok") throw new Error(JSON.stringify(stored));
  expect(JSON.parse(stored.result.content)).toEqual(record);
}, 60_000);

it("refuses a malformed report and continues after the report is repaired", async () => {
  const h = await windowFixture(), report = await importWindowFixture(h);
  const path = join(h.root, ".arc-fixture/import-report.json");
  await writeFile(path, "{truncated");
  const refused = await chain(h, path);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused" } });
  expect(refused.report).toContain("successful import");
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  expect(await chain(h, path)).toMatchObject({ exit: 0 });
}, 60_000);

it("compares full linked records even when semantic links still match", async () => {
  const h = await windowFixture({ completed: true }), report = await importWindowFixture(h);
  const path = join(h.root, ".arc-fixture/import-report.json"), store = createRefStore(h.ports);
  await writeFile(path, JSON.stringify({ status: "ok", result: report }));
  const current = await store.read({ reference: RecordReferenceSchema.parse({ kind: "review/candidate", owner: { type: "work-item", name: "archived" } }) });
  if (current.status !== "ok") throw new Error(JSON.stringify(current));
  const history = await store.history({ reference: current.result.reference });
  if (history.status !== "ok" || !history.result[1]?.content) throw new Error(JSON.stringify(history));
  const predecessor = JSON.parse(history.result[1].content) as CandidateManagedRecordV1;
  const target = { revision: predecessor.attestation.baseRevision, subject: predecessor.subject };
  predecessor.transitions.push(createCandidateVerificationResponseEvidence({ candidateId: predecessor.attestation.candidateId,
    oldTarget: target, newTarget: target, authorityRef: predecessor.attestation.candidateId, verifiedBy: "andrew",
    verifiedAt: "2026-10-01T12:00:00.000Z", applicability: "full", verificationEvidenceRefs: ["verification://unexpected"], implementationChanged: false }));
  const provenance = { verb: "save", lifecycleAction: "edit" };
  const changed = await store.write({ action: "put", reference: current.result.reference, expected: current.result.version,
    content: serializeCandidateManagedRecord(predecessor), provenance });
  if (changed.status !== "ok") throw new Error(JSON.stringify(changed));
  const latest = await store.read({ reference: current.result.reference });
  if (latest.status !== "ok") throw new Error(JSON.stringify(latest));
  expect(await store.write({ action: "put", reference: current.result.reference, expected: latest.result.version, content: current.result.content, provenance })).toMatchObject({ status: "ok" });
  const result = await chain(h, path);
  expect(result, result.report).toMatchObject({ exit: 1 });
  expect(result.report).toContain("Linked record differs");
}, 60_000);
