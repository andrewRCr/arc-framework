/** Typed review access composes the actual repository backend and canonical writers. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { canonicalize, digestBytes } from "../../src/lib/kernel/canonical/canonical-json.js";
import { serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import * as candidate from "../../src/lib/store/kinds/review/candidate/access.js";
import * as boundary from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { CandidateRecordVersionConflictError, SubmissionBoundaryVersionConflictError } from
  "../../src/lib/store/kinds/review/errors.js";
import { parseIntegrationBoundaryLocus } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { trackedWriteFixture, candidateFixture, boundaryFixture } from "../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

async function fixture() {
  const h = await trackedWriteFixture();
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  await writeFile(join(h.root, ".arc/active/meta-example.md"), makeMetaFixture("example"));
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "Save owner"]);
  return h;
}

it.each(["supplied", "opened"])("round-trips Candidate bytes through the %s repository store", async (mode) => {
  const h = await fixture();
  const cwd = mode === "supplied" ? join(h.root, "unavailable") : h.root;
  const options = mode === "supplied" ? { store: h.store } : { exec: h.exec };
  const record = candidateFixture();
  await expect(candidate.readCandidateRecordVersioned(cwd, "example", options)).resolves.toEqual({ record: null, version: null });
  const path = await candidate.writeCandidateRecord(cwd, "example", record, null, options);
  expect(path).toBe(".arc/system/.internal/candidates/example.json");
  const version = digestBytes(Buffer.from(await readFile(join(h.root, path))));
  await expect(candidate.readCandidateRecordVersioned(cwd, "example", options)).resolves.toEqual({ record, version });
  await expect(candidate.readCandidateRecordVersion(cwd, "example", options)).resolves.toBe(version);
  await expect(candidate.writeCandidateRecord(cwd, "example", record, null, options))
    .rejects.toBeInstanceOf(CandidateRecordVersionConflictError);
  await expect(candidate.readCandidateRecord(cwd, "example", options)).resolves.toEqual(record);
  await expect(candidate.writeCandidateRecord(cwd, "example", record, version, options)).resolves.toBe(path);
});

it.each(["supplied", "opened"])("round-trips boundary bytes through the %s repository store", async (mode) => {
  const h = await fixture();
  const cwd = mode === "supplied" ? join(h.root, "unavailable") : h.root;
  const options = mode === "supplied" ? { store: h.store } : { exec: h.exec };
  const value = parseIntegrationBoundaryLocus(boundaryFixture());
  await expect(boundary.readSubmissionBoundaryVersioned(cwd, "example", options)).resolves.toEqual({ boundary: null, version: null });
  const path = await boundary.writeSubmissionBoundary(cwd, value, null, options);
  expect(path).toBe(".arc/system/.internal/candidates/example.boundary.json");
  const version = digestBytes(Buffer.from(await readFile(join(h.root, path))));
  await expect(boundary.readSubmissionBoundaryVersioned(cwd, "example", options)).resolves.toEqual({ boundary: value, version });
  await expect(boundary.writeSubmissionBoundary(cwd, value, null, options))
    .rejects.toBeInstanceOf(SubmissionBoundaryVersionConflictError);
  await expect(boundary.readSubmissionBoundary(cwd, "example", options)).resolves.toEqual(value);
  await expect(boundary.writeSubmissionBoundary(cwd, value, version, options)).resolves.toBe(path);
});

it.each(["supplied", "opened"])("reports files keyed to another work unit as the file readers do, through the %s repository store",
  async (mode) => {
    const h = await fixture();
    const options = mode === "supplied" ? { store: h.store } : { exec: h.exec };
    const candidatePath = ".arc/system/.internal/candidates/example.json";
    const boundaryPath = ".arc/system/.internal/candidates/example.boundary.json";
    await mkdir(dirname(join(h.root, candidatePath)), { recursive: true });
    const misKeyed = serializeCandidateManagedRecord(candidateFixture("other"));
    await writeFile(join(h.root, candidatePath), misKeyed);
    await writeFile(join(h.root, boundaryPath), canonicalize(parseIntegrationBoundaryLocus(boundaryFixture("other"))));
    await expect(candidate.readCandidateRecordVersioned(h.root, "example", options))
      .rejects.toThrow(`Candidate record work unit does not match its path: ${candidatePath}`);
    await expect(candidate.readCandidateRecordVersion(h.root, "example", options)).resolves.toBe(digestBytes(Buffer.from(misKeyed)));
    await expect(boundary.readSubmissionBoundaryVersioned(h.root, "example", options))
      .rejects.toThrow("Submission boundary work unit does not match its path");
    const record = candidateFixture(), value = parseIntegrationBoundaryLocus(boundaryFixture());
    await writeFile(join(h.root, candidatePath), serializeCandidateManagedRecord(record));
    await writeFile(join(h.root, boundaryPath), canonicalize(value));
    await expect(candidate.readCandidateRecord(h.root, "example", options)).resolves.toEqual(record);
    await expect(boundary.readSubmissionBoundary(h.root, "example", options)).resolves.toEqual(value);
  });

it("includes Candidate and boundary puts in the caller's atomic batch", async () => {
  const h = await fixture();
  const record = candidateFixture();
  const value = parseIntegrationBoundaryLocus(boundaryFixture());
  await expect(h.store.batch({ writes: [candidate.prepareCandidateRecordPut("example", record, null),
    boundary.prepareSubmissionBoundaryPut(value, null)], provenance: { verb: "publish-candidate", lifecycleAction: "edit" } }))
    .resolves.toMatchObject({ status: "ok" });
  await expect(candidate.readCandidateRecord("/unavailable", "example", { store: h.store })).resolves.toEqual(record);
  await expect(boundary.readSubmissionBoundary("/unavailable", "example", { store: h.store })).resolves.toEqual(value);
});
